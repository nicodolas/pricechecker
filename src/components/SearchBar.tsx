'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

interface Props {
    onSearch: (query: string) => void
    disabled?: boolean
    placeholder?: string
}

export default function SearchBar({ onSearch, disabled, placeholder }: Props) {
    const [value, setValue] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (value.trim()) onSearch(value.trim())
    }

    return (
        <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder || 'Tìm món ăn, nhà hàng...'}
                    disabled={disabled}
                    className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-400"
                />
            </div>
            <button
                type="submit"
                disabled={disabled || !value.trim()}
                className="px-5 py-3 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Tìm
            </button>
        </form>
    )
}
