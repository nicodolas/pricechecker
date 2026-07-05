/**
 * ShopeeFood scraper — dùng ScrapingAnt để render JS
 */

import type { ScrapedDish } from '../scraper-types'

const SCRAPINGANT_API = 'https://api.scrapingant.com/v2/general'

export async function scrapeShopee(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const apiKey = process.env.SCRAPINGANT_API_KEY
    if (!apiKey) {
        console.warn('[shopee] SCRAPINGANT_API_KEY not set')
        return []
    }

    const targetUrl = `https://shopeefood.vn/ho-chi-minh/food/tim-kiem?q=com&lat=${lat}&lng=${lng}`

    const params = new URLSearchParams({
        url: targetUrl,
        'ant-key': apiKey,
        browser: 'false',
        'page-load-delay': '3000',
    })

    try {
        const res = await fetch(`${SCRAPINGANT_API}?${params}`, {
            signal: AbortSignal.timeout(25000),
        })

        if (!res.ok) {
            console.warn(`[shopee] ScrapingAnt HTTP ${res.status}`)
            return []
        }

        const data = await res.json()
        const html = data?.content || ''

        if (!html) return []

        return parseShopeHtml(html)
    } catch (err: any) {
        console.error('[shopee] scrape error:', err.message)
        return []
    }
}

function parseShopeHtml(html: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []

    // Parse JSON từ window.__INITIAL_STATE__ hoặc script tags
    const patterns = [
        /"delivery_list"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;/,
    ]

    for (const pattern of patterns) {
        const match = html.match(pattern)
        if (!match) continue

        try {
            const parsed = JSON.parse(match[1])
            const list = Array.isArray(parsed) ? parsed : parsed?.delivery_list || []

            for (const restaurant of list) {
                const restaurantName = restaurant?.name || ''
                const restaurantId = String(restaurant?.id || '')
                const topDishes = restaurant?.top_dishes || restaurant?.dishes || []

                for (const dish of topDishes) {
                    const price = dish?.price || dish?.total_price
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'shopee',
                        restaurantName,
                        appRestaurantId: restaurantId,
                        dishName: dish?.name || '',
                        price: Math.round(Number(price)),
                        originalPrice: null,
                        imageUrl: dish?.photos?.[0]?.value || null,
                        deepLink: `https://shopeefood.vn/restaurant/${restaurantId}`,
                    })
                }
            }

            if (dishes.length > 0) break
        } catch (_) { }
    }

    return dishes
}
