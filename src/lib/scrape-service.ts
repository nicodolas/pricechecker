/**
 * Scrape service: gọi Firecrawl → lưu vào Neon DB → xóa cache Redis
 */

import { db, restaurants, dishes, scraperLogs } from '@/db'
import { redis } from '@/lib/redis'
import { scrapeAllApps, type ScrapedDish } from '@/lib/firecrawl'
import { eq, and } from 'drizzle-orm'

export async function scrapeAndSaveDistrict(districtId: number): Promise<{
    saved: number
    errors: Record<string, string | null>
    durationMs: number
}> {
    const start = Date.now()

    const { dishes: scrapedDishes, errors } = await scrapeAllApps(districtId)

    let saved = 0

    if (scrapedDishes.length > 0) {
        saved = await saveToDb(districtId, scrapedDishes)
        await invalidateCache(districtId)
    }

    const durationMs = Date.now() - start

    // Ghi log
    await logScrape(districtId, scrapedDishes.length, errors, durationMs)

    return { saved, errors, durationMs }
}

async function saveToDb(districtId: number, scrapedDishes: ScrapedDish[]): Promise<number> {
    let count = 0

    for (const dish of scrapedDishes) {
        try {
            // Upsert nhà hàng
            const existing = await db
                .select({ id: restaurants.id })
                .from(restaurants)
                .where(
                    and(
                        eq(restaurants.app, dish.app),
                        eq(restaurants.appRestaurantId, dish.appRestaurantId)
                    )
                )
                .limit(1)

            let restaurantId: string

            if (existing.length > 0) {
                restaurantId = existing[0].id
                await db
                    .update(restaurants)
                    .set({ name: dish.restaurantName, updatedAt: new Date() })
                    .where(eq(restaurants.id, restaurantId))
            } else {
                const inserted = await db
                    .insert(restaurants)
                    .values({
                        name: dish.restaurantName,
                        app: dish.app,
                        appRestaurantId: dish.appRestaurantId,
                        districtId,
                        deepLink: dish.deepLink,
                        imageUrl: dish.imageUrl,
                        isActive: true,
                    })
                    .returning({ id: restaurants.id })
                restaurantId = inserted[0].id
            }

            // Upsert món ăn
            const existingDish = await db
                .select({ id: dishes.id })
                .from(dishes)
                .where(
                    and(
                        eq(dishes.restaurantId, restaurantId),
                        eq(dishes.name, dish.dishName)
                    )
                )
                .limit(1)

            if (existingDish.length > 0) {
                await db
                    .update(dishes)
                    .set({
                        price: dish.price,
                        originalPrice: dish.originalPrice ?? null,
                        imageUrl: dish.imageUrl ?? null,
                        isAvailable: true,
                        lastScrapedAt: new Date(),
                    })
                    .where(eq(dishes.id, existingDish[0].id))
            } else {
                await db.insert(dishes).values({
                    restaurantId,
                    name: dish.dishName,
                    price: dish.price,
                    originalPrice: dish.originalPrice ?? null,
                    imageUrl: dish.imageUrl ?? null,
                    deepLink: dish.deepLink ?? null,
                    isAvailable: true,
                    lastScrapedAt: new Date(),
                })
            }

            count++
        } catch (err) {
            console.error(`[scrape-service] Failed to save dish "${dish.dishName}":`, err)
        }
    }

    return count
}

async function invalidateCache(districtId: number) {
    try {
        // Xóa cache districts + search results liên quan
        await redis.del(`districts:${districtId}`)
        // Xóa tất cả search cache của quận này bằng pattern
        // Upstash REST không hỗ trợ SCAN, nên chỉ xóa key cụ thể có thể biết
        // Trong production nên dùng Redis SCAN hoặc tag-based invalidation
        console.log(`[cache] Invalidated cache for district ${districtId}`)
    } catch (err) {
        console.warn('[cache] Invalidation failed:', err)
    }
}

async function logScrape(
    districtId: number,
    itemsScraped: number,
    errors: Record<string, string | null>,
    durationMs: number
) {
    const hasError = Object.values(errors).some((e) => e !== null)
    const allFailed = Object.values(errors).every((e) => e !== null)

    const status = allFailed ? 'failed' : hasError ? 'partial' : 'success'
    const errorMessage = Object.entries(errors)
        .filter(([, v]) => v !== null)
        .map(([app, err]) => `${app}: ${err}`)
        .join(' | ') || null

    try {
        await db.insert(scraperLogs).values({
            app: 'all',
            districtId,
            status: allFailed ? 'failed' : 'success',
            itemsScraped,
            errorMessage,
            startedAt: new Date(Date.now() - durationMs),
            finishedAt: new Date(),
        })
    } catch (err) {
        console.warn('[log] Failed to write scraper log:', err)
    }
}
