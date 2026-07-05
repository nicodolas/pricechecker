/**
 * Grab Food scraper — intercept XHR/fetch responses qua ScrapingAnt JS execution
 */

import type { ScrapedDish } from '../scraper-types'
import { getNextApiKey } from '../key-pool'

const SCRAPINGANT_API = 'https://api.scrapingant.com/v2/general'

// JS chạy trong browser để intercept network responses của Grab
const INTERCEPT_JS = `
(async () => {
  const original = window.fetch;
  const results = [];
  window.fetch = async (...args) => {
    const res = await original(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('search') || url.includes('merchant')) {
      try {
        const clone = res.clone();
        const text = await clone.text();
        if (text.includes('searchMerchants') || text.includes('merchant')) {
          results.push(text.substring(0, 50000));
        }
      } catch(e) {}
    }
    return res;
  };
  await new Promise(r => setTimeout(r, 5000));
  document.body.setAttribute('data-scraped', JSON.stringify(results));
})();
`

export async function scrapeGrab(districtId: number, lat: number, lng: number): Promise<ScrapedDish[]> {
    const apiKey = await getNextApiKey()
    if (!apiKey) {
        console.warn('[grab] No SCRAPINGANT_API_KEY configured')
        return []
    }

    const targetUrl = `https://food.grab.com/vn/vi/search?query=com&lat=${lat}&lng=${lng}`

    const params = new URLSearchParams({
        url: targetUrl,
        browser: 'true',
        'page-load-delay': '6000',
        js_snippet: Buffer.from(INTERCEPT_JS).toString('base64'),
    })

    try {
        const res = await fetch(`${SCRAPINGANT_API}?${params}`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(30000),
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

    // Thử lấy data từ attribute data-scraped (intercept JS)
    const scrapedMatch = html.match(/data-scraped="([^"]+)"/)
    if (scrapedMatch) {
        try {
            const intercepted = JSON.parse(scrapedMatch[1].replace(/&quot;/g, '"'))
            for (const chunk of intercepted) {
                dishes.push(...extractMerchantsFromJson(chunk))
            }
            if (dishes.length > 0) return dishes
        } catch (_) { }
    }

    // Fallback: tìm JSON trong __NEXT_DATA__ hoặc script tags
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
        dishes.push(...extractMerchantsFromJson(nextDataMatch[1]))
    }

    // Fallback 2: tìm trực tiếp trong HTML
    dishes.push(...extractMerchantsFromJson(html))

    return dishes
}

function extractMerchantsFromJson(text: string): ScrapedDish[] {
    const dishes: ScrapedDish[] = []
    const patterns = [
        /"searchMerchants"\s*:\s*(\[[\s\S]{10,100000}?\])\s*[,}]/,
        /"merchants"\s*:\s*(\[[\s\S]{10,100000}?\])\s*[,}]/,
    ]

    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (!match) continue
        try {
            const merchants = JSON.parse(match[1])
            for (const merchant of merchants) {
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
            if (dishes.length > 0) break
        } catch (_) { }
    }
    return dishes
}
