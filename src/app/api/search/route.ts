import { NextRequest, NextResponse } from 'next/server'
import { db, dishes, restaurants, districts, provinces } from '@/db'
import { redis, cacheKeys } from '@/lib/redis'
import { eq, and, ilike, inArray } from 'drizzle-orm'
import type { DishComparison, AppPrice, AppName, SearchResult } from '@/lib/types'
import { MOCK_DISTRICTS, filterMockResults } from '@/lib/mock-data'
import { scrapeAndSaveDistrict } from '@/lib/scrape-service'

// Dữ liệu cũ hơn 15 phút → trigger scrape mới
const STALE_THRESHOLD_MS = 15 * 60 * 1000
// Cache kết quả search 15 phút
const SEARCH_CACHE_TTL = 60 * 15
// Key Redis đánh dấu quận đang được scrape (tránh chạy song song)
const scrapingKey = (districtId: number) => `scraping:district:${districtId}`

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q') || ''
    const districtId = parseInt(searchParams.get('districtId') || '0')

    if (!query || !districtId) {
        return NextResponse.json({ error: 'Thiếu query hoặc districtId' }, { status: 400 })
    }

    // Dev mode: trả mock data
    if (process.env.NODE_ENV === 'development') {
        const result = filterMockResults(query, districtId, MOCK_DISTRICTS)
        return NextResponse.json(result)
    }

    // Check cache search trước
    const cacheKey = cacheKeys.searchResults(districtId, query)
    try {
        const cached = await redis.get<SearchResult>(cacheKey)
        if (cached) return NextResponse.json({ ...cached, fromCache: true })
    } catch (_) { }

    // Kiểm tra dữ liệu trong DB có còn fresh không
    const isStale = await isDistrictDataStale(districtId)

    if (isStale) {
        // Trigger scrape on-demand — chạy async không block response nếu đang có scrape rồi
        triggerScrapeIfNotRunning(districtId)
    }

    // Query DB và trả kết quả (dù scrape đang chạy hay không)
    return await queryAndRespond(districtId, query)
}

/**
 * Kiểm tra dữ liệu quận có cũ hơn 15 phút không
 */
async function isDistrictDataStale(districtId: number): Promise<boolean> {
    try {
        // Check Redis flag — nếu vừa scrape xong trong 15 phút thì không cần scrape lại
        const freshKey = `district:fresh:${districtId}`
        const isFresh = await redis.get(freshKey)
        if (isFresh) return false

        // Check DB — lấy lastScrapedAt của món ăn mới nhất trong quận
        const latest = await db
            .select({ lastScrapedAt: dishes.lastScrapedAt })
            .from(dishes)
            .innerJoin(restaurants, eq(dishes.restaurantId, restaurants.id))
            .where(eq(restaurants.districtId, districtId))
            .orderBy(dishes.lastScrapedAt)
            .limit(1)

        if (!latest.length || !latest[0].lastScrapedAt) return true // Chưa có data → stale

        const age = Date.now() - new Date(latest[0].lastScrapedAt).getTime()
        return age > STALE_THRESHOLD_MS
    } catch (_) {
        return true // Lỗi → cứ scrape lại cho chắc
    }
}

/**
 * Trigger scrape nếu quận đó chưa đang được scrape
 * Không await — chạy nền, không block user
 */
function triggerScrapeIfNotRunning(districtId: number) {
    const key = scrapingKey(districtId)

    redis.get(key).then((running) => {
        if (running) return // Đang scrape rồi, bỏ qua

        // Đánh dấu đang scrape (TTL 60s để tránh stuck)
        redis.set(key, '1', { ex: 60 }).then(() => {
            scrapeAndSaveDistrict(districtId)
                .then(async (result) => {
                    // Đánh dấu fresh 15 phút
                    await redis.set(`district:fresh:${districtId}`, '1', { ex: SEARCH_CACHE_TTL })
                    // Xóa lock
                    await redis.del(key)
                    console.log(`[on-demand] district ${districtId}: saved ${result.saved} items`)
                })
                .catch(async (err) => {
                    await redis.del(key)
                    console.error(`[on-demand] district ${districtId} failed:`, err.message)
                })
        }).catch(() => { })
    }).catch(() => { })
}

async function queryAndRespond(districtId: number, query: string): Promise<NextResponse> {
    try {
        const districtRows = await db
            .select({ id: districts.id, name: districts.name, provinceId: districts.provinceId })
            .from(districts)
            .where(eq(districts.id, districtId))
            .limit(1)

        if (!districtRows.length) {
            return NextResponse.json({ error: 'Không tìm thấy quận' }, { status: 404 })
        }
        const district = districtRows[0]

        const provinceRows = await db
            .select({ name: provinces.name })
            .from(provinces)
            .where(eq(provinces.id, district.provinceId))
            .limit(1)
        const provinceName = provinceRows[0]?.name || ''

        // Tìm món khớp tên trong quận
        const dishesByName = await db
            .select()
            .from(dishes)
            .innerJoin(restaurants, eq(dishes.restaurantId, restaurants.id))
            .where(
                and(
                    eq(restaurants.districtId, districtId),
                    eq(dishes.isAvailable, true),
                    ilike(dishes.name, `%${query}%`)
                )
            )
            .limit(60)

        // Tách dishes và restaurants từ join result
        const dishList = dishesByName.map((r) => ({ ...r.dishes }))
        const restaurantMap = Object.fromEntries(
            dishesByName.map((r) => [r.restaurants.id, r.restaurants])
        )

        const isScrapingNow = await redis.get(scrapingKey(districtId)).catch(() => null)

        const comparisons = buildComparisons(dishList, restaurantMap)

        const result: SearchResult = {
            dishes: comparisons,
            districtName: district.name,
            provinceName,
            query,
            generatedAt: new Date().toISOString(),
            // @ts-ignore — thêm field phụ để frontend biết đang scrape
            isUpdating: !!isScrapingNow && comparisons.length === 0,
        }

        // Cache 15 phút nếu có kết quả
        if (comparisons.length > 0) {
            try {
                await redis.set(cacheKeys.searchResults(districtId, query), result, { ex: SEARCH_CACHE_TTL })
            } catch (_) { }
        }

        return NextResponse.json(result)
    } catch (err) {
        console.error('[/api/search]', err)
        return NextResponse.json({ error: 'Lỗi server', detail: String(err) }, { status: 500 })
    }
}

function buildComparisons(dishList: any[], restaurantMap: Record<string, any>): DishComparison[] {
    const now = new Date()
    const FIFTEEN_MIN = 15 * 60 * 1000
    const grouped = new Map<string, DishComparison>()

    for (const dish of dishList) {
        const restaurant = restaurantMap[dish.restaurantId]
        if (!restaurant) continue

        const key = `${restaurant.name}::${dish.name}`
        const app = restaurant.app as AppName
        const lastScraped = dish.lastScrapedAt ? new Date(dish.lastScrapedAt) : null
        const isStale = lastScraped ? now.getTime() - lastScraped.getTime() > FIFTEEN_MIN : true

        const price: AppPrice = {
            app,
            appLabel: app === 'grab' ? 'GrabFood' : app === 'shopee' ? 'ShopeeFood' : 'Baemin',
            price: dish.price,
            originalPrice: dish.originalPrice,
            dishName: dish.name,
            deepLink: dish.deepLink,
            lastScrapedAt: dish.lastScrapedAt?.toISOString?.() || null,
            isStale,
        }

        if (grouped.has(key)) {
            grouped.get(key)!.prices.push(price)
        } else {
            grouped.set(key, {
                canonicalName: dish.name,
                restaurantName: restaurant.name,
                restaurantAddress: restaurant.address,
                prices: [price],
                cheapestApp: null,
                mappingStatus: 'confirmed',
            })
        }
    }

    for (const comparison of Array.from(grouped.values())) {
        const validPrices = comparison.prices.filter((p: AppPrice) => p.price !== null)
        if (validPrices.length > 0) {
            const min = Math.min(...validPrices.map((p: AppPrice) => p.price!))
            comparison.cheapestApp = validPrices.find((p: AppPrice) => p.price === min)?.app || null
        }
    }

    return Array.from(grouped.values())
}
