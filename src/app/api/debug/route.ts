import { NextRequest, NextResponse } from 'next/server'

// Chỉ dùng để debug — xóa sau khi confirm
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
        hasScrapingAntKeys: !!process.env.SCRAPINGANT_API_KEYS,
        hasScrapingAntKey: !!process.env.SCRAPINGANT_API_KEY,
        keyCount: (process.env.SCRAPINGANT_API_KEYS?.split(',') || []).filter(Boolean).length,
        hasCronSecret: !!process.env.CRON_SECRET,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    })
}
