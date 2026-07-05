import { Redis } from '@upstash/redis'

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// TTL 30 phút
export const CACHE_TTL = 60 * 30

// Key patterns
export const cacheKeys = {
    // Giá theo quận + tên món
    searchResults: (districtId: number, query: string) =>
        `search:${districtId}:${query.toLowerCase().trim()}`,

    // Danh sách quận theo tỉnh
    districts: (provinceId: number) =>
        `districts:${provinceId}`,

    // Danh sách tỉnh
    provinces: () => `provinces:all`,

    // Scraper status của app theo quận
    scraperStatus: (app: string, districtId: number) =>
        `scraper:status:${app}:${districtId}`,
}
