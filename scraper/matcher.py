"""
Matching Engine: Dùng NLP để match món ăn giữa các app.

Usage:
    python matcher.py --district-id 1
    python matcher.py --all
"""

import os
import argparse
import logging
import psycopg2
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')
logger = logging.getLogger('matcher')

# Model nhẹ, multilingual, hỗ trợ tiếng Việt tốt
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

AUTO_CONFIRM_THRESHOLD = 0.85   # Tự động confirm
SUGGEST_THRESHOLD = 0.60        # Đưa vào queue chờ xác nhận


def get_db_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def match_district(district_id: int):
    """Match các món ăn cùng nhà hàng, khác app trong một quận."""
    logger.info(f"Loading NLP model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)

    conn = get_db_conn()
    cur = conn.cursor()

    # Lấy tất cả món theo nhà hàng trong quận
    cur.execute("""
        SELECT d.id, d.name, r.name as restaurant_name, r.app, r.app_restaurant_id
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE r.district_id = %s AND d.is_available = true
        ORDER BY r.name, d.name
    """, (district_id,))

    rows = cur.fetchall()
    if not rows:
        logger.info("No dishes found")
        return

    # Group theo tên nhà hàng
    from collections import defaultdict
    by_restaurant = defaultdict(list)
    for row in rows:
        dish_id, dish_name, rest_name, app, app_rest_id = row
        by_restaurant[rest_name].append({
            'id': dish_id,
            'name': dish_name,
            'app': app,
        })

    matched = 0
    queued = 0

    for restaurant_name, dishes in by_restaurant.items():
        # Chỉ match nếu có >= 2 app
        apps_present = set(d['app'] for d in dishes)
        if len(apps_present) < 2:
            continue

        # Tính embeddings
        names = [d['name'] for d in dishes]
        embeddings = model.encode(names, normalize_embeddings=True)

        # So sánh từng cặp
        n = len(dishes)
        for i in range(n):
            for j in range(i + 1, n):
                # Chỉ so sánh nếu khác app
                if dishes[i]['app'] == dishes[j]['app']:
                    continue

                score = float(cosine_similarity([embeddings[i]], [embeddings[j]])[0][0])

                if score >= AUTO_CONFIRM_THRESHOLD:
                    # Auto confirm
                    canonical = dishes[i]['name'] if len(dishes[i]['name']) <= len(dishes[j]['name']) else dishes[j]['name']
                    _save_mapping(cur, canonical, [dishes[i]['id'], dishes[j]['id']], score, 'confirmed')
                    matched += 1
                elif score >= SUGGEST_THRESHOLD:
                    # Queue chờ review
                    canonical = dishes[i]['name']
                    _save_mapping(cur, canonical, [dishes[i]['id'], dishes[j]['id']], score, 'pending')
                    queued += 1

    conn.commit()
    cur.close()
    conn.close()

    logger.info(f"✅ Auto-confirmed: {matched} | ⏳ Queued for review: {queued}")


def _save_mapping(cur, canonical_name: str, dish_ids: list, score: float, status: str):
    """Lưu hoặc update dish mapping."""
    dish_ids_str = '{' + ','.join(f'"{id}"' for id in dish_ids) + '}'
    cur.execute("""
        INSERT INTO dish_mappings (canonical_name, dish_ids, similarity_score, status, updated_at)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT DO NOTHING
    """, (canonical_name, dish_ids_str, score, status))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--district-id', type=int)
    parser.add_argument('--all', action='store_true', help='Match tất cả quận')
    args = parser.parse_args()

    if args.all:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM districts")
        ids = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        for district_id in ids:
            match_district(district_id)
    elif args.district_id:
        match_district(args.district_id)
    else:
        parser.print_help()
