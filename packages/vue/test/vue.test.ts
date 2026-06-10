import { describe, expect, it } from 'vitest';
import { createFluePlugin, useFlue, useFlueClient } from '../src/index.ts';

describe('@flue/vue', () => {
	it('exports a plugin that provides a Flue client', () => {
		const provided = new Map<unknown, unknown>();
		const plugin = createFluePlugin({ client: {} as never });

		plugin.install?.({ provide: (key: unknown, value: unknown) => provided.set(key, value) } as never);

		expect(provided.size).toBe(1);
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
	});
});
