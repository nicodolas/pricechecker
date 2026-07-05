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

interface MenuResult {
    restaurants: Array<{
        id?: string
        name: string
        items: Array<{
            name: string
            price: number
            originalPrice?: number
            imageUrl?: string
        }>
    }>
}

// Tọa độ trung tâm quận
const DISTRICT_COORDS: Record<number, [number, number]> = {
    1: [10.7769, 106.7009],
    3: [10.7780, 106.6892],
    5: [10.7540, 106.6580],
    7: [10.7301, 106.7218],
    13: [10.8120, 106.7086],
    101: [21.0285, 105.8542],
    102: [21.0245, 105.8412],
    201: [16.0678, 108.2208],
}

const EXTRACT_PROMPT = `
Extract all restaurants and their menu items from this food delivery page.
For each restaurant, extract: id (if available), name, and list of items with name, price (in VND as number), originalPrice (if discounted), imageUrl.
Return only data visible on the page.
`

function getFirecrawl() {
    return new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })
}

async function scrapeMenuUrl(url: string): Promise<MenuResult | null> {
    const fc = getFirecrawl()

    // Dùng extract endpoint — không cần Zod schema
    const result = await fc.scrapeUrl(url, {
        formats: ['markdown'],
        waitFor: 3000,
    }) as any

    if (!result.success || !result.markdown) return null

    // Dùng extract với prompt để parse markdown thành structured data
    const extractResult = await fc.extract([url], {
        prompt: EXTRACT_PROMPT,
    }) as any

    if (extractResult?.data?.[0]) {
        return extractResult.data[0] as MenuResult
    }

    return null
}

function parseDishes(data: MenuResult, app: AppName, deepLinkBase: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []
    for (const restaurant of data.restaurants || []) {
        for (const item of restaurant.items || []) {
            if (!item.price || item.price <= 0) continue
            dishes.push({
                app,
                restaurantName: restaurant.name,
                appRestaurantId: restaurant.id || slugify(restaurant.name),
                dishName: item.name,
                price: Math.round(item.price),
                originalPrice: item.originalPrice || null,
                imageUrl: item.imageUrl || null,
                deepLink: `${deepLinkBase}/${restaurant.id || slugify(restaurant.name)}`,
            })
        }
    }
    return dishes
}

// ─── GRAB ─────────────────────────────────────────────────────────────────────

export async function scrapeGrab(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []
    const [lat, lng] = coords
    const url = `https://food.grab.com/vn/vi/search?query=com&lat=${lat}&lng=${lng}`
    const data = await scrapeMenuUrl(url)
    if (!data) return []
    return parseDishes(data, 'grab', 'https://food.grab.com/vn/vi/restaurant')
}

// ─── SHOPEEFOOD ───────────────────────────────────────────────────────────────

export async function scrapeShopee(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []
    const [lat, lng] = coords
    const url = `https://shopeefood.vn/ho-chi-minh/food/tim-kiem?q=com&lat=${lat}&lng=${lng}`
    const data = await scrapeMenuUrl(url)
    if (!data) return []
    return parseDishes(data, 'shopee', 'https://shopeefood.vn/restaurant')
}

// ─── BAEMIN ───────────────────────────────────────────────────────────────────

export async function scrapeBaemin(districtId: number): Promise<ScrapedDish[]> {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) return []
    const [lat, lng] = coords
    const url = `https://baemin.vn/search?query=com&latitude=${lat}&longitude=${lng}`
    const data = await scrapeMenuUrl(url)
    if (!data) return []
    return parseDishes(data, 'baemin', 'https://baemin.vn/restaurant')
}

// ─── SCRAPE ALL ───────────────────────────────────────────────────────────────

export async function scrapeAllApps(districtId: number): Promise<{
    dishes: ScrapedDish[]
    errors: Record<AppName, string | null>
}> {
    const errors: Record<AppName, string | null> = { grab: null, shopee: null, baemin: null }
    const allDishes: ScrapedDish[] = []

    const [grabResult, shopeeResult, baeminResult] = await Promise.allSettled([
        scrapeGrab(districtId),
        scrapeShopee(districtId),
        scrapeBaemin(districtId),
    ])

    if (grabResult.status === 'fulfilled') allDishes.push(...grabResult.value)
    else errors.grab = grabResult.reason?.message || 'Unknown error'

    if (shopeeResult.status === 'fulfilled') allDishes.push(...shopeeResult.value)
    else errors.shopee = shopeeResult.reason?.message || 'Unknown error'

    if (baeminResult.status === 'fulfilled') allDishes.push(...baeminResult.value)
    else errors.baemin = baeminResult.reason?.message || 'Unknown error'

    return { dishes: allDishes, errors }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function slugify(str: string): string {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
