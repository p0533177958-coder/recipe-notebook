import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// BASE_PATH lets the same build run at a domain root (Netlify / Cloudflare Pages)
// or under a sub-path (GitHub Pages: BASE_PATH=/repo-name/).
const base = process.env.BASE_PATH ?? '/';

// GitHub Pages has no SPA rewrites: serving index.html as 404.html makes deep links work.
const spa404: Plugin = {
  name: 'spa-404',
  apply: 'build',
  closeBundle() {
    const dist = resolve(import.meta.dirname, 'dist');
    copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
  },
};

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'מחברת מתכונים',
        short_name: 'מתכונים',
        description: 'מחברת מתכונים אישית עם מצב בישול שלב-אחר-שלב וטיימרים',
        lang: 'he',
        dir: 'rtl',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF6EE',
        theme_color: '#FBF6EE',
        categories: ['food', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press shortcuts on the home-screen icon (handled by query parameters on the home screen).
        shortcuts: [
          { name: 'הוספת מתכון', short_name: 'הוספה', url: `${base}?add=1`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'רשימת קניות', short_name: 'קניות', url: `${base}shopping`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'מה נבשל היום?', short_name: 'מה נבשל?', url: `${base}?random=1`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'application/json', '.json'] }],
          },
        },
      },
      devOptions: { enabled: false },
    }),
    spa404,
  ],
});
