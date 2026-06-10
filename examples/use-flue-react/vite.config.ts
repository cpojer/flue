import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		alias: {
			'@flue/client': fileURLToPath(new URL('../../packages/client/src/index.ts', import.meta.url)),
			'@flue/react': fileURLToPath(new URL('../../packages/react/src/index.tsx', import.meta.url)),
			'@flue/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
		},
	},
});
