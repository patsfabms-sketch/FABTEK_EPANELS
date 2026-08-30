import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes the mobile technician view installable on a phone ("Add to
    // Home Screen" -> a real app icon that opens full-screen, no browser
    // chrome). start_url points straight at the mobile view (not "/", which
    // redirects to the desktop console — see App.jsx) so installing from a
    // phone lands technicians in the right place immediately. scope stays
    // "/" (not "/#/mobile") since this is one SPA — a technician tapping
    // "Manager (desktop) console" from the mobile view needs to stay inside
    // the installed app rather than getting kicked out to the browser.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'AssemblyOS — Production Console',
        short_name: 'AssemblyOS',
        description: "FabTek wiring department production tracking",
        start_url: '/#/mobile',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0f14',
        theme_color: '#3b6fe0',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
