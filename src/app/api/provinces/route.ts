import { NextResponse } from 'next/server'
import { db, provinces } from '@/db'
import { redis, cacheKeys, CACHE_TTL } from '@/lib/redis'
import { asc } from 'drizzle-orm'
import { MOCK_PROVINCES } from '@/lib/mock-data'

export async function GET() {
    // Dev mode: trả mock data, không chạm DB/Redis
    if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(MOCK_PROVINCES)
    }

    try {
        const cacheKey = cacheKeys.provinces()
        try {
            const cached = await redis.get(cacheKey)
            if (cached) return NextResponse.json(cached)
        } catch (_) { }

        const data = await db.select().from(provinces).orderBy(asc(provinces.name))

        try {
            await redis.set(cacheKey, data, { ex: CACHE_TTL * 24 })
        } catch (_) { }

        return NextResponse.json(data)
    } catch (err) {
        console.error('[/api/provinces]', err)
        return NextResponse.json({ error: 'Lỗi server', detail: String(err) }, { status: 500 })
    }
}
