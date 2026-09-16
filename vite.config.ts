import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	return {
		build: {
			manifest: true
		},
		plugins: [
			{
				// Required for opfs
				name: 'configure-response-headers',
				configureServer(server) {
					server.middlewares.use((_req, res, next) => {
						res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
						res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
						next();
					});
				}
			},
			SvelteKitPWA({
				srcDir: './src',
				pwaAssets: {
					config: true
				},
				devOptions: {
					enabled: true
				},
				manifest: {
					// includeAssets: ["favicon.ico", "apple-touch-icon.png", "assets/*"]
					name: 'HiFicoos',
					short_name: 'HiFicoos',
					start_url: '/',
					background_color: '#ffffff',
					theme_color: '#000000',
					icons: [
						{
							src: 'pwa-64x64.png',
							sizes: '64x64',
							type: 'image/png'
						},
						{
							src: 'pwa-192x192.png',
							sizes: '192x192',
							type: 'image/png'
						},
						{
							src: 'pwa-512x512.png',
							sizes: '512x512',
							type: 'image/png'
						},
						{
							src: 'maskable-icon-512x512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'maskable'
						}
					]
				},
				injectManifest: {
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
				},
				workbox: {
					maximumFileSizeToCacheInBytes: 4 * (1 << 20),
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
				}
			}),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter()
			})
		],
		server: {
			// hmr: {
			// 	headers: {
			// 		'Cross-Origin-Resource-Policy': 'cross-origin'
			// 	}
			// },
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp'
			},
			cors: {
				origin: env.VITE_NAVIDROME_URL ?? true
			}
		},
		optimizeDeps: {
			exclude: ['@sqlite.org/sqlite-wasm']
		},
		worker: {
			format: 'es',
			plugins: () => []
		},
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},

				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});
