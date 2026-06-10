import { afterEach, describe, expect, it, vi } from 'vitest';

const svelteContext = vi.hoisted(() => ({
	client: undefined as any,
	destroyCallbacks: [] as Array<() => void>,
}));

vi.mock('svelte', () => ({
	getContext: () => svelteContext.client,
	onDestroy: (callback: () => void) => {
		svelteContext.destroyCallbacks.push(callback);
	},
	setContext: (_key: unknown, value: unknown) => {
		svelteContext.client = value;
	},
}));

import { createFlueContext, setFlueClient, useFlue, useFlueClient } from '../src/index.ts';

describe('@flue/svelte', () => {
	afterEach(() => {
		svelteContext.client = undefined;
		svelteContext.destroyCallbacks = [];
		vi.clearAllMocks();
	});

	it('exports context helpers and useFlue', () => {
		expect(typeof createFlueContext).toBe('function');
		expect(typeof setFlueClient).toBe('function');
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
	});

	it('releases the controller on component destroy instead of store unsubscribe', () => {
		const controller = {
			getSnapshot: () => ({
				id: 'inst-1',
				connectionStatus: 'disconnected',
				status: 'idle',
				isSubmitting: false,
				isStreaming: false,
				error: null,
				events: [],
				messages: [],
				text: '',
				checkpoint: null,
				latestOperation: null,
			}),
			subscribe: vi.fn(() => vi.fn()),
			send: vi.fn(),
			reconnect: vi.fn(),
			stop: vi.fn(),
			reset: vi.fn(),
		};
		const appClient = {
			agent: vi.fn(() => controller),
			releaseAgent: vi.fn(),
		};
		svelteContext.client = appClient;

		const flue = useFlue({ agent: 'support', id: 'inst-1' });
		const unsubscribe = flue.subscribe(() => {});
		unsubscribe();

		expect(appClient.releaseAgent).not.toHaveBeenCalled();
		svelteContext.destroyCallbacks.at(-1)?.();
		expect(appClient.releaseAgent).toHaveBeenCalledWith(controller);
	});
});
