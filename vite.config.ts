/// <reference types="vitest" />
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

// Generate build ID: v{VERSION}-{GIT_SHA}-{TIMESTAMP}
const version = JSON.parse(readFileSync('package.json', 'utf-8')).version;
const commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
const BUILD_ID = `v${version}-${commitSha}-${Date.now()}`;
const CACHE_NAME = `presuntino-${BUILD_ID}`;

let isSsrBuild = false;

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: 'presuntinho:pwa-client-dir',
      apply: 'build',
      configResolved(config) {
        isSsrBuild = Boolean(config.build.ssr);
      },
      closeBundle: {
        sequential: true,
        enforce: 'pre',
        handler() {
          if (isSsrBuild) mkdirSync('.svelte-kit/output/client', { recursive: true });
        }
      }
    },
    // Phase 10: PWA — install as a SPA (adapter-static + ssr=false in +layout.ts).
    // The manifest is shipped as static/manifest.webmanifest and copied into the
    // build as-is (manifest: false). Icons live in static/icons/. The plugin
    // generates sw.js from the workbox config below.
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false, // we register manually in +layout.svelte via virtual:pwa-register
      manifest: false, // use static/manifest.webmanifest (copied verbatim into the build)
      devOptions: {
        enabled: false // keep dev clean; SW only ships in production build
      },
      workbox: {
        // @vite-pwa/sveltekit generates the worker during the SSR build, then
        // adapter-static copies client output to build/. Ensure the client dir
        // exists before Workbox writes here (Windows/Node 24 can otherwise race).
        swDest: '.svelte-kit/output/client/sw.js',
        globPatterns: [
          'client/**/*.{js,css,ico,png,svg,webp,woff,woff2,mp3,json,webmanifest}'
        ],
        // Tame Workbox warnings on Netlify: (a) raise the precache size limit
        // to fit large bundled audio/quiz assets, (b) silence the empty
        // `prerendered/**/*.{html,json}` glob warning because we ship a pure
        // SPA (ssr=false + prerender=false → no prerendered HTML exists).
        // Skander 1 diagnosis (deleg_aef67789, 2026-06-27) pinpointed the
        // regression to commit 53c842f which first added @vite-pwa/sveltekit.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        globIgnores: ['prerendered/**/*'],
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/api/, /^\/legacy/, /\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/quizzes/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'quizzes-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/lessons/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lessons-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      kit: {
        trailingSlash: 'always', // match +layout.ts
        spa: true // adapter-static + ssr=false → SPA navigation in the SW
      }
    })
  ],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node'
  }
});