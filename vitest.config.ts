/**
 * Vitest Configuration - Kiosk Testing Suite
 * Reference: https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // ============================================================
    // AMBIENTE DE TESTE
    // ============================================================
    environment: 'jsdom',
    globals: true,
    
    // ============================================================
    // SETUP & TEARDOWN
    // ============================================================
    setupFiles: [
      './src/__tests__/setup.ts',
    ],

    // ============================================================
    // COVERAGE
    // ============================================================
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'admin/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/mockData/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      all: true,
      lines: 85,
      functions: 85,
      branches: 80,
      statements: 85,
    },

    // ============================================================
    // REPORTERS
    // ============================================================
    reporters: ['verbose', 'html'],
    outputFile: {
      html: './coverage/index.html',
    },

    // ============================================================
    // TIMEOUT & PERFORMANCE
    // ============================================================
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,

    // ============================================================
    // ALIAS
    // ============================================================
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/context': path.resolve(__dirname, './src/context'),
    },

    // ============================================================
    // MOCKING
    // ============================================================
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,

    // ============================================================
    // ISOLAMENTO
    // ============================================================
    isolate: true,
    threads: true,
    singleThread: false,

    // ============================================================
    // TRANSFORMAÇÃO
    // ============================================================
    transformMode: {
      web: [/\.[jt]sx?$/],
    },

    // ============================================================
    // INCLUDES & EXCLUDES
    // ============================================================
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/context': path.resolve(__dirname, './src/context'),
    },
  },
});
