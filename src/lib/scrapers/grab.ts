/**
 * Grab Food scraper — gọi thẳng internal API của Grab
 * Không cần browser, không cần Firecrawl
 */

import type { ScrapedDish } from '../scraper-types'

const GRAB_API = 'https://portal.grab.com/foodweb/v2/search'

const HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'vi-VN,vi;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://food.grab.com',
    'referer': 'https://food.grab.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'x-country-code': 'VN',
    'x-currency': 'VND',
    'x-gfe-version': '20.1.0',
    'x-grab-client': 'WEBSITE',
}

export async function scrapeGrab(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const keywords = ['cơm', 'bún', 'phở', 'bánh mì', 'gà']
    const dishes: ScrapedDish[] = []

    for (const keyword of keywords) {
        try {
            const body = {
                countryCode: 'VN',
                keyword,
                offset: 0,
                pageSize: 20,
                location: { latitude: lat, longitude: lng },
                lunchTime: false,
            }

            const res = await fetch(GRAB_API, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(8000),
            })

            if (!res.ok) {
                console.warn(`[grab] ${keyword}: HTTP ${res.status}`)
                continue
            }

            const data = await res.json()
            const restaurants = data?.searchResult?.searchMerchants || []

            for (const merchant of restaurants) {
                const restaurantName = merchant?.name || ''
                const restaurantId = merchant?.id || ''
                const items = merchant?.cardContent?.recommendedItems || []

                for (const item of items) {
                    const price = item?.price?.amount
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'grab',
                        restaurantName,
                        appRestaurantId: restaurantId,
                        dishName: item?.name || '',
                        price: Math.round(price),
                        originalPrice: item?.price?.originalAmount || null,
                        imageUrl: item?.imgUrl || null,
                        deepLink: `https://food.grab.com/vn/vi/restaurant/${restaurantId}`,
                    })
                }
            }

            // Delay nhỏ giữa các request để tránh rate limit
            await sleep(300)
        } catch (err: any) {
            console.warn(`[grab] keyword "${keyword}" error:`, err.message)
        }
    }

    return deduplicateDishes(dishes)
}

function deduplicateDishes(dishes: ScrapedDish[]): ScrapedDish[] {
    const seen = new Set<string>()
    return dishes.filter((d) => {
        const key = `${d.appRestaurantId}::${d.dishName}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}
