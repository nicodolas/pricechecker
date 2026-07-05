/**
 * Scrape service: gọi HTTP scrapers → lưu vào Neon DB → xóa cache Redis
 */

import { db, restaurants, dishes, scraperLogs } from '@/db'
import { redis } from '@/lib/redis'
import { scrapeGrab } from '@/lib/scrapers/grab'
import { scrapeShopee } from '@/lib/scrapers/shopee'
import { scrapeBaemin } from '@/lib/scrapers/baemin'
import { DISTRICT_COORDS, type ScrapedDish, type AppName } from '@/lib/scraper-types'
import { eq, and } from 'drizzle-orm'

export async function scrapeAndSaveDistrict(districtId: number): Promise<{
    saved: number
    errors: Record<AppName, string | null>
    durationMs: number
}> {
    const start = Date.now()
    const errors: Record<AppName, string | null> = { grab: null, shopee: null, baemin: null }
    const allDishes: ScrapedDish[] = []

    const coords = DISTRICT_COORDS[districtId]
    if (!coords) {
        return { saved: 0, errors, durationMs: 0 }
    }
    const [lat, lng] = coords

    // Chạy 3 scrapers song song
    const [grabResult, shopeeResult, baeminResult] = await Promise.allSettled([
        scrapeGrab(districtId, lat, lng),
        scrapeShopee(districtId, lat, lng),
        scrapeBaemin(districtId, lat, lng),
    ])

    if (grabResult.status === 'fulfilled') allDishes.push(...grabResult.value)
    else errors.grab = grabResult.reason?.message || 'Unknown error'

    if (shopeeResult.status === 'fulfilled') allDishes.push(...shopeeResult.value)
    else errors.shopee = shopeeResult.reason?.message || 'Unknown error'

    if (baeminResult.status === 'fulfilled') allDishes.push(...baeminResult.value)
    else errors.baemin = baeminResult.reason?.message || 'Unknown error'

    let saved = 0
    if (allDishes.length > 0) {
        saved = await saveToDb(districtId, allDishes)
        await invalidateCache(districtId)
    }

    const durationMs = Date.now() - start
    await logScrape(districtId, saved, errors, durationMs)

    return { saved, errors, durationMs }
}

async function saveToDb(districtId: number, scrapedDishes: ScrapedDish[]): Promise<number> {
    let count = 0

    for (const dish of scrapedDishes) {
        try {
            // Upsert restaurant
            const existing = await db
                .select({ id: restaurants.id })
                .from(restaurants)
                .where(and(
                    eq(restaurants.app, dish.app),
                    eq(restaurants.appRestaurantId, dish.appRestaurantId)
                ))
                .limit(1)

            let restaurantId: string

            if (existing.length > 0) {
                restaurantId = existing[0].id
                await db.update(restaurants)
                    .set({ name: dish.restaurantName, updatedAt: new Date() })
                    .where(eq(restaurants.id, restaurantId))
            } else {
                const inserted = await db.insert(restaurants)
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

            // Upsert dish
            const existingDish = await db
                .select({ id: dishes.id })
                .from(dishes)
                .where(and(
                    eq(dishes.restaurantId, restaurantId),
                    eq(dishes.name, dish.dishName)
                ))
                .limit(1)

            if (existingDish.length > 0) {
                await db.update(dishes)
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
            console.error(`[scrape-service] Failed to save "${dish.dishName}":`, err)
        }
    }

    return count
}

async function invalidateCache(districtId: number) {
    try {
        await redis.del(`districts:${districtId}`)
    } catch (err) {
        console.warn('[cache] Invalidation failed:', err)
    }
}

async function logScrape(
    districtId: number,
    itemsScraped: number,
    errors: Record<AppName, string | null>,
    durationMs: number
) {
    const allFailed = Object.values(errors).every((e) => e !== null)
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
