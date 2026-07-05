'use client'

import type { SearchResult } from '@/lib/types'
import PriceCard from './PriceCard'
import { RefreshCw } from 'lucide-react'

interface Props {
    result: (SearchResult & { isUpdating?: boolean }) | null
    loading: boolean
    error: string | null
}

export default function SearchResults({ result, loading, error }: Props) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <RefreshCw className="w-8 h-8 animate-spin text-orange-400" />
                <p className="text-sm">Đang tìm kiếm giá...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-12 text-red-500 bg-red-50 rounded-xl">
                <p className="font-medium">Có lỗi xảy ra</p>
                <p className="text-sm mt-1">{error}</p>
            </div>
        )
    }

    if (!result) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🍜</p>
                <p className="font-medium text-gray-600">Chọn quận và tìm kiếm món ăn</p>
                <p className="text-sm mt-1">So sánh giá trên Grab, ShopeeFood và Baemin</p>
            </div>
        )
    }

    // Đang scrape lần đầu — chưa có data
    if (result.dishes.length === 0 && result.isUpdating) {
        return (
            <div className="text-center py-16 text-gray-400">
                <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
                <p className="font-medium text-gray-600">Đang lấy dữ liệu lần đầu...</p>
                <p className="text-sm mt-1">Quá trình này mất khoảng 15-30 giây. Thử lại sau nhé!</p>
            </div>
        )
    }

    if (result.dishes.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-medium text-gray-600">Không tìm thấy kết quả</p>
                <p className="text-sm mt-1">
                    Thử tìm với từ khóa khác tại {result.districtName}, {result.provinceName}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Banner đang cập nhật */}
            {result.isUpdating && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Đang cập nhật giá mới nhất, kết quả hiện tại có thể chưa mới nhất
                </div>
            )}

            {/* Summary */}
            <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                    Tìm thấy <strong className="text-gray-800">{result.dishes.length}</strong> kết quả
                    cho "{result.query}" tại {result.districtName}
                </span>
                <span className="text-xs">
                    {new Date(result.generatedAt).toLocaleTimeString('vi-VN')}
                </span>
            </div>

            {/* Cards */}
            <div className="grid gap-4">
                {result.dishes.map((dish, i) => (
                    <PriceCard key={`${dish.restaurantName}-${dish.canonicalName}-${i}`} dish={dish} />
                ))}
            </div>
        </div>
    )
}
