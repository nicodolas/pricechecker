"""
ShopeeFood Scraper Worker

Contributor guide:
- Nếu Shopee thay đổi API/UI, chỉ cần sửa file này
- Test: python shopee_worker.py --district-id 1
"""

import time
import argparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from base_worker import BaseWorker, DishData, BlockedError


class ShopeeFoodWorker(BaseWorker):
    app_name = 'shopee'

    DISTRICT_COORDS = {
        1: (10.7769, 106.7009),
        3: (10.7780, 106.6892),
        5: (10.7540, 106.6580),
    }

    def scrape_district(self, district_id: int) -> list[DishData]:
        coords = self.DISTRICT_COORDS.get(district_id)
        if not coords:
            return []

        lat, lng = coords
        dishes = []

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
            )
            context = browser.new_context(
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                viewport={'width': 390, 'height': 844},
                locale='vi-VN',
            )
            page = context.new_page()

            api_responses = []

            def handle_response(response):
                if 'shopeefood.vn' in response.url and 'search' in response.url:
                    try:
                        data = response.json()
                        api_responses.append(data)
                    except Exception:
                        pass

            page.on('response', handle_response)

            try:
                url = f"https://shopeefood.vn/ho-chi-minh/food/tim-kiem?q=com&lat={lat}&lng={lng}"
                page.goto(url, wait_until='networkidle', timeout=30000)

                if 'captcha' in page.title().lower():
                    raise BlockedError("ShopeeFood captcha detected")

                time.sleep(3)

                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            finally:
                browser.close()

        self.logger.info(f"ShopeeFood: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        dishes = []
        try:
            # ShopeeFood API structure
            result = data.get('result', {})
            delivery_products = result.get('delivery_product', [])

            for product in delivery_products:
                restaurant = product.get('restaurant', {})
                restaurant_name = restaurant.get('name', '')
                restaurant_id = str(restaurant.get('id', ''))

                for item in product.get('products', []):
                    price = item.get('price', 0)
                    if price <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=restaurant_id,
                        dish_name=item.get('name', ''),
                        price=int(price),
                        original_price=item.get('price_before_discount'),
                        image_url=item.get('image_url'),
                        deep_link=f"https://shopeefood.vn/restaurant/{restaurant_id}",
                    ))
        except Exception as e:
            self.logger.warning(f"API parse error: {e}")
        return dishes


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--district-id', type=int, default=1)
    args = parser.parse_args()

    worker = ShopeeFoodWorker()
    worker.run(args.district_id)
