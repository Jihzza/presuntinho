import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4178);
const baseURL = `http://127.0.0.1:${port}`;
const readinessURL = `${baseURL}/mensagens/`;

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	fullyParallel: false,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off'
	},
	projects: [
		{
			name: 'chromium-desktop',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'chromium-mobile',
			use: { ...devices['iPhone 13'], browserName: 'chromium' }
		}
	],
	webServer: {
		command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
		// Warm the route exercised by the suite. Waiting only on `/` lets Vite
		// report ready before the larger messages module graph has even started
		// its first development compile.
		url: readinessURL,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
