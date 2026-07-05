export type AppName = 'grab' | 'shopee' | 'baemin'

export interface ScrapedDish {
    restaurantName: string
    appRestaurantId: string
    dishName: string
    price: number
    originalPrice?: number | null
    imageUrl?: string | null
    deepLink?: string | null
    app: AppName
}

// Tọa độ trung tâm các quận — dùng chung cho tất cả scrapers
export const DISTRICT_COORDS: Record<number, [number, number]> = {
    1: [10.7769, 106.7009],
    2: [10.7873, 106.7516],
    3: [10.7780, 106.6892],
    4: [10.7574, 106.7029],
    5: [10.7540, 106.6580],
    6: [10.7478, 106.6342],
    7: [10.7301, 106.7218],
    8: [10.7237, 106.6508],
    9: [10.8233, 106.8076],
    10: [10.7737, 106.6681],
    11: [10.7631, 106.6509],
    12: [10.8652, 106.6580],
    13: [10.8120, 106.7086], // Bình Thạnh
    14: [10.8383, 106.6654], // Gò Vấp
    15: [10.7988, 106.6798], // Phú Nhuận
    16: [10.8031, 106.6520], // Tân Bình
    17: [10.7917, 106.6262], // Tân Phú
    18: [10.8706, 106.7516], // Thủ Đức
    101: [21.0285, 105.8542], // Hoàn Kiếm
    102: [21.0245, 105.8412], // Đống Đa
    103: [21.0164, 105.8590], // Hai Bà Trưng
    104: [21.0359, 105.7933], // Cầu Giấy
    105: [20.9889, 105.8073], // Thanh Xuân
    106: [20.9757, 105.8636], // Hoàng Mai
    201: [16.0678, 108.2208], // Hải Châu
    202: [16.0735, 108.1953], // Thanh Khê
    203: [16.0673, 108.2379], // Sơn Trà
    204: [15.9891, 108.2518], // Ngũ Hành Sơn
}
