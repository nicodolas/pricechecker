"""
Baemin Scraper Worker

Contributor guide:
- Nếu Baemin thay đổi API/UI, chỉ cần sửa file này
- Test: python baemin_worker.py --district-id 1
"""

import time
import argparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from base_worker import BaseWorker, DishData, BlockedError


class BaeminWorker(BaseWorker):
    app_name = 'baemin'

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
                user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
                viewport={'width': 390, 'height': 844},
                locale='vi-VN',
            )
            page = context.new_page()

            api_responses = []

            def handle_response(response):
                if 'baemin.vn' in response.url and ('food' in response.url or 'search' in response.url):
                    try:
                        data = response.json()
                        api_responses.append(data)
                    except Exception:
                        pass

            page.on('response', handle_response)

            try:
                url = f"https://baemin.vn/search?query=com&latitude={lat}&longitude={lng}"
                page.goto(url, wait_until='networkidle', timeout=30000)

                if 'captcha' in page.title().lower():
                    raise BlockedError("Baemin captcha detected")

                time.sleep(3)

                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            finally:
                browser.close()

        self.logger.info(f"Baemin: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        dishes = []
        try:
            items = data.get('data', {}).get('items', [])
            for item in items:
                restaurant = item.get('restaurant', {})
                restaurant_name = restaurant.get('name', '')
                restaurant_id = str(restaurant.get('id', ''))

                for menu_item in item.get('menu_items', []):
                    price = menu_item.get('price', 0)
                    if price <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=restaurant_id,
                        dish_name=menu_item.get('name', ''),
                        price=int(price),
                        original_price=menu_item.get('original_price'),
                        image_url=menu_item.get('image'),
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
