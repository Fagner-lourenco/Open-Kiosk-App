import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy para API do Mercado Pago com headers preservados
      '/api/mp': {
        target: 'https://api.mercadopago.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/mp/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Headers HTTP são case-insensitive, então verificamos em lowercase
            const headers = req.headers;
            
            // Preservar Authorization
            const authHeader = headers.authorization || headers.Authorization;
            if (authHeader) {
              proxyReq.setHeader('Authorization', authHeader);
            }
            
            // Preservar X-Idempotency-Key (verificar ambos os cases)
            const idempotencyKey = headers['x-idempotency-key'] || headers['X-Idempotency-Key'];
            if (idempotencyKey) {
              proxyReq.setHeader('X-Idempotency-Key', idempotencyKey);
            }
            
            // Preservar Content-Type
            const contentType = headers['content-type'] || headers['Content-Type'];
            if (contentType) {
              proxyReq.setHeader('Content-Type', contentType);
            }
          });
        },
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt'],
      workbox: {
        // Precache de assets estáticos
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Excluir arquivos grandes do precache
        globIgnores: ['**/attract/**', '**/node_modules/**'],
        // Aumentar limite para 5MB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Runtime caching strategies
        runtimeCaching: [
          {
            // Cache de fontes (Google Fonts, etc)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache de imagens externas
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
          {
            // Network First para API Firebase (dados sempre frescos quando online)
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 dia
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Cache de vídeos (StaleWhileRevalidate para melhor UX)
            urlPattern: /\.(?:mp4|webm|ogg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'videos-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
              },
              rangeRequests: true,
            },
          },
        ],
      },
      manifest: {
        name: 'Open Kiosk App',
        short_name: 'Kiosk',
        description: 'Sistema de autoatendimento para lojas',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/attract/beer-mug.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/attract/beer-mug.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      devOptions: {
        enabled: false, // Desabilitar em dev para evitar conflitos
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600, // Suprimir aviso para chunks até 1.6MB
  },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/real/setup.tsx'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/**',
          'src/__tests__/**',
          '**/*.d.ts',
          '**/*.config.*',
          '**/mockData/**',
          'dist/**',
        ],
      },
    },
}));
