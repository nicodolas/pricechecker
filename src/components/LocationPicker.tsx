'use client'

import { useEffect, useState } from 'react'
import type { Province, District } from '@/lib/types'
import { MapPin, ChevronDown } from 'lucide-react'

interface Props {
    onDistrictSelect: (district: District) => void
    selectedDistrict?: District | null
}

export default function LocationPicker({ onDistrictSelect, selectedDistrict }: Props) {
    const [provinces, setProvinces] = useState<Province[]>([])
    const [districts, setDistricts] = useState<District[]>([])
    const [selectedProvince, setSelectedProvince] = useState<Province | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetch('/api/provinces')
            .then((r) => r.json())
            .then(setProvinces)
    }, [])

    useEffect(() => {
        if (!selectedProvince) return
        setLoading(true)
        fetch(`/api/districts?provinceId=${selectedProvince.id}`)
            .then((r) => r.json())
            .then((data) => {
                setDistricts(data)
                setLoading(false)
            })
    }, [selectedProvince])

    return (
        <div className="flex flex-col sm:flex-row gap-3">
            {/* Chọn tỉnh/thành */}
            <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                    className="w-full pl-9 pr-8 py-2.5 border rounded-lg appearance-none bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    value={selectedProvince?.id || ''}
                    onChange={(e) => {
                        const p = provinces.find((p) => p.id === parseInt(e.target.value))
                        setSelectedProvince(p || null)
                        setDistricts([])
                    }}
                >
                    <option value="">Chọn tỉnh/thành phố</option>
                    {provinces.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>

            {/* Chọn quận/huyện */}
            <div className="relative flex-1">
                <select
                    className="w-full px-3 py-2.5 border rounded-lg appearance-none bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-400"
                    value={selectedDistrict?.id || ''}
                    disabled={!selectedProvince || loading}
                    onChange={(e) => {
                        const d = districts.find((d) => d.id === parseInt(e.target.value))
                        if (d) onDistrictSelect(d)
                    }}
                >
                    <option value="">
                        {loading ? 'Đang tải...' : selectedProvince ? 'Chọn quận/huyện' : 'Chọn tỉnh trước'}
                    </option>
                    {districts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>
        </div>
    )
}
