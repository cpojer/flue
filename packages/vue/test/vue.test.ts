import { afterEach, describe, expect, it, vi } from 'vitest';

const vueContext = vi.hoisted(() => ({
	client: undefined as any,
	currentInstance: true,
	unmountCallbacks: [] as Array<() => void>,
}));

vi.mock('vue', () => ({
	computed: (getter: () => unknown) => ({
		get value() {
			return getter();
		},
	}),
	getCurrentInstance: () => (vueContext.currentInstance ? {} : null),
	inject: (_key: unknown, fallback: unknown) => vueContext.client ?? fallback,
	onUnmounted: (callback: () => void) => {
		vueContext.unmountCallbacks.push(callback);
	},
	provide: (_key: unknown, value: unknown) => {
		vueContext.client = value;
	},
	shallowRef: (value: unknown) => ({ value }),
}));

import { createFluePlugin, provideFlueClient, useFlue, useFlueClient } from '../src/index.ts';

describe('@flue/vue', () => {
	afterEach(() => {
		vueContext.client = undefined;
		vueContext.currentInstance = true;
		vueContext.unmountCallbacks = [];
		vi.clearAllMocks();
	});

	it('exports context helpers and useFlue', () => {
		const provided = new Map<unknown, unknown>();
		const plugin = createFluePlugin({ client: {} as never });

		plugin.install?.({ provide: (key: unknown, value: unknown) => provided.set(key, value) } as never);

		expect(provided.size).toBe(1);
		expect(typeof provideFlueClient).toBe('function');
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
	});

	it('subscribes to the controller and releases it on component unmount', () => {
		const unsubscribe = vi.fn();
		const controller = {
			getSnapshot: vi.fn(() => ({
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
			})),
			subscribe: vi.fn(() => unsubscribe),
			send: vi.fn(),
			reconnect: vi.fn(),
			stop: vi.fn(),
			reset: vi.fn(),
		};
		const appClient = {
			agent: vi.fn(() => controller),
			releaseAgent: vi.fn(),
		};
		vueContext.client = appClient;

		const flue = useFlue({ agent: 'support', id: 'inst-1' });

		expect(flue.id.value).toBe('inst-1');
		expect(controller.subscribe).toHaveBeenCalledTimes(1);
		expect(appClient.releaseAgent).not.toHaveBeenCalled();
		vueContext.unmountCallbacks.at(-1)?.();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(appClient.releaseAgent).toHaveBeenCalledWith(controller);
	});
});
