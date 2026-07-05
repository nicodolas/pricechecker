/**
 * Firecrawl scraper service
 * Dùng Firecrawl API để cào dữ liệu từ Grab, ShopeeFood, Baemin
 */

import FirecrawlApp from '@mendable/firecrawl-js'

export type AppName = 'grab' | 'shopee' | 'baemin'

export interface ScrapedDish {
    restaurantName: string
    appRestaurantId: string
    dishName: string
    price: number
    originalPrice?: number | null
    imageUrl?: string | null
    deepLink?: string | null
    app: AppName
}

// Schema JSON để Firecrawl extract đúng cấu trúc
const MENU_SCHEMA = {
    type: 'object',
    properties: {
        restaurants: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                price: { type: 'number' },
                                originalPrice: { type: 'number' },
                                imageUrl: { type: 'string' },
                            },
                            required: ['name', 'price'],
                        },
                    },
                },
                required: ['name', 'items'],
            },
        },
    },
    required: ['restaurants'],
}

// Tọa độ trung tâm quận — dùng để build URL search
const DISTRICT_COORDS: Record<number, [number, number]> = {
    1: [10.7769, 106.7009],
    3: [10.7780, 106.6892],
    5: [10.7540, 106.6580],
    7: [10.7301, 106.7218],
    13: [10.8120, 106.7086], // Bình Thạnh
    101: [21.0285, 105.8542], // Hoàn Kiếm
    102: [21.0245, 105.8412], // Đống Đa
    201: [16.0678, 108.2208], // Hải Châu
}

function getFirecrawl() {
    return new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })
}

// ─── GRAB ────────────────────────────────────────────────────────────────────

export async function scrapeGrab(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []

    const [lat, lng] = coords
    const url = `https://food.grab.com/vn/vi/search?query=com&lat=${lat}&lng=${lng}`

    const app = getFirecrawl()
    const result = await app.scrapeUrl(url, {
        formats: ['json'],
        jsonOptions: {
            schema: MENU_SCHEMA,
            prompt: 'Extract all restaurants and their menu items with prices from this food delivery search page.',
        },
        waitFor: 3000,
    }) as any

    if (!result.success || !result.json?.restaurants) return []

    const dishes: ScrapedDish[] = []
    for (const restaurant of result.json.restaurants) {
        for (const item of restaurant.items || []) {
            if (!item.price || item.price <= 0) continue
            dishes.push({
                app: 'grab',
                restaurantName: restaurant.name,
                appRestaurantId: restaurant.id || slugify(restaurant.name),
                dishName: item.name,
                price: Math.round(item.price),
                originalPrice: item.originalPrice || null,
                imageUrl: item.imageUrl || null,
                deepLink: `https://food.grab.com/vn/vi/restaurant/${restaurant.id || ''}`,
            })
        }
    }
    return dishes
}

// ─── SHOPEEFOOD ──────────────────────────────────────────────────────────────

export async function scrapeShopee(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []

    const [lat, lng] = coords
    const url = `https://shopeefood.vn/ho-chi-minh/food/tim-kiem?q=com&lat=${lat}&lng=${lng}`

    const app = getFirecrawl()
    const result = await app.scrapeUrl(url, {
        formats: ['json'],
        jsonOptions: {
            schema: MENU_SCHEMA,
            prompt: 'Extract all restaurants and their menu items with prices from this food delivery search page.',
        },
        waitFor: 3000,
    }) as any

    if (!result.success || !result.json?.restaurants) return []

    const dishes: ScrapedDish[] = []
    for (const restaurant of result.json.restaurants) {
        for (const item of restaurant.items || []) {
            if (!item.price || item.price <= 0) continue
            dishes.push({
                app: 'shopee',
                restaurantName: restaurant.name,
                appRestaurantId: restaurant.id || slugify(restaurant.name),
                dishName: item.name,
                price: Math.round(item.price),
                originalPrice: item.originalPrice || null,
                imageUrl: item.imageUrl || null,
                deepLink: `https://shopeefood.vn/restaurant/${restaurant.id || ''}`,
            })
        }
    }
    return dishes
}

// ─── BAEMIN ──────────────────────────────────────────────────────────────────

export async function scrapeBaemin(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []

    const [lat, lng] = coords
    const url = `https://baemin.vn/search?query=com&latitude=${lat}&longitude=${lng}`

    const app = getFirecrawl()
    const result = await app.scrapeUrl(url, {
        formats: ['json'],
        jsonOptions: {
            schema: MENU_SCHEMA,
            prompt: 'Extract all restaurants and their menu items with prices from this food delivery search page.',
        },
        waitFor: 3000,
    }) as any

    if (!result.success || !result.json?.restaurants) return []

    const dishes: ScrapedDish[] = []
    for (const restaurant of result.json.restaurants) {
        for (const item of restaurant.items || []) {
            if (!item.price || item.price <= 0) continue
            dishes.push({
                app: 'baemin',
                restaurantName: restaurant.name,
                appRestaurantId: restaurant.id || slugify(restaurant.name),
                dishName: item.name,
                price: Math.round(item.price),
                originalPrice: item.originalPrice || null,
                imageUrl: item.imageUrl || null,
                deepLink: `https://baemin.vn/restaurant/${restaurant.id || ''}`,
            })
        }
    }
    return dishes
}

// ─── SCRAPE ALL APPS FOR A DISTRICT ─────────────────────────────────────────

export async function scrapeAllApps(districtId: number): Promise<{
    dishes: ScrapedDish[]
    errors: Record<AppName, string | null>
}> {
    const errors: Record<AppName, string | null> = { grab: null, shopee: null, baemin: null }
    const allDishes: ScrapedDish[] = []

    // Chạy song song 3 app
    const [grabResult, shopeeResult, baeminResult] = await Promise.allSettled([
        scrapeGrab(districtId),
        scrapeShopee(districtId),
        scrapeBaemin(districtId),
    ])

    if (grabResult.status === 'fulfilled') {
        allDishes.push(...grabResult.value)
    } else {
        errors.grab = grabResult.reason?.message || 'Unknown error'
    }

    if (shopeeResult.status === 'fulfilled') {
        allDishes.push(...shopeeResult.value)
    } else {
        errors.shopee = shopeeResult.reason?.message || 'Unknown error'
    }

    if (baeminResult.status === 'fulfilled') {
        allDishes.push(...baeminResult.value)
    } else {
        errors.baemin = baeminResult.reason?.message || 'Unknown error'
    }

    return { dishes: allDishes, errors }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function slugify(str: string): string {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
