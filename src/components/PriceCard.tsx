'use client'

import { Clock, AlertCircle } from 'lucide-react'
import type { DishComparison, AppName } from '@/lib/types'
import { APP_CONFIG } from '@/lib/types'
import { clsx } from 'clsx'

interface Props {
    dish: DishComparison
}

const APP_ORDER: AppName[] = ['grab', 'shopee', 'baemin']

function formatPrice(price: number | null) {
    if (price === null) return '—'
    return price.toLocaleString('vi-VN') + 'đ'
}

function timeAgo(isoString: string | null) {
    if (!isoString) return 'Không rõ'
    const diff = Date.now() - new Date(isoString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Vừa xong'
    if (mins < 60) return `${mins} phút trước`
    const hrs = Math.floor(mins / 60)
    return `${hrs} giờ trước`
}

export default function PriceCard({ dish }: Props) {
    const priceMap = Object.fromEntries(dish.prices.map((p) => [p.app, p]))

    return (
        <div className="border rounded-2xl bg-white overflow-hidden shadow-sm hover:shadow-md transition">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-900 text-base">{dish.canonicalName}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{dish.restaurantName}</p>
                {dish.restaurantAddress && (
                    <p className="text-xs text-gray-400 mt-0.5">{dish.restaurantAddress}</p>
                )}
                {dish.mappingStatus === 'pending' && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        Chờ xác nhận mapping
                    </span>
                )}
            </div>

            {/* Price columns */}
            <div className="grid grid-cols-3 divide-x">
                {APP_ORDER.map((appKey) => {
                    const config = APP_CONFIG[appKey]
                    const priceData = priceMap[appKey]
                    const isCheapest = dish.cheapestApp === appKey
                    const hasData = !!priceData

                    return (
                        <div
                            key={appKey}
                            className={clsx(
                                'flex flex-col items-center gap-1 px-2 py-3 relative',
                                isCheapest && 'bg-green-50'
                            )}
                        >
                            {/* Badge rẻ nhất */}
                            {isCheapest && (
                                <span className="absolute top-2 right-2 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                                    Rẻ nhất
                                </span>
                            )}

                            {/* App label */}
                            <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                style={{ background: config.color }}
                            >
                                {config.label}
                            </span>

                            {hasData ? (
                                <>
                                    <span className={clsx('text-lg font-bold', isCheapest ? 'text-green-700' : 'text-gray-800')}>
                                        {formatPrice(priceData.price)}
                                    </span>

                                    {priceData.originalPrice && priceData.originalPrice > (priceData.price || 0) && (
                                        <span className="text-xs text-gray-400 line-through">
                                            {formatPrice(priceData.originalPrice)}
                                        </span>
                                    )}

                                    <span className={clsx(
                                        'flex items-center gap-0.5 text-xs',
                                        priceData.isStale ? 'text-amber-500' : 'text-gray-400'
                                    )}>
                                        <Clock className="w-3 h-3" />
                                        {timeAgo(priceData.lastScrapedAt)}
                                        {priceData.isStale && ' ⚠️'}
                                    </span>
                                </>
                            ) : (
                                <span className="text-sm text-gray-400 mt-1">Không có</span>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
