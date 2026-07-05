/**
 * Baemin scraper — dùng ScrapingAnt để render JS
 */

import type { ScrapedDish } from '../scraper-types'
import { getNextApiKey } from '../key-pool'

const SCRAPINGANT_API = 'https://api.scrapingant.com/v2/general'

export async function scrapeBaemin(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const apiKey = await getNextApiKey()
    if (!apiKey) {
        console.warn('[baemin] No SCRAPINGANT_API_KEY configured')
        return []
    }

    const targetUrl = `https://baemin.vn/search?query=com&latitude=${lat}&longitude=${lng}`

    const params = new URLSearchParams({
        url: targetUrl,
        browser: 'false',
        'page-load-delay': '3000',
    })

    try {
        const res = await fetch(`${SCRAPINGANT_API}?${params}`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(25000),
        })

        if (!res.ok) {
            console.warn(`[baemin] ScrapingAnt HTTP ${res.status}`)
            return []
        }

        const html = await res.text()
        if (!html) return []

        return parseBaeminHtml(html)
    } catch (err: any) {
        console.error('[baemin] scrape error:', err.message)
        return []
    }
}

function parseBaeminHtml(html: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []

    const patterns = [
        /"contents"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
        /"storeList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    ]

    for (const pattern of patterns) {
        const match = html.match(pattern)
        if (!match) continue

        try {
            const list = JSON.parse(match[1])

            for (const restaurant of list) {
                const restaurantName = restaurant?.displayName || restaurant?.name || ''
                const restaurantId = String(restaurant?.storeId || restaurant?.id || '')
                const menuItems = restaurant?.topMenu || restaurant?.menus || []

                for (const item of menuItems) {
                    const price = item?.salePrice || item?.price
                    if (!price || price <= 0) continue

                    dishes.push({
                        app: 'baemin',
                        restaurantName,
                        appRestaurantId: restaurantId,
                        dishName: item?.name || '',
                        price: Math.round(Number(price)),
                        originalPrice: item?.originalPrice || null,
                        imageUrl: item?.imgUrl || item?.imageUrl || null,
                        deepLink: `https://baemin.vn/restaurant/${restaurantId}`,
                    })
                }
            }

            if (dishes.length > 0) break
        } catch (_) { }
    }

    return dishes
}
