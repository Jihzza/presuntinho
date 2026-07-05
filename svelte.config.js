import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    paths: {
      // Root-hosted SPA on Netlify/local preview: deep links such as
      // /escola/curso/marketing-digital/ must load assets from /_app/..., not
      // from /escola/curso/marketing-digital/_app/...
      relative: false
    },
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',  // SPA fallback
      precompress: false,
      strict: false
    })
  }
};
export default config;
