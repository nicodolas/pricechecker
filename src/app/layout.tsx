import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'vietnamese'] })

export const metadata: Metadata = {
    title: 'So Sánh Giá Đồ Ăn | Grab vs ShopeeFood vs Baemin',
    description: 'So sánh giá đồ ăn trên Grab, ShopeeFood và Baemin để tìm app rẻ nhất cho bạn',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="vi">
            <body className={inter.className}>
                <header className="border-b bg-white sticky top-0 z-10">
                    <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
                        <span className="text-2xl">🍜</span>
                        <h1 className="font-bold text-lg">So Sánh Giá Đồ Ăn</h1>
                        <div className="ml-auto flex gap-1 text-xs">
                            <span className="px-2 py-1 rounded-full text-white font-medium" style={{ background: '#00B14F' }}>Grab</span>
                            <span className="px-2 py-1 rounded-full text-white font-medium" style={{ background: '#EE4D2D' }}>Shopee</span>
                            <span className="px-2 py-1 rounded-full text-white font-medium" style={{ background: '#3AC5C0' }}>Baemin</span>
                        </div>
                    </div>
                </header>
                <main className="max-w-4xl mx-auto px-4 py-6">
                    {children}
                </main>
                <footer className="border-t mt-12 py-6 text-center text-sm text-gray-500">
                    Open source · Dữ liệu từ scraping · Không liên kết chính thức với Grab, ShopeeFood, Baemin
                </footer>
            </body>
        </html>
    )
}
