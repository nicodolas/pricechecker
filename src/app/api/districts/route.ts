import { NextRequest, NextResponse } from 'next/server'
import { db, districts } from '@/db'
import { redis, cacheKeys, CACHE_TTL } from '@/lib/redis'
import { eq, asc } from 'drizzle-orm'
import { MOCK_DISTRICTS } from '@/lib/mock-data'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const provinceId = parseInt(searchParams.get('provinceId') || '0')

    if (!provinceId) {
        return NextResponse.json({ error: 'Thiếu provinceId' }, { status: 400 })
    }

    // Dev mode: trả mock data, không chạm DB/Redis
    if (process.env.NODE_ENV === 'development') {
        const filtered = MOCK_DISTRICTS.filter((d) => d.provinceId === provinceId)
        return NextResponse.json(filtered)
    }

    try {
        const cacheKey = cacheKeys.districts(provinceId)
        try {
            const cached = await redis.get(cacheKey)
            if (cached) return NextResponse.json(cached)
        } catch (_) { }

        const data = await db
            .select()
            .from(districts)
            .where(eq(districts.provinceId, provinceId))
            .orderBy(asc(districts.name))

        try {
            await redis.set(cacheKey, data, { ex: CACHE_TTL * 24 })
        } catch (_) { }

        return NextResponse.json(data)
    } catch (err) {
        console.error('[/api/districts]', err)
        return NextResponse.json({ error: 'Lỗi server', detail: String(err) }, { status: 500 })
    }
}
