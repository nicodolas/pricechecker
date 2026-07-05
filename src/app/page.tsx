'use client'

import { useState } from 'react'
import LocationPicker from '@/components/LocationPicker'
import SearchBar from '@/components/SearchBar'
import SearchResults from '@/components/SearchResults'
import type { District, SearchResult } from '@/lib/types'

export default function HomePage() {
    const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)
    const [result, setResult] = useState<SearchResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSearch = async (query: string) => {
        if (!selectedDistrict) return
        setLoading(true)
        setError(null)

        try {
            const res = await fetch(
                `/api/search?q=${encodeURIComponent(query)}&districtId=${selectedDistrict.id}`
            )
            if (!res.ok) throw new Error('Lỗi tìm kiếm')
            const data = await res.json()
            setResult(data)
        } catch (err) {
            setError('Không thể tải kết quả. Vui lòng thử lại.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-5">
            {/* Hero */}
            <div className="text-center py-6">
                <h2 className="text-2xl font-bold text-gray-900">
                    Tìm app giao đồ ăn rẻ nhất 🎯
                </h2>
                <p className="text-gray-500 mt-2 text-sm">
                    So sánh giá realtime trên GrabFood, ShopeeFood và Baemin
                </p>
            </div>

            {/* Controls */}
            <div className="bg-white border rounded-2xl p-4 space-y-3 shadow-sm">
                <LocationPicker
                    onDistrictSelect={setSelectedDistrict}
                    selectedDistrict={selectedDistrict}
                />
                <SearchBar
                    onSearch={handleSearch}
                    disabled={!selectedDistrict}
                    placeholder={
                        selectedDistrict
                            ? `Tìm món ăn tại ${selectedDistrict.name}...`
                            : 'Chọn quận trước để tìm kiếm'
                    }
                />
            </div>

            {/* Results */}
            <SearchResults result={result} loading={loading} error={error} />
        </div>
    )
}
