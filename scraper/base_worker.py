"""
Base class cho tất cả scraper workers.
Mỗi app (Grab, ShopeeFood, Baemin) kế thừa class này.
"""

import os
import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional
import psycopg2
import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s'
)


class DishData:
    def __init__(
        self,
        restaurant_name: str,
        app_restaurant_id: str,
        dish_name: str,
        price: int,
        original_price: Optional[int] = None,
        image_url: Optional[str] = None,
        deep_link: Optional[str] = None,
    ):
        self.restaurant_name = restaurant_name
        self.app_restaurant_id = app_restaurant_id
        self.dish_name = dish_name
        self.price = price
        self.original_price = original_price
        self.image_url = image_url
        self.deep_link = deep_link


class BaseWorker(ABC):
    """
    Base scraper worker. Implement scrape_district() trong subclass.
    """
    app_name: str  # 'grab' | 'shopee' | 'baemin'

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.db_url = os.environ['DATABASE_URL']
        self.redis_url = os.environ['UPSTASH_REDIS_REST_URL']
        self.redis_token = os.environ['UPSTASH_REDIS_REST_TOKEN']
        self.max_retries = 3

    def get_db_conn(self):
        return psycopg2.connect(self.db_url)

    def invalidate_cache(self, district_id: int):
        """Xóa cache Redis cho quận này sau khi scrape xong."""
        try:
            # Upstash Redis REST API
            headers = {'Authorization': f'Bearer {self.redis_token}'}
            # Xóa các key liên quan — dùng SCAN pattern
            with httpx.Client() as client:
                # Xóa key scraper status
                client.get(
                    f"{self.redis_url}/del/scraper:status:{self.app_name}:{district_id}",
                    headers=headers
                )
                self.logger.info(f"Cleared cache for {self.app_name} district {district_id}")
        except Exception as e:
            self.logger.warning(f"Cache invalidation failed: {e}")

    def save_to_db(self, district_id: int, dishes: list[DishData]):
        """Lưu kết quả scrape vào PostgreSQL."""
        conn = self.get_db_conn()
        cur = conn.cursor()
        saved = 0

        try:
            for dish in dishes:
                # Upsert nhà hàng
                cur.execute("""
                    INSERT INTO restaurants (name, app, app_restaurant_id, district_id, is_active, updated_at)
                    VALUES (%s, %s, %s, %s, true, NOW())
                    ON CONFLICT (app, app_restaurant_id)
                    DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
                    RETURNING id
                """, (dish.restaurant_name, self.app_name, dish.app_restaurant_id, district_id))

                restaurant_id = cur.fetchone()[0]

                # Upsert món ăn
                cur.execute("""
                    INSERT INTO dishes (restaurant_id, name, price, original_price, image_url, deep_link, is_available, last_scraped_at)
                    VALUES (%s, %s, %s, %s, %s, %s, true, NOW())
                    ON CONFLICT (restaurant_id, name)
                    DO UPDATE SET
                        price = EXCLUDED.price,
                        original_price = EXCLUDED.original_price,
                        image_url = EXCLUDED.image_url,
                        deep_link = EXCLUDED.deep_link,
                        is_available = true,
                        last_scraped_at = NOW()
                    RETURNING id
                """, (
                    restaurant_id, dish.dish_name, dish.price,
                    dish.original_price, dish.image_url, dish.deep_link
                ))

                dish_id = cur.fetchone()[0]

                # Lưu lịch sử giá
                cur.execute("""
                    INSERT INTO price_history (dish_id, price, recorded_at)
                    VALUES (%s, %s, NOW())
                """, (dish_id, dish.price))

                saved += 1

            conn.commit()
            self.logger.info(f"Saved {saved} dishes for district {district_id}")
        except Exception as e:
            conn.rollback()
            self.logger.error(f"DB save error: {e}")
            raise
        finally:
            cur.close()
            conn.close()

        return saved

    def log_scrape(self, district_id: int, status: str, items: int = 0, error: str = None):
        """Ghi log kết quả scrape."""
        conn = self.get_db_conn()
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO scraper_logs (app, district_id, status, items_scraped, error_message, started_at, finished_at)
                VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            """, (self.app_name, district_id, status, items, error))
            conn.commit()
        finally:
            cur.close()
            conn.close()

    def run(self, district_id: int):
        """Chạy scrape cho một quận. Retry tối đa 3 lần."""
        for attempt in range(1, self.max_retries + 1):
            try:
                self.logger.info(f"Scraping {self.app_name} district {district_id} (attempt {attempt})")
                dishes = self.scrape_district(district_id)
                saved = self.save_to_db(district_id, dishes)
                self.invalidate_cache(district_id)
                self.log_scrape(district_id, 'success', saved)
                self.logger.info(f"✅ Done: {saved} items")
                return
            except BlockedError:
                self.logger.warning(f"🚫 Bị block (attempt {attempt})")
                self.log_scrape(district_id, 'blocked', error='Anti-bot triggered')
                if attempt == self.max_retries:
                    return  # Dùng dữ liệu cũ
            except Exception as e:
                self.logger.error(f"❌ Error (attempt {attempt}): {e}")
                if attempt == self.max_retries:
                    self.log_scrape(district_id, 'failed', error=str(e))

    @abstractmethod
    def scrape_district(self, district_id: int) -> list[DishData]:
        """Scrape tất cả món ăn trong một quận. Implement trong subclass."""
        pass


class BlockedError(Exception):
    """Raise khi phát hiện bị anti-bot block."""
    pass
