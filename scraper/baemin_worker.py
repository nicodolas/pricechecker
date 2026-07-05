"""
Baemin Scraper Worker

Contributor guide:
- Nếu Baemin thay đổi API/UI, chỉ cần sửa file này
- Test: python baemin_worker.py --district-id 1
"""

import json
import time
import argparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from base_worker import BaseWorker, DishData, BlockedError
from grab_worker import DISTRICT_COORDS


class BaeminWorker(BaseWorker):
    app_name = 'baemin'

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
                user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
                viewport={'width': 390, 'height': 844},
                locale='vi-VN',
                timezone_id='Asia/Ho_Chi_Minh',
            )
            page = context.new_page()

            api_responses = []

            def handle_response(response):
                url = response.url
                if 'baemin' in url and response.status == 200:
                    ct = response.headers.get('content-type', '')
                    if 'json' in ct:
                        try:
                            data = response.json()
                            api_responses.append(data)
                        except Exception:
                            pass

            page.on('response', handle_response)

            try:
                url = f"https://baemin.vn/search?query=com&latitude={lat}&longitude={lng}"
                self.logger.info(f"Opening {url}")
                page.goto(url, wait_until='domcontentloaded', timeout=30000)
                time.sleep(5)

                if 'captcha' in page.title().lower():
                    raise BlockedError("Baemin captcha detected")

                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2)

                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

                self.logger.info(f"Intercepted {len(api_responses)} API responses, {len(dishes)} dishes so far")

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            except BlockedError:
                raise
            except Exception as e:
                self.logger.error(f"Unexpected error: {e}")
            finally:
                browser.close()

        self.logger.info(f"Baemin: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        dishes = []
        try:
            restaurants = (
                data.get('data', {}).get('contents') or
                data.get('data', {}).get('storeList') or
                data.get('contents') or
                []
            )

            for restaurant in restaurants:
                restaurant_name = restaurant.get('displayName') or restaurant.get('name', '')
                restaurant_id = str(restaurant.get('storeId') or restaurant.get('id', ''))

                menu_items = (
                    restaurant.get('topMenu') or
                    restaurant.get('menus') or
                    []
                )

                for item in menu_items:
                    price = item.get('salePrice') or item.get('price')
                    if not price or int(price) <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=restaurant_id,
                        dish_name=item.get('name', ''),
                        price=int(price),
                        original_price=item.get('originalPrice'),
                        image_url=item.get('imgUrl') or item.get('imageUrl'),
                        deep_link=f"https://baemin.vn/restaurant/{restaurant_id}",
                    ))
        except Exception as e:
            self.logger.warning(f"API parse error: {e}")
        return dishes


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--district-id', type=int, default=1)
    args = parser.parse_args()

    worker = BaeminWorker()
    worker.run(args.district_id)
