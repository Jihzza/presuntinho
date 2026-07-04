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

// Define cache-busting plugin inline to avoid separate file
function cacheBustingPlugin(buildId) {
  return {
    name: 'presuntinho:cache-busting',
    transformIndexHtml(html) {
      // Add ?v={BUILD_ID} to manifest and other cacheable resources
      return html
        .replace(
          /<link\s+([^>]*?)href="([^"]+)"/g,
          (match, attrs, href) => {
            // Only process manifest link
            if (attrs.includes('rel="manifest"')) {
              if (!href.startsWith('http') && !href.startsWith('//')) {
                return match.replace(href, `${href}?v=${buildId}`);
              }
            }
            return match;
          }
        );
    }
  };
}

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
    // Add cache-busting to manifest link in HTML
    cacheBustingPlugin(BUILD_ID),
    // Phase 10: PWA — install as a SPA (adapter-static + ssr=false in +layout.ts).
    // The manifest is shipped as static/manifest.webmanifest and copied into the
    // build as-is (manifest: false). Icons live in static/icons/. The plugin
    // generates sw.js from the workbox config below.
    SvelteKitPWA({
      strategies: 'generateSW',
      // 'prompt': new SW waits until the user accepts the in-app update toast
      // ('presuntinho:pwa-update' event dispatched from +layout.svelte's
      // onNeedRefresh → toast button calls updateServiceWorker(true), which
      // posts SKIP_WAITING). No more silent mid-session reloads.
      registerType: 'prompt',
      injectRegister: false, // we register manually in +layout.svelte via virtual:pwa-register
      manifest: false, // use static/manifest.webmanifest (copied verbatim into the build)
      devOptions: {
        enabled: false // keep dev clean; SW only ships in production build
      },
      workbox: {
        // Prefix cache name with unique build ID to force cache invalidation on deploy
        cacheId: CACHE_NAME,
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
        // Must be false with registerType 'prompt': the new SW stays waiting
        // until the user accepts the update toast. The generated worker always
        // includes the SKIP_WAITING message listener, which
        // updateServiceWorker(true) (virtual:pwa-register) triggers.
        skipWaiting: false,
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
        // CRITICAL (production install fix): the SPA fallback entry is only
        // added to the precache manifest when BOTH `spa` AND `adapterFallback`
        // are set (see node_modules/@vite-pwa/sveltekit/dist/index.mjs,
        // createManifestTransform: `if (options?.spa && options?.adapterFallback)`).
        // With `spa: true` alone, nothing for '/' was precached, so the
        // generated sw.js threw `non-precached-url` from
        // createHandlerBoundToURL('/') and NEVER installed in production.
        // - adapterFallback must match svelte.config.js → adapter-static
        //   `fallback: 'index.html'`.
        // - fallbackMapping: '/' makes the precached URL literally '/'
        //   (the pushed entry bypasses the html→route rewrite), matching the
        //   server route that serves index.html AND workbox.navigateFallback
        //   above, so createHandlerBoundToURL('/') now resolves.
        // - The entry's revision comes from client/_app/version.json (hashed
        //   per build), so the fallback updates on every deploy.
        adapterFallback: 'index.html',
        spa: { fallbackMapping: '/' }
      }
    })
  ],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node'
  }
});