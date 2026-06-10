import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			'@flue/client': fileURLToPath(new URL('../../packages/client/src/index.ts', import.meta.url)),
			'@flue/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
			'@flue/svelte': fileURLToPath(new URL('../../packages/svelte/src/index.ts', import.meta.url)),
		},
	},
});
