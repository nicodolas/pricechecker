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

# Tọa độ trung tâm các quận — dùng chung
DISTRICT_COORDS = {
    1:   (10.7769, 106.7009),
    2:   (10.7873, 106.7516),
    3:   (10.7780, 106.6892),
    4:   (10.7574, 106.7029),
    5:   (10.7540, 106.6580),
    6:   (10.7478, 106.6342),
    7:   (10.7301, 106.7218),
    8:   (10.7237, 106.6508),
    9:   (10.8233, 106.8076),
    10:  (10.7737, 106.6681),
    11:  (10.7631, 106.6509),
    12:  (10.8652, 106.6580),
    13:  (10.8120, 106.7086),  # Bình Thạnh
    14:  (10.8383, 106.6654),  # Gò Vấp
    15:  (10.7988, 106.6798),  # Phú Nhuận
    16:  (10.8031, 106.6520),  # Tân Bình
    17:  (10.7917, 106.6262),  # Tân Phú
    18:  (10.8706, 106.7516),  # Thủ Đức
    101: (21.0285, 105.8542),  # Hoàn Kiếm
    102: (21.0245, 105.8412),  # Đống Đa
    103: (21.0164, 105.8590),  # Hai Bà Trưng
    104: (21.0359, 105.7933),  # Cầu Giấy
    105: (20.9889, 105.8073),  # Thanh Xuân
    106: (20.9757, 105.8636),  # Hoàng Mai
    201: (16.0678, 108.2208),  # Hải Châu
    202: (16.0735, 108.1953),  # Thanh Khê
    203: (16.0673, 108.2379),  # Sơn Trà
    204: (15.9891, 108.2518),  # Ngũ Hành Sơn
}


class GrabWorker(BaseWorker):
    app_name = 'grab'

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
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                viewport={'width': 390, 'height': 844},
                locale='vi-VN',
                timezone_id='Asia/Ho_Chi_Minh',
            )
            page = context.new_page()

            # Intercept API responses
            api_responses = []

            def handle_response(response):
                url = response.url
                if ('grab.com' in url or 'grabfood' in url) and response.status == 200:
                    ct = response.headers.get('content-type', '')
                    if 'json' in ct:
                        try:
                            data = response.json()
                            api_responses.append(data)
                        except Exception:
                            pass

            page.on('response', handle_response)

            try:
                url = f"https://food.grab.com/vn/vi/search?query=com&lat={lat}&lng={lng}"
                self.logger.info(f"Opening {url}")
                page.goto(url, wait_until='domcontentloaded', timeout=30000)

                # Đợi JS load
                time.sleep(5)

                if 'captcha' in page.title().lower():
                    raise BlockedError("Grab captcha detected")

                # Scroll để trigger lazy load
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2)

                # Parse từ intercepted API responses
                for response_data in api_responses:
                    items = self._extract_items(response_data)
                    dishes.extend(items)

                self.logger.info(f"Intercepted {len(api_responses)} API responses, {len(dishes)} dishes so far")

                # Fallback: parse từ __NEXT_DATA__
                if not dishes:
                    dishes = self._parse_next_data(page)

                # Fallback 2: parse HTML
                if not dishes:
                    dishes = self._parse_html(page)

            except PlaywrightTimeout:
                self.logger.warning("Page timeout")
            except BlockedError as e:
                raise
            except Exception as e:
                self.logger.error(f"Unexpected error: {e}")
            finally:
                browser.close()

        self.logger.info(f"Grab: found {len(dishes)} dishes in district {district_id}")
        return dishes

    def _extract_items(self, data: dict) -> list[DishData]:
        dishes = []
        try:
            # Nhiều possible paths trong Grab API
            merchants = (
                data.get('searchResult', {}).get('searchMerchants') or
                data.get('searchMerchants') or
                data.get('data', {}).get('searchMerchants') or
                []
            )

            for merchant in merchants:
                restaurant_name = merchant.get('name', '') or merchant.get('displayName', '')
                restaurant_id = merchant.get('id', '') or merchant.get('merchantID', '')

                # Tìm menu items ở nhiều vị trí khác nhau
                items = (
                    merchant.get('cardContent', {}).get('recommendedItems') or
                    merchant.get('menu', {}).get('items') or
                    merchant.get('recommendedItems') or
                    []
                )

                for item in items:
                    price = (
                        item.get('price', {}).get('amount') or
                        item.get('discountedPrice') or
                        item.get('price')
                    )
                    if not price or int(price) <= 0:
                        continue

                    dishes.append(DishData(
                        restaurant_name=restaurant_name,
                        app_restaurant_id=str(restaurant_id),
                        dish_name=item.get('name', ''),
                        price=int(price),
                        original_price=item.get('price', {}).get('originalAmount'),
                        image_url=item.get('imgUrl'),
                        deep_link=f"https://food.grab.com/vn/vi/restaurant/{restaurant_id}",
                    ))
        except Exception as e:
            self.logger.warning(f"API parse error: {e}")
        return dishes

    def _parse_next_data(self, page) -> list[DishData]:
        dishes = []
        try:
            next_data = page.evaluate("""
                () => {
                    const el = document.getElementById('__NEXT_DATA__');
                    return el ? el.textContent : null;
                }
            """)
            if next_data:
                data = json.loads(next_data)
                # Tìm merchantList trong state
                state = data.get('props', {}).get('initialState', {})
                merchants = (
                    state.get('page', {}).get('pageResult', {}).get('searchResult', {}).get('searchMerchants') or
                    []
                )
                dishes = self._extract_items({'searchMerchants': merchants})
        except Exception as e:
            self.logger.warning(f"__NEXT_DATA__ parse error: {e}")
        return dishes

    def _parse_html(self, page) -> list[DishData]:
        dishes = []
        try:
            cards = page.query_selector_all('[data-testid="restaurant-card"], .restaurant-card, [class*="MerchantCard"]')
            self.logger.info(f"Found {len(cards)} HTML cards")
            for card in cards:
                name_el = card.query_selector('[data-testid="restaurant-name"], [class*="merchantName"]')
                price_el = card.query_selector('[data-testid="item-price"], [class*="price"]')
                if name_el and price_el:
                    price_text = price_el.inner_text().replace('.', '').replace('đ', '').replace(',', '').strip()
                    try:
                        price = int(''.join(filter(str.isdigit, price_text)))
                        if price > 0:
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
