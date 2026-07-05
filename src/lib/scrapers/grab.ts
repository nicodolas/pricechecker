/**
 * Grab Food scraper — dùng ScrapingAnt để render JS
 * ScrapingAnt: 10,000 free credits/tháng, không cần credit card
 * Đăng ký: https://app.scrapingant.com/signup
 */

import type { ScrapedDish } from '../scraper-types'
import { getNextApiKey } from '../key-pool'

const SCRAPINGANT_API = 'https://api.scrapingant.com/v2/general'

export async function scrapeGrab(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const apiKey = await getNextApiKey()
    if (!apiKey) {
        console.warn('[grab] No SCRAPINGANT_API_KEY configured')
        return []
    }

    const targetUrl = `https://food.grab.com/vn/vi/search?query=com&lat=${lat}&lng=${lng}`

    const params = new URLSearchParams({
        url: targetUrl,
        browser: 'false',
        'wait-for-selector': '[data-testid="restaurant-list"]',
        'page-load-delay': '3000',
    })

    try {
        const res = await fetch(`${SCRAPINGANT_API}?${params}`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(25000),
        })

        if (!res.ok) {
            console.warn(`[grab] ScrapingAnt HTTP ${res.status}`)
            return []
        }

        const html = await res.text()
        if (!html) return []

        return parseGrabHtml(html)
    } catch (err: any) {
        console.error('[grab] scrape error:', err.message)
        return []
    }
}

function parseGrabHtml(html: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []

    // Parse JSON embedded trong script tags của Grab
    const jsonMatches = html.matchAll(/"searchMerchants"\s*:\s*(\[[\s\S]*?\])/g)

    for (const match of jsonMatches) {
        try {
            const merchants = JSON.parse(match[1])
            for (const merchant of merchants) {
                const restaurantName = merchant?.name || merchant?.displayName || ''
                const restaurantId = merchant?.id || merchant?.merchantID || ''
                const items = merchant?.cardContent?.recommendedItems
                    || merchant?.menu?.recommendedItems
                    || []

                for (const item of items) {
                    const price = item?.price?.amount || item?.discountedPrice
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'grab',
                        restaurantName,
                        appRestaurantId: String(restaurantId),
                        dishName: item?.name || '',
                        price: Math.round(Number(price)),
                        originalPrice: item?.price?.originalAmount || null,
                        imageUrl: item?.imgUrl || null,
                        deepLink: `https://food.grab.com/vn/vi/restaurant/${restaurantId}`,
                    })
                }
            }
        } catch (_) { }
    }

    return dishes
}
