import type { FlueAgentControllerOptions } from '@flue/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controller = vi.hoisted(() => ({
	getSnapshot: vi.fn(() => createSnapshot()),
	getServerSnapshot: vi.fn(() => createSnapshot()),
	subscribe: vi.fn(() => vi.fn()),
	send: vi.fn(),
	reconnect: vi.fn(),
	stop: vi.fn(),
	reset: vi.fn(),
}));

const appClient = vi.hoisted(() => ({
	agent: vi.fn(() => controller),
	releaseAgent: vi.fn(),
}));

type EffectSlot = {
	cleanup?: () => void;
	deps?: Array<unknown>;
};

type EffectEventSlot<T extends (...args: Array<never>) => unknown> = {
	current: T;
	wrapper: T;
};

const hookRuntime = vi.hoisted(() => {
	let stateIndex = 0;
	let effectIndex = 0;
	let effectEventIndex = 0;
	const stateSlots: Array<unknown> = [];
	const effectSlots: Array<EffectSlot> = [];
	const effectEventSlots: Array<EffectEventSlot<(...args: Array<never>) => unknown>> = [];

	return {
		resetRender() {
			stateIndex = 0;
			effectIndex = 0;
			effectEventIndex = 0;
		},
		resetAll() {
			stateIndex = 0;
			effectIndex = 0;
			effectEventIndex = 0;
			stateSlots.length = 0;
			effectSlots.length = 0;
			effectEventSlots.length = 0;
		},
		useState<T>(initializer: () => T): [T] {
			const index = stateIndex++;
			if (!stateSlots[index]) stateSlots[index] = initializer();
			return [stateSlots[index] as T];
		},
		useEffect(effect: () => undefined | (() => void), deps: Array<unknown>) {
			const index = effectIndex++;
			const slot = effectSlots[index];
			if (slot && sameDeps(slot.deps, deps)) return;
			slot?.cleanup?.();
			const cleanup = effect() ?? undefined;
			effectSlots[index] = { cleanup, deps };
		},
		useEffectEvent<T extends (...args: Array<never>) => unknown>(callback: T): T {
			const index = effectEventIndex++;
			const slot = effectEventSlots[index];
			if (slot) {
				slot.current = callback;
				return slot.wrapper as T;
			}
			const nextSlot: EffectEventSlot<T> = {
				current: callback,
				wrapper: ((...args: Array<never>) => nextSlot.current(...args)) as T,
			};
			effectEventSlots[index] = nextSlot;
			return nextSlot.wrapper;
		},
	};
});

vi.mock('react', () => ({
	createContext: () => ({}),
	use: (value: unknown) => value,
	useActionState: () => [null, vi.fn(), false],
	useContext: () => appClient,
	useEffect: hookRuntime.useEffect,
	useEffectEvent: hookRuntime.useEffectEvent,
	useMemo: (factory: () => unknown) => factory(),
	useState: hookRuntime.useState,
	useSyncExternalStore: (_subscribe: () => () => void, getSnapshot: () => unknown) => getSnapshot(),
}));

import { FlueProvider, useFlue, useFlueClient, useFlueOperation } from '../src/index.tsx';

describe('@flue/react', () => {
	beforeEach(() => {
		hookRuntime.resetAll();
		vi.clearAllMocks();
	});

	it('exports the provider and hooks', () => {
		expect(typeof FlueProvider).toBe('function');
		expect(typeof useFlueClient).toBe('function');
		expect(typeof useFlue).toBe('function');
		expect(typeof useFlueOperation).toBe('function');
	});

	it('keeps inline event callbacks from reconnecting when rerendered', () => {
		const firstOnEvent = vi.fn();
		const secondOnEvent = vi.fn();
		const firstReduceEvent = vi.fn((snapshot) => snapshot);
		const secondReduceEvent = vi.fn((snapshot) => snapshot);

		hookRuntime.resetRender();
		useFlue({
			agent: 'support',
			id: 'inst-1',
			onEvent: firstOnEvent,
			reduceEvent: firstReduceEvent,
		});
		const firstOptions = appClient.agent.mock.calls[0]?.[0] as FlueAgentControllerOptions;

		hookRuntime.resetRender();
		useFlue({
			agent: 'support',
			id: 'inst-1',
			onEvent: secondOnEvent,
			reduceEvent: secondReduceEvent,
		});

		expect(appClient.agent).toHaveBeenCalledTimes(1);
		firstOptions.onEvent?.({
			id: 'event:1',
			batchId: 'batch:1',
			indexInBatch: 0,
			receivedAt: 0,
			event: { type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' },
		});
		const snapshot = createSnapshot();
		firstOptions.reduceEvent?.(snapshot, {
			id: 'event:2',
			batchId: 'batch:1',
			indexInBatch: 1,
			receivedAt: 0,
			event: { type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' },
		});

		expect(firstOnEvent).not.toHaveBeenCalled();
		expect(secondOnEvent).toHaveBeenCalledTimes(1);
		expect(firstReduceEvent).not.toHaveBeenCalled();
		expect(secondReduceEvent).toHaveBeenCalledTimes(1);
	});
});

function sameDeps(first: Array<unknown> | undefined, second: Array<unknown>): boolean {
	return Boolean(first && first.length === second.length && first.every((value, index) => Object.is(value, second[index])));
}

function createSnapshot() {
	return {
		id: 'inst-1',
		connectionStatus: 'disconnected' as const,
		status: 'idle' as const,
		isSubmitting: false,
		isStreaming: false,
		error: null,
		events: [],
		messages: [],
		text: '',
		checkpoint: null,
		latestOperation: null,
	};
}
