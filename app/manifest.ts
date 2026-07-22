import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Health Tracker',
    short_name: 'Tracker',
    description: 'Exercise and Dance Dance Revolution logging',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d1128',
    theme_color: '#0d1128',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
