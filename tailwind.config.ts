import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                grab: '#00B14F',
                shopee: '#EE4D2D',
                baemin: '#3AC5C0',
            },
        },
    },
    plugins: [],
}
export default config
