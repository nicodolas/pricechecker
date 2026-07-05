/**
 * Cron endpoint — được gọi bởi cron-job.org mỗi 30 phút
 * Bảo mật bằng CRON_SECRET header
 *
 * Setup cron-job.org:
 *   URL: https://your-domain.com/api/cron/scrape
 *   Method: GET
 *   Header: x-cron-secret: <CRON_SECRET từ .env>
 *   Schedule: mỗi 30 phút
 */

import { NextRequest, NextResponse } from 'next/server'
import { scrapeAndSaveDistrict } from '@/lib/scrape-service'
import { db, districts } from '@/db'

// Giới hạn số quận scrape mỗi lần chạy cron
// Tránh timeout (Vercel free: 10s, Pro: 60s)
const MAX_DISTRICTS_PER_RUN = 5

export async function GET(req: NextRequest) {
    // Xác thực secret
    const secret = req.headers.get('x-cron-secret')
        || req.nextUrl.searchParams.get('secret')

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cho phép chỉ định district cụ thể qua query param
    const districtParam = req.nextUrl.searchParams.get('districtId')

    const startTime = Date.now()
    const results: Array<{ districtId: number; saved: number; durationMs: number }> = []
    const allErrors: Record<string, any> = {}

    try {
        let districtIds: number[]

        if (districtParam) {
            // Chạy 1 quận cụ thể
            districtIds = [parseInt(districtParam)]
        } else {
            // Lấy danh sách quận từ DB, giới hạn số lượng mỗi lần
            const allDistricts = await db
                .select({ id: districts.id })
                .from(districts)
                .limit(MAX_DISTRICTS_PER_RUN)

            // TODO: Rotate quận để đảm bảo tất cả đều được cập nhật
            // Có thể dùng Redis để track quận nào đã cập nhật gần nhất
            districtIds = allDistricts.map((d) => d.id)
        }

        // Chạy tuần tự để tránh rate limit Firecrawl
        for (const districtId of districtIds) {
            try {
                const result = await scrapeAndSaveDistrict(districtId)
                results.push({ districtId, ...result })
                if (Object.values(result.errors).some((e) => e !== null)) {
                    allErrors[districtId] = result.errors
                }
            } catch (err) {
                allErrors[districtId] = String(err)
            }
        }

        return NextResponse.json({
            ok: true,
            districtsProcessed: districtIds.length,
            totalSaved: results.reduce((sum, r) => sum + r.saved, 0),
            totalDurationMs: Date.now() - startTime,
            results,
            errors: Object.keys(allErrors).length > 0 ? allErrors : null,
        })
    } catch (err) {
        console.error('[cron/scrape]', err)
        return NextResponse.json(
            { ok: false, error: String(err) },
            { status: 500 }
        )
    }
}
