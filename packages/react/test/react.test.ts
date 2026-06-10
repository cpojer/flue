import { describe, expect, it } from 'vitest';
import { FlueProvider, useFlue, useFlueClient, useFlueOperation } from '../src/index.tsx';

describe('@flue/react', () => {
	it('exports the provider and hooks', () => {
		expect(typeof FlueProvider).toBe('function');
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
		expect(typeof useFlueOperation).toBe('function');
	});
});
