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
        browser: 'true',
        'page-load-delay': '6000',
    })

    try {
        const res = await fetch(`https://api.scrapingant.com/v2/general?${params}`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(35000),
        })

        const html = await res.text()

        // Tìm các đoạn JSON có thể chứa data
        const hasNextData = html.includes('__NEXT_DATA__')
        const hasSearchMerchants = html.includes('searchMerchants')
        const hasMerchantId = html.includes('merchantID') || html.includes('merchant_id')

        // Tìm đoạn text xung quanh từ khoá quan trọng
        let dataContext = ''
        const idx = html.indexOf('merchantID')
        if (idx > 0) dataContext = html.substring(Math.max(0, idx - 50), idx + 200)

        return NextResponse.json({
            status: res.status,
            contentLength: html.length,
            hasNextData,
            hasSearchMerchants,
            hasMerchantId,
            dataContext: dataContext || '(not found)',
            // 200 ký tự ở body tag để xem content đã render chưa
            bodyPreview: html.substring(html.indexOf('<body'), html.indexOf('<body') + 300),
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message })
    }
}
