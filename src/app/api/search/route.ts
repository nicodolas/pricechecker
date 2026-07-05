import { NextRequest, NextResponse } from 'next/server'
import { db, dishes, restaurants, districts, provinces, dishMappings } from '@/db'
import { redis, cacheKeys, CACHE_TTL } from '@/lib/redis'
import { eq, and, ilike, inArray } from 'drizzle-orm'
import type { DishComparison, AppPrice, AppName, SearchResult } from '@/lib/types'
import { MOCK_DISTRICTS, filterMockResults } from '@/lib/mock-data'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q') || ''
    const districtId = parseInt(searchParams.get('districtId') || '0')

    if (!query || !districtId) {
        return NextResponse.json({ error: 'Thiếu query hoặc districtId' }, { status: 400 })
    }

    // Dev mode: trả mock data, không chạm DB/Redis
    if (process.env.NODE_ENV === 'development') {
        const result = filterMockResults(query, districtId, MOCK_DISTRICTS)
        return NextResponse.json(result)
    }

    // Production: đọc cache rồi DB
    const cacheKey = cacheKeys.searchResults(districtId, query)
    try {
        const cached = await redis.get<SearchResult>(cacheKey)
        if (cached) return NextResponse.json({ ...cached, fromCache: true })
    } catch (_) { }

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

        // Tìm nhà hàng trong quận khớp tên
        const restaurantList = await db
            .select()
            .from(restaurants)
            .where(
                and(
                    eq(restaurants.districtId, districtId),
                    eq(restaurants.isActive, true),
                    ilike(restaurants.name, `%${query}%`)
                )
            )

        const restaurantIds = restaurantList.map((r) => r.id)

        // Tìm món ăn khớp tên
        const dishesByName = await db
            .select()
            .from(dishes)
            .where(and(eq(dishes.isAvailable, true), ilike(dishes.name, `%${query}%`)))
            .limit(50)

        // Merge restaurants
        const allRestaurantIds = Array.from(new Set(dishesByName.map((d) => d.restaurantId)))
        let allRestaurants = [...restaurantList]
        if (allRestaurantIds.length > 0) {
            const extra = await db
                .select()
                .from(restaurants)
                .where(
                    and(
                        inArray(restaurants.id, allRestaurantIds),
                        eq(restaurants.districtId, districtId)
                    )
                )
            const existingIds = new Set(allRestaurants.map((r) => r.id))
            for (const r of extra) {
                if (!existingIds.has(r.id)) allRestaurants.push(r)
            }
        }

        const comparisons = buildComparisons(dishesByName, allRestaurants)

        const result: SearchResult = {
            dishes: comparisons,
            districtName: district.name,
            provinceName,
            query,
            generatedAt: new Date().toISOString(),
        }

        try {
            await redis.set(cacheKey, result, { ex: CACHE_TTL })
        } catch (_) { }

        return NextResponse.json(result)
    } catch (err) {
        console.error('[/api/search]', err)
        return NextResponse.json({ error: 'Lỗi server', detail: String(err) }, { status: 500 })
    }
}

function buildComparisons(dishList: any[], restaurantList: any[]): DishComparison[] {
    const now = new Date()
    const ONE_HOUR = 60 * 60 * 1000
    const restaurantMap = Object.fromEntries(restaurantList.map((r) => [r.id, r]))
    const grouped = new Map<string, DishComparison>()

    for (const dish of dishList) {
        const restaurant = restaurantMap[dish.restaurantId]
        if (!restaurant) continue

        const key = `${restaurant.name}::${dish.name}`
        const app = restaurant.app as AppName
        const lastScraped = dish.lastScrapedAt ? new Date(dish.lastScrapedAt) : null
        const isStale = lastScraped ? now.getTime() - lastScraped.getTime() > ONE_HOUR : true

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
