import { NextRequest, NextResponse } from 'next/server'
import { getNextApiKey } from '@/lib/key-pool'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = await getNextApiKey()
    if (!apiKey) return NextResponse.json({ error: 'No API key' })

    const targetUrl = 'https://food.grab.com/vn/vi/search?query=com&lat=10.7769&lng=106.7009'
    const params = new URLSearchParams({
        url: targetUrl,
        browser: 'false',
        'page-load-delay': '3000',
    })

    try {
        const res = await fetch(`https://api.scrapingant.com/v2/general?${params}`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(30000),
        })

        // ScrapingAnt trả về HTML trực tiếp, không phải JSON
        const html = await res.text()

        return NextResponse.json({
            status: res.status,
            contentType: res.headers.get('content-type'),
            apiKeyPrefix: apiKey.substring(0, 6) + '...',
            contentLength: html.length,
            contentPreview: html.substring(0, 800),
            hasSearchMerchants: html.includes('searchMerchants'),
            hasReactRoot: html.includes('__NEXT_DATA__') || html.includes('react'),
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message })
    }
}
