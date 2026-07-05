"""
ShopeeFood Scraper Worker

Contributor guide:
- Nếu Shopee thay đổi API/UI, chỉ cần sửa file này
- Test: python shopee_worker.py --district-id 1
"""

import json
import time
import argparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from base_worker import BaseWorker, DishData, BlockedError
from grab_worker import DISTRICT_COORDS


class ShopeeFoodWorker(BaseWorker):
    app_name = 'shopee'

    def scrape_district(self, district_id: int) -> list[DishData]:
        coords = DISTRICT_COORDS.get(district_id)
        if not coords:
            self.logger.warning(f"No coords for district {district_id}")
            return []

        lat, lng = coords
        dishes = []

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                ]
            )
            context = browser.new_context(
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                viewport={'width': 390, 'height': 844},
                locale='vi-VN',
                timezone_id='Asia/Ho_Chi_Minh',
            )
            page = context.new_page()

            api_responses = []

            def handle_response(response):
                url = response.url
                if ('shopeefood' in url or 'deliverynow' in url or 'foody' in url) and response.status == 200:
                    ct = response.headers.get('content-type', '')
                    if 'json' in ct:
                        try:
                            data = response.json()
                            api_responses.append(data)
                        except Exception:
                            pass

            page.on('response', handle_response)

            try:
                url = f"https://shopeefood.vn/ho-chi-minh/food/tim-kiem?q=com&lat={lat}&lng={lng}"
                self.logger.info(f"Opening {url}")
                page.goto(url, wait_until='domcontentloaded', timeout=30000)
                time.sleep(5)

                if 'captcha' in page.title().lower():
                    raise BlockedError("ShopeeFood captcha detected")

                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2)

                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

                self.logger.info(f"Intercepted {len(api_responses)} API responses, {len(dishes)} dishes so far")

                if not dishes:
                    dishes = self._parse_html(page)

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            except BlockedError:
                raise
            except Exception as e:
                self.logger.error(f"Unexpected error: {e}")
            finally:
                browser.close()

        self.logger.info(f"ShopeeFood: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        dishes = []
        try:
            # Nhiều possible paths trong ShopeeFood API
            restaurants = (
                data.get('reply', {}).get('delivery_list') or
                data.get('result', {}).get('delivery_product') or
                data.get('delivery_list') or
                []
            )

            for restaurant in restaurants:
                restaurant_name = restaurant.get('name', '')
                restaurant_id = str(restaurant.get('id', ''))

                top_dishes = (
                    restaurant.get('top_dishes') or
                    restaurant.get('dishes') or
                    []
                )

                for dish in top_dishes:
                    price = dish.get('price') or dish.get('total_price')
                    if not price or int(price) <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=restaurant_id,
                        dish_name=dish.get('name', ''),
                        price=int(price),
                        original_price=None,
                        image_url=(dish.get('photos') or [{}])[0].get('value'),
                        deep_link=f"https://shopeefood.vn/restaurant/{restaurant_id}",
                    ))
        except Exception as e:
            self.logger.warning(f"API parse error: {e}")
        return dishes

    def _parse_html(self, page) -> list[DishData]:
        dishes = []
        try:
            cards = page.query_selector_all('[class*="restaurant-item"], [class*="RestaurantCard"], [class*="store-item"]')
            self.logger.info(f"Found {len(cards)} HTML cards")
        except Exception as e:
            self.logger.warning(f"HTML parse error: {e}")
        return dishes


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--district-id', type=int, default=1)
    args = parser.parse_args()

    worker = ShopeeFoodWorker()
    worker.run(args.district_id)
