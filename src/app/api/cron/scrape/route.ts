/**
 * Cron endpoint — được gọi bởi cron-job.org
 *
 * Quota tối ưu (ScrapingAnt free 10,000 credits/tháng):
 *   - Mỗi lần chạy: 1 quận × 3 app × 10 credits = 30 credits
 *   - Tần suất: mỗi 4 giờ = 180 lần/tháng
 *   - Tổng: 5,400 credits/tháng ✅ còn dư ~4,600 credits buffer
 *
 * Setup cron-job.org:
 *   URL: https://pricechecker-huit.vercel.app/api/cron/scrape
 *   Schedule: Every 4 hours (0 *\/4 * * *)
 *   Header: x-cron-secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { scrapeAndSaveDistrict } from '@/lib/scrape-service'
import { db, districts, scraperLogs } from '@/db'
import { desc, eq } from 'drizzle-orm'
import { redis } from '@/lib/redis'

// Vercel free timeout: 10s. Pro: 60s.
// ScrapingAnt với 1 quận ~25s → cần Vercel Pro hoặc dùng background job
// Workaround: dùng maxDuration trong vercel.json
export const maxDuration = 60 // giây — cần Vercel Pro hoặc Hobby

export async function GET(req: NextRequest) {
    // Xác thực
    const secret = req.headers.get('x-cron-secret')
        || req.nextUrl.searchParams.get('secret')

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()

    try {
        // Cho phép chỉ định quận cụ thể
        const districtParam = req.nextUrl.searchParams.get('districtId')
        let districtId: number

        if (districtParam) {
            districtId = parseInt(districtParam)
        } else {
            // Chọn quận ít được cập nhật nhất (vòng xoay tự động)
            districtId = await getNextDistrict()
        }

        const result = await scrapeAndSaveDistrict(districtId)

        return NextResponse.json({
            ok: true,
            districtId,
            saved: result.saved,
            durationMs: Date.now() - startTime,
            errors: Object.values(result.errors).some(Boolean) ? result.errors : null,
        })
    } catch (err) {
        console.error('[cron/scrape]', err)
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
}

/**
 * Chọn quận tiếp theo cần scrape theo vòng xoay:
 * Ưu tiên quận chưa được scrape hoặc được scrape lâu nhất.
 */
async function getNextDistrict(): Promise<number> {
    // Dùng Redis để track thứ tự vòng xoay — nhanh hơn query DB
    const REDIS_KEY = 'cron:district-queue'

    try {
        // Lấy queue từ Redis
        const queue = await redis.lrange(REDIS_KEY, 0, -1)

        if (queue && queue.length > 0) {
            // Lấy quận đầu queue, đẩy về cuối
            const next = parseInt(queue[0])
            await redis.lmove(REDIS_KEY, REDIS_KEY, 'left', 'right')
            return next
        }
    } catch (_) {
        // Redis lỗi → fallback xuống DB
    }

    // Fallback: lấy quận có scraper_log cũ nhất
    const allDistricts = await db
        .select({ id: districts.id })
        .from(districts)
        .orderBy(districts.id)

    if (allDistricts.length === 0) return 1

    // Khởi tạo queue trong Redis nếu chưa có
    try {
        const ids = allDistricts.map((d) => String(d.id))
        await redis.rpush('cron:district-queue', ...ids)
        // Lấy quận đầu tiên
        await redis.lmove('cron:district-queue', 'cron:district-queue', 'left', 'right')
        return allDistricts[0].id
    } catch (_) { }

    return allDistricts[0].id
}
