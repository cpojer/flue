import { describe, expect, it } from 'vitest';
import { createFlueContext, setFlueClient, useFlue, useFlueClient } from '../src/index.ts';

describe('@flue/svelte', () => {
	it('exports context helpers and useFlue', () => {
		expect(typeof createFlueContext).toBe('function');
		expect(typeof setFlueClient).toBe('function');
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
	});
});
