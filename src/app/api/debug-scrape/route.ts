import { NextRequest, NextResponse } from 'next/server'
import { getNextApiKey } from '@/lib/key-pool'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = req.nextUrl.searchParams.get('app') || 'grab-api'
    const apiKey = await getNextApiKey()
    if (!apiKey) return NextResponse.json({ error: 'No API key' })

    let targetUrl: string
    let method = 'GET'
    let body: string | undefined

    switch (app) {
        case 'grab-api':
            // Test Grab API trực tiếp — không qua ScrapingAnt
            targetUrl = 'https://portal.grab.com/foodweb/v2/search'
            method = 'POST'
            body = JSON.stringify({
                countryCode: 'VN',
                keyword: 'cơm',
                offset: 0,
                pageSize: 5,
                location: { latitude: 10.7769, longitude: 106.7009 },
            })
            break
        case 'shopee-api':
            targetUrl = 'https://gappapi.deliverynow.vn/api/delivery/get_delivery_list?keyword=com&latitude=10.7769&longitude=106.7009&is_foody=1&page_index=0'
            break
        default:
            targetUrl = 'https://food.grab.com/vn/vi/search?query=com&lat=10.7769&lng=106.7009'
    }

    // Test 1: Direct call (không qua proxy)
    try {
        const directRes = await fetch(targetUrl, {
            method,
            headers: {
                'content-type': 'application/json',
                'origin': 'https://food.grab.com',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
                'x-country-code': 'VN',
            },
            body,
            signal: AbortSignal.timeout(8000),
        })
        const directText = await directRes.text()

        return NextResponse.json({
            app,
            directCall: {
                status: directRes.status,
                contentLength: directText.length,
                preview: directText.substring(0, 400),
                isJson: directText.trim().startsWith('{') || directText.trim().startsWith('['),
            },
        })
    } catch (err: any) {
        return NextResponse.json({ app, error: err.message })
    }
}
