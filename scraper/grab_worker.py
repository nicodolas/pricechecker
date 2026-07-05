"""
GrabFood Scraper Worker
Scrape món ăn và giá từ GrabFood theo quận.

Contributor guide:
- Nếu Grab thay đổi API/UI, chỉ cần sửa file này
- Test: python grab_worker.py --district-id 1
"""

import json
import time
import argparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from base_worker import BaseWorker, DishData, BlockedError


class GrabWorker(BaseWorker):
    app_name = 'grab'

    # Tọa độ trung tâm của các quận (sẽ được query từ DB)
    # Tạm thời hardcode để demo — sau này query từ districts table
    DISTRICT_COORDS = {
        1: (10.7769, 106.7009),   # Quận 1, TP.HCM
        3: (10.7780, 106.6892),   # Quận 3
        5: (10.7540, 106.6580),   # Quận 5
        # ... thêm quận khác
    }

    def scrape_district(self, district_id: int) -> list[DishData]:
        coords = self.DISTRICT_COORDS.get(district_id)
        if not coords:
            self.logger.warning(f"No coords for district {district_id}")
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

            # Intercept API responses
            api_responses = []

            def handle_response(response):
                if 'grabfood.com' in response.url and '/search' in response.url:
                    try:
                        data = response.json()
                        api_responses.append(data)
                    except Exception:
                        pass

            page.on('response', handle_response)

            try:
                # Mở trang tìm kiếm GrabFood
                url = f"https://food.grab.com/vn/vi/search?query=com&lat={lat}&lng={lng}"
                page.goto(url, wait_until='networkidle', timeout=30000)

                # Kiểm tra bị block
                if 'captcha' in page.title().lower() or 'block' in page.title().lower():
                    raise BlockedError("Grab returned captcha page")

                # Đợi kết quả load
                time.sleep(3)

                # Parse từ API responses đã intercept
                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

                # Fallback: parse HTML nếu không có API response
                if not dishes:
                    dishes = self._parse_html(page)

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            finally:
                browser.close()

        self.logger.info(f"Grab: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        """Parse dữ liệu từ Grab API response."""
        dishes = []
        try:
            # Grab API structure (có thể thay đổi)
            restaurants = data.get('searchResult', {}).get('items', [])
            for restaurant in restaurants:
                restaurant_name = restaurant.get('name', '')
                restaurant_id = restaurant.get('id', '')
                menu_items = restaurant.get('menu', {}).get('items', [])

                for item in menu_items:
                    price_data = item.get('price', {})
                    price = price_data.get('amount', 0)
                    original_price = price_data.get('originalAmount')

                    if price <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=restaurant_id,
                        dish_name=item.get('name', ''),
                        price=int(price),
                        original_price=int(original_price) if original_price else None,
                        image_url=item.get('imgUrl'),
                        deep_link=f"https://food.grab.com/vn/vi/restaurant/{restaurant_id}",
                    ))
        except Exception as e:
            self.logger.warning(f"API parse error: {e}")
        return dishes

    def _parse_html(self, page) -> list[DishData]:
        """Fallback: parse HTML trực tiếp."""
        dishes = []
        try:
            cards = page.query_selector_all('[data-testid="restaurant-card"]')
            for card in cards:
                name_el = card.query_selector('[data-testid="restaurant-name"]')
                price_el = card.query_selector('[data-testid="item-price"]')
                if name_el and price_el:
                    price_text = price_el.inner_text().replace('.', '').replace('đ', '').strip()
                    try:
                        price = int(price_text)
                        dishes.append(DishData(
                            restaurant_name='Unknown',
                            app_restaurant_id='unknown',
                            dish_name=name_el.inner_text(),
                            price=price,
                        ))
                    except ValueError:
                        pass
        except Exception as e:
            self.logger.warning(f"HTML parse error: {e}")
        return dishes


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--district-id', type=int, default=1)
    args = parser.parse_args()

    worker = GrabWorker()
    worker.run(args.district_id)
