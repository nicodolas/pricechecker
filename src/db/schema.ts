import { pgTable, text, integer, timestamp, real, boolean, uuid, index } from 'drizzle-orm/pg-core'

// Tỉnh/thành phố
export const provinces = pgTable('provinces', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
})

// Quận/huyện
export const districts = pgTable('districts', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    provinceId: integer('province_id').references(() => provinces.id).notNull(),
}, (t) => ({
    provinceIdx: index('district_province_idx').on(t.provinceId),
}))

// Nhà hàng (mỗi app có bản ghi riêng)
export const restaurants = pgTable('restaurants', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    app: text('app').notNull(), // 'grab' | 'shopee' | 'baemin'
    appRestaurantId: text('app_restaurant_id').notNull(), // ID gốc trên app
    districtId: integer('district_id').references(() => districts.id).notNull(),
    address: text('address'),
    imageUrl: text('image_url'),
    deepLink: text('deep_link'), // link mở thẳng app
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    appDistrictIdx: index('restaurant_app_district_idx').on(t.app, t.districtId),
}))

// Món ăn raw từ từng app
export const dishes = pgTable('dishes', {
    id: uuid('id').defaultRandom().primaryKey(),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id).notNull(),
    name: text('name').notNull(),       // tên gốc trên app
    price: integer('price').notNull(),  // VND
    originalPrice: integer('original_price'), // giá gốc nếu đang giảm
    imageUrl: text('image_url'),
    deepLink: text('deep_link'),
    isAvailable: boolean('is_available').default(true),
    lastScrapedAt: timestamp('last_scraped_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    restaurantIdx: index('dish_restaurant_idx').on(t.restaurantId),
}))

// Mapping món ăn giữa các app (cùng nhà hàng)
export const dishMappings = pgTable('dish_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    // canonical dish (đại diện)
    canonicalName: text('canonical_name').notNull(),
    // các dish id được map vào nhóm này
    dishIds: text('dish_ids').array().notNull(), // array of dish UUIDs
    similarityScore: real('similarity_score'), // score NLP gợi ý
    status: text('status').default('pending'), // 'pending' | 'confirmed' | 'rejected'
    confirmedBy: text('confirmed_by'), // github username contributor
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Lịch sử giá
export const priceHistory = pgTable('price_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    dishId: uuid('dish_id').references(() => dishes.id).notNull(),
    price: integer('price').notNull(),
    recordedAt: timestamp('recorded_at').defaultNow(),
}, (t) => ({
    dishTimeIdx: index('price_history_dish_time_idx').on(t.dishId, t.recordedAt),
}))

// Scraper job log
export const scraperLogs = pgTable('scraper_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    app: text('app').notNull(),
    districtId: integer('district_id'),
    status: text('status').notNull(), // 'success' | 'failed' | 'blocked'
    itemsScraped: integer('items_scraped').default(0),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at').defaultNow(),
    finishedAt: timestamp('finished_at'),
})
