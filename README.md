# 🍜 So Sánh Giá Đồ Ăn

So sánh giá món ăn trên **GrabFood, ShopeeFood và Baemin** theo quận/huyện.

Open source · Miễn phí · Cộng đồng maintain

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, Tailwind CSS |
| API | Next.js API Routes |
| Database | Neon PostgreSQL |
| Cache | Upstash Redis |
| Scraper | Python + Playwright |
| NLP Matching | sentence-transformers |

---

## Setup Nhanh

### 1. Clone & cài dependencies

```bash
git clone https://github.com/your-username/food-price-compare
cd food-price-compare
npm install
```

### 2. Cấu hình biến môi trường

```bash
cp .env.example .env.local
```

Điền vào `.env.local`:

```
DATABASE_URL=postgresql://...  # Neon connection string
UPSTASH_REDIS_REST_URL=https://...  # Từ upstash.com
UPSTASH_REDIS_REST_TOKEN=...
```

#### Tạo Upstash Redis (miễn phí):
1. Vào [upstash.com](https://upstash.com) → Create Database
2. Chọn region: **Singapore** (gần VN nhất)
3. Copy **REST URL** và **REST Token** vào `.env.local`

### 3. Chạy database migration

```bash
# Tạo bảng và seed dữ liệu tỉnh/quận
psql $DATABASE_URL -f scripts/migrate.sql
```

### 4. Chạy web

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)

---

## Setup Scraper

```bash
cd scraper
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# Điền DATABASE_URL và UPSTASH vào scraper/.env

# Test scrape 1 quận
python grab_worker.py --district-id 1
python shopee_worker.py --district-id 1
python baemin_worker.py --district-id 1

# Chạy scheduler (tự động mỗi 30 phút)
python scheduler.py

# Hoặc chạy 1 lần
python scheduler.py --once
```

### Chạy NLP matching sau khi có dữ liệu

```bash
python matcher.py --district-id 1
# Hoặc tất cả quận
python matcher.py --all
```

---

## Cấu trúc Project

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Trang chính
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── search/route.ts   # API tìm kiếm
│   │       ├── provinces/route.ts
│   │       └── districts/route.ts
│   ├── components/
│   │   ├── LocationPicker.tsx    # Chọn tỉnh/quận
│   │   ├── SearchBar.tsx
│   │   ├── PriceCard.tsx         # Card so sánh giá
│   │   └── SearchResults.tsx
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts
│   └── lib/
│       ├── redis.ts              # Upstash Redis client
│       └── types.ts
├── scraper/
│   ├── base_worker.py            # Base class
│   ├── grab_worker.py            # GrabFood scraper
│   ├── shopee_worker.py          # ShopeeFood scraper
│   ├── baemin_worker.py          # Baemin scraper
│   ├── matcher.py                # NLP matching engine
│   └── scheduler.py             # Cron scheduler
├── scripts/
│   └── migrate.sql               # DB migration
└── docs/
    └── design.md                 # Design document
```

---

## Contribute

Mỗi scraper worker là **1 file riêng biệt** — dễ fix khi app thay đổi UI:

- `scraper/grab_worker.py` → Fix Grab
- `scraper/shopee_worker.py` → Fix ShopeeFood  
- `scraper/baemin_worker.py` → Fix Baemin

Khi thêm quận mới, cập nhật `DISTRICT_COORDS` trong mỗi worker.

### Review dish mappings

Các mapping chưa được xác nhận (status = `pending`) có thể review trong DB:

```sql
SELECT canonical_name, dish_ids, similarity_score
FROM dish_mappings
WHERE status = 'pending'
ORDER BY similarity_score DESC;

-- Confirm mapping
UPDATE dish_mappings SET status = 'confirmed', confirmed_by = 'your-github'
WHERE id = '...';
```

---

## License

MIT
