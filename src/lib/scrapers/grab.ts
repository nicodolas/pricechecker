/**
 * Grab Food scraper — gọi thẳng Grab API qua ScrapingAnt proxy
 * ScrapingAnt dùng để bypass geo-restriction và headers
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

    // Gọi thẳng Grab search API (không cần browser rendering)
    const grabApiUrl = `https://portal.grab.com/foodweb/v2/search`
    const body = JSON.stringify({
        countryCode: 'VN',
        keyword: 'cơm',
        offset: 0,
        pageSize: 32,
        location: { latitude: lat, longitude: lng },
        lunchTime: false,
        version: '5',
    })

    // Dùng ScrapingAnt để proxy request (bypass IP blocking)
    const params = new URLSearchParams({
        url: grabApiUrl,
        browser: 'false',
        'return-page-source': 'true',
    })

    try {
        const res = await fetch(`${SCRAPINGANT_API}?${params}`, {
            method: 'GET', // ScrapingAnt v2 chỉ support GET với custom_cookies
            headers: {
                'x-api-key': apiKey,
                // Truyền custom headers cho request đích
                'x-browser-headers': JSON.stringify({
                    'content-type': 'application/json',
                    'origin': 'https://food.grab.com',
                    'referer': 'https://food.grab.com/',
                    'x-country-code': 'VN',
                    'x-grab-client': 'WEBSITE',
                }),
            },
            signal: AbortSignal.timeout(25000),
        })

        if (!res.ok) {
            console.warn(`[grab] HTTP ${res.status}`)
            return []
        }

        const text = await res.text()
        return parseGrabResponse(text)
    } catch (err: any) {
        console.error('[grab] error:', err.message)
        return []
    }
}

function parseGrabResponse(text: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []

    // Thử parse trực tiếp JSON
    try {
        const data = JSON.parse(text)
        const merchants = data?.searchResult?.searchMerchants || data?.searchMerchants || []
        return extractFromMerchants(merchants)
    } catch (_) { }

    // Fallback: tìm JSON trong HTML
    const patterns = [
        /"searchMerchants"\s*:\s*(\[[\s\S]{10,200000}?\])\s*[,}]/,
        /"merchants"\s*:\s*(\[[\s\S]{10,200000}?\])\s*[,}]/,
    ]

    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (!match) continue
        try {
            const merchants = JSON.parse(match[1])
            const extracted = extractFromMerchants(merchants)
            if (extracted.length > 0) return extracted
        } catch (_) { }
    }

    return dishes
}

function extractFromMerchants(merchants: any[]): ScrapedDish[] {
    const dishes: ScrapedDish[] = []
    for (const merchant of merchants || []) {
        const restaurantName = merchant?.name || merchant?.displayName || ''
        const restaurantId = merchant?.id || merchant?.merchantID || ''
        const items = merchant?.cardContent?.recommendedItems
            || merchant?.menu?.recommendedItems
            || merchant?.recommendedItems
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
    return dishes
}
