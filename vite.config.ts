import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
