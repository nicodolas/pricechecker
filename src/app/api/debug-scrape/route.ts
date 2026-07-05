import { NextRequest, NextResponse } from 'next/server'
import { getNextApiKey } from '@/lib/key-pool'

// Debug: test ScrapingAnt trực tiếp
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = await getNextApiKey()
    if (!apiKey) {
        return NextResponse.json({ error: 'No API key' })
    }

    const targetUrl = 'https://food.grab.com/vn/vi/search?query=com&lat=10.7769&lng=106.7009'
    const params = new URLSearchParams({
        url: targetUrl,
        'ant-key': apiKey,
        browser: 'false',
        'page-load-delay': '3000',
    })

    try {
        const res = await fetch(`https://api.scrapingant.com/v2/general?${params}`, {
            signal: AbortSignal.timeout(25000),
        })

        const data = await res.json() as any

        return NextResponse.json({
            status: res.status,
            apiKeyPrefix: apiKey.substring(0, 6) + '...',
            hasContent: !!data?.content,
            contentLength: data?.content?.length || 0,
            contentPreview: data?.content?.substring(0, 300) || null,
            error: data?.detail || data?.error || null,
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message })
    }
}
