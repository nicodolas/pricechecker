/**
 * ShopeeFood scraper — gọi thẳng internal API
 */

import type { ScrapedDish } from '../scraper-types'

const SHOPEE_API = 'https://gappapi.deliverynow.vn/api/delivery/get_delivery_list'

const HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'vi-VN,vi;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://shopeefood.vn',
    'referer': 'https://shopeefood.vn/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-foody-access-token': '',
    'x-foody-api-version': '1',
    'x-foody-app-type': '1004',
    'x-foody-client-id': '',
    'x-foody-client-language': 'vi',
    'x-foody-client-type': '1',
}

export async function scrapeShopee(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const keywords = ['cơm', 'bún', 'phở', 'gà', 'bánh mì']
    const dishes: ScrapedDish[] = []

    for (const keyword of keywords) {
        try {
            const params = new URLSearchParams({
                keyword,
                latitude: String(lat),
                longitude: String(lng),
                is_foody: '1',
                page_index: '0',
            })

            const res = await fetch(`${SHOPEE_API}?${params}`, {
                method: 'GET',
                headers: HEADERS,
                signal: AbortSignal.timeout(8000),
            })

            if (!res.ok) {
                console.warn(`[shopee] ${keyword}: HTTP ${res.status}`)
                continue
            }

            const data = await res.json()
            const restaurants = data?.reply?.delivery_list || []

            for (const restaurant of restaurants) {
                const restaurantName = restaurant?.name || ''
                const restaurantId = String(restaurant?.id || '')

                // ShopeeFood trả items ở top_dishes
                const topDishes = restaurant?.top_dishes || []
                for (const dish of topDishes) {
                    const price = dish?.price
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'shopee',
                        restaurantName,
                        appRestaurantId: restaurantId,
                        dishName: dish?.name || '',
                        price: Math.round(price),
                        originalPrice: dish?.total_price || null,
                        imageUrl: dish?.photos?.[0]?.value || null,
                        deepLink: `https://shopeefood.vn/restaurant/${restaurantId}`,
                    })
                }
            }

            await sleep(300)
        } catch (err: any) {
            console.warn(`[shopee] keyword "${keyword}" error:`, err.message)
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
