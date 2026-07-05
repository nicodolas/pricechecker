/**
 * Baemin scraper — gọi thẳng internal API
 */

import type { ScrapedDish } from '../scraper-types'

const BAEMIN_API = 'https://api.baemin.vn/v1/restaurant/search'

const HEADERS = {
    'accept': 'application/json',
    'accept-language': 'vi-VN,vi;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://baemin.vn',
    'referer': 'https://baemin.vn/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-app-version': '1.0.0',
    'x-device-type': 'WEB',
}

export async function scrapeBaemin(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const keywords = ['cơm', 'bún', 'phở', 'gà', 'bánh mì']
    const dishes: ScrapedDish[] = []

    for (const keyword of keywords) {
        try {
            const params = new URLSearchParams({
                keyword,
                lat: String(lat),
                lng: String(lng),
                page: '0',
                size: '20',
            })

            const res = await fetch(`${BAEMIN_API}?${params}`, {
                method: 'GET',
                headers: HEADERS,
                signal: AbortSignal.timeout(8000),
            })

            if (!res.ok) {
                console.warn(`[baemin] ${keyword}: HTTP ${res.status}`)
                continue
            }

            const data = await res.json()
            const restaurants = data?.data?.contents || []

            for (const restaurant of restaurants) {
                const restaurantName = restaurant?.displayName || restaurant?.name || ''
                const restaurantId = String(restaurant?.storeId || restaurant?.id || '')

                const menuItems = restaurant?.topMenu || restaurant?.menus || []
                for (const item of menuItems) {
                    const price = item?.price || item?.salePrice
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'baemin',
                        restaurantName,
                        appRestaurantId: restaurantId,
                        dishName: item?.name || '',
                        price: Math.round(price),
                        originalPrice: item?.originalPrice || null,
                        imageUrl: item?.imgUrl || item?.imageUrl || null,
                        deepLink: `https://baemin.vn/restaurant/${restaurantId}`,
                    })
                }
            }

            await sleep(300)
        } catch (err: any) {
            console.warn(`[baemin] keyword "${keyword}" error:`, err.message)
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
