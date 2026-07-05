/**
 * Mock data cho môi trường development.
 * File này KHÔNG được dùng trong production.
 * Chỉ active khi NODE_ENV === 'development'
 */

import type { Province, District, SearchResult } from './types'

export const MOCK_PROVINCES: Province[] = [
    { id: 1, name: 'TP. Hồ Chí Minh', slug: 'ho-chi-minh' },
    { id: 2, name: 'Hà Nội', slug: 'ha-noi' },
    { id: 3, name: 'Đà Nẵng', slug: 'da-nang' },
]

export const MOCK_DISTRICTS: District[] = [
    { id: 1, name: 'Quận 1', slug: 'quan-1', provinceId: 1 },
    { id: 3, name: 'Quận 3', slug: 'quan-3', provinceId: 1 },
    { id: 7, name: 'Quận 7', slug: 'quan-7', provinceId: 1 },
    { id: 13, name: 'Bình Thạnh', slug: 'binh-thanh', provinceId: 1 },
    { id: 101, name: 'Hoàn Kiếm', slug: 'hoan-kiem', provinceId: 2 },
    { id: 102, name: 'Đống Đa', slug: 'dong-da', provinceId: 2 },
    { id: 201, name: 'Hải Châu', slug: 'hai-chau', provinceId: 3 },
]

export const MOCK_SEARCH_RESULTS: Record<string, SearchResult> = {
    default: {
        query: '',
        districtName: 'Quận 1',
        provinceName: 'TP. Hồ Chí Minh',
        generatedAt: new Date().toISOString(),
        dishes: [
            {
                canonicalName: 'Cơm tấm sườn bì chả',
                restaurantName: 'Cơm Tấm Thuận Kiều',
                restaurantAddress: '123 Nguyễn Trãi, Quận 1',
                mappingStatus: 'confirmed',
                cheapestApp: 'shopee',
                prices: [
                    {
                        app: 'grab',
                        appLabel: 'GrabFood',
                        price: 65000,
                        originalPrice: null,
                        dishName: 'Cơm tấm sườn bì chả đặc biệt',
                        deepLink: 'https://food.grab.com',
                        lastScrapedAt: new Date(Date.now() - 10 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'shopee',
                        appLabel: 'ShopeeFood',
                        price: 59000,
                        originalPrice: 65000,
                        dishName: 'Cơm tấm sườn bì chả',
                        deepLink: 'https://shopeefood.vn',
                        lastScrapedAt: new Date(Date.now() - 15 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'baemin',
                        appLabel: 'Baemin',
                        price: 62000,
                        originalPrice: null,
                        dishName: 'Cơm tấm sườn bì chả',
                        deepLink: 'https://baemin.vn',
                        lastScrapedAt: new Date(Date.now() - 90 * 60000).toISOString(),
                        isStale: true,
                    },
                ],
            },
            {
                canonicalName: 'Bún bò Huế',
                restaurantName: 'Quán Bún Bò Bà Hai',
                restaurantAddress: '45 Lê Lai, Quận 1',
                mappingStatus: 'confirmed',
                cheapestApp: 'grab',
                prices: [
                    {
                        app: 'grab',
                        appLabel: 'GrabFood',
                        price: 55000,
                        originalPrice: null,
                        dishName: 'Bún bò Huế đặc biệt',
                        deepLink: 'https://food.grab.com',
                        lastScrapedAt: new Date(Date.now() - 5 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'shopee',
                        appLabel: 'ShopeeFood',
                        price: 58000,
                        originalPrice: null,
                        dishName: 'Bún bò Huế',
                        deepLink: 'https://shopeefood.vn',
                        lastScrapedAt: new Date(Date.now() - 20 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'baemin',
                        appLabel: 'Baemin',
                        price: null,
                        originalPrice: null,
                        dishName: 'Bún bò Huế',
                        deepLink: null,
                        lastScrapedAt: null,
                        isStale: true,
                    },
                ],
            },
            {
                canonicalName: 'Phở bò tái chín',
                restaurantName: 'Phở 24',
                restaurantAddress: '78 Đinh Tiên Hoàng, Quận 1',
                mappingStatus: 'pending',
                cheapestApp: 'baemin',
                prices: [
                    {
                        app: 'grab',
                        appLabel: 'GrabFood',
                        price: 75000,
                        originalPrice: null,
                        dishName: 'Phở bò tái',
                        deepLink: 'https://food.grab.com',
                        lastScrapedAt: new Date(Date.now() - 25 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'shopee',
                        appLabel: 'ShopeeFood',
                        price: 72000,
                        originalPrice: 80000,
                        dishName: 'Phở bò tái chín đặc biệt',
                        deepLink: 'https://shopeefood.vn',
                        lastScrapedAt: new Date(Date.now() - 18 * 60000).toISOString(),
                        isStale: false,
                    },
                    {
                        app: 'baemin',
                        appLabel: 'Baemin',
                        price: 70000,
                        originalPrice: null,
                        dishName: 'Phở bò tái chín',
                        deepLink: 'https://baemin.vn',
                        lastScrapedAt: new Date(Date.now() - 30 * 60000).toISOString(),
                        isStale: false,
                    },
                ],
            },
        ],
    },
}

/**
 * Lọc mock results theo query
 */
export function filterMockResults(query: string, districtId: number, districts: District[]): SearchResult {
    const district = districts.find((d) => d.id === districtId)
    const province = MOCK_PROVINCES.find((p) => p.id === district?.provinceId)

    const q = query.toLowerCase()
    const filtered = MOCK_SEARCH_RESULTS.default.dishes.filter(
        (d) =>
            d.canonicalName.toLowerCase().includes(q) ||
            d.restaurantName.toLowerCase().includes(q)
    )

    return {
        query,
        districtName: district?.name || 'Quận 1',
        provinceName: province?.name || 'TP. Hồ Chí Minh',
        generatedAt: new Date().toISOString(),
        dishes: filtered.length > 0 ? filtered : MOCK_SEARCH_RESULTS.default.dishes,
    }
}
