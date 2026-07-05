/**
 * API Key Pool — round-robin qua nhiều ScrapingAnt keys
 * Thêm keys vào .env dạng:
 *   SCRAPINGANT_API_KEYS=key1,key2,key3
 * Hoặc single key:
 *   SCRAPINGANT_API_KEY=key1
 */

import { redis } from './redis'

const REDIS_KEY = 'keypool:scrapingant:index'

function getKeys(): string[] {
    // Ưu tiên list keys
    const multiKeys = process.env.SCRAPINGANT_API_KEYS
    if (multiKeys) {
        return multiKeys.split(',').map((k) => k.trim()).filter(Boolean)
    }
    // Fallback về single key
    const single = process.env.SCRAPINGANT_API_KEY
    return single ? [single] : []
}

/**
 * Lấy key tiếp theo theo round-robin
 * Dùng Redis để đồng bộ giữa nhiều instances Vercel
 */
export async function getNextApiKey(): Promise<string | null> {
    const keys = getKeys()
    if (keys.length === 0) return null
    if (keys.length === 1) return keys[0]

    try {
        // Atomic increment trong Redis
        const index = await redis.incr(REDIS_KEY)
        return keys[(index - 1) % keys.length]
    } catch (_) {
        // Redis lỗi → dùng key đầu tiên
        return keys[0]
    }
}

export function getKeyCount(): number {
    return getKeys().length
}
