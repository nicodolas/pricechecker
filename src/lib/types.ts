export type AppName = 'grab' | 'shopee' | 'baemin'

export interface AppPrice {
    app: AppName
    appLabel: string
    price: number | null
    originalPrice?: number | null
    dishName: string
    deepLink: string | null
    lastScrapedAt: string | null
    isStale: boolean // true nếu dữ liệu > 1 giờ
}

export interface DishComparison {
    canonicalName: string
    restaurantName: string
    restaurantAddress?: string
    prices: AppPrice[]
    cheapestApp: AppName | null
    mappingStatus: 'confirmed' | 'pending'
}

export interface SearchResult {
    dishes: DishComparison[]
    districtName: string
    provinceName: string
    query: string
    generatedAt: string
}

export interface Province {
    id: number
    name: string
    slug: string
}

export interface District {
    id: number
    name: string
    slug: string
    provinceId: number
}

export const APP_CONFIG: Record<AppName, { label: string; color: string; logo: string }> = {
    grab: {
        label: 'GrabFood',
        color: '#00B14F',
        logo: '/logos/grab.svg',
    },
    shopee: {
        label: 'ShopeeFood',
        color: '#EE4D2D',
        logo: '/logos/shopee.svg',
    },
    baemin: {
        label: 'Baemin',
        color: '#3AC5C0',
        logo: '/logos/baemin.svg',
    },
}
