"""
Scheduler: Chạy tất cả workers theo lịch.

Usage:
    python scheduler.py                          # Chạy liên tục mỗi 30 phút
    python scheduler.py --once                   # Chạy 1 lần tất cả quận
    python scheduler.py --once --district-id 1  # Chạy 1 quận cụ thể (cho GitHub Actions)
"""

import os
import schedule
import time
import logging
import argparse
import psycopg2
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

from grab_worker import GrabWorker
from shopee_worker import ShopeeFoodWorker
from baemin_worker import BaeminWorker

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')
logger = logging.getLogger('scheduler')


def get_active_district_ids() -> list[int]:
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute("SELECT id FROM districts ORDER BY id")
    ids = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()
    return ids


def run_district(district_id: int):
    """Chạy 3 workers cho 1 quận."""
    workers = [GrabWorker(), ShopeeFoodWorker(), BaeminWorker()]
    logger.info(f"Scraping district {district_id}...")

    with ThreadPoolExecutor(max_workers=3) as executor:
        for worker in workers:
            executor.submit(worker.run, district_id)

    logger.info(f"District {district_id} done")


def run_all_workers():
    """Chạy tất cả quận."""
    district_ids = get_active_district_ids()
    logger.info(f"Starting scrape for {len(district_ids)} districts")

    with ThreadPoolExecutor(max_workers=6) as executor:
        for district_id in district_ids:
            executor.submit(run_district, district_id)

    logger.info("All workers finished")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Chạy 1 lần rồi thoát')
    parser.add_argument('--district-id', type=int, help='Chỉ chạy 1 quận (dùng cho GitHub Actions)')
    args = parser.parse_args()

    if args.once:
        if args.district_id:
            # GitHub Actions mode: chỉ 1 quận
            run_district(args.district_id)
        else:
            run_all_workers()
    else:
        run_all_workers()
        schedule.every(30).minutes.do(run_all_workers)
        logger.info("Scheduler started — running every 30 minutes")
        while True:
            schedule.run_pending()
            time.sleep(60)
