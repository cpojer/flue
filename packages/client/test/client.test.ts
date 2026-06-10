import type { AttachedAgentEvent } from '@flue/sdk';
import { describe, expect, it } from 'vitest';
import {
	createFlueAppClient,
	createMemoryFlueStorage,
	type FlueAgentEventReducer,
	type FlueClient,
	FlueConfigurationError,
	type FlueEventBatch,
} from '../src/index.ts';

describe('createFlueAppClient()', () => {
	it('shares controllers for the same agent instance until released', () => {
		const storage = createMemoryFlueStorage();
		const app = createFlueAppClient({
			client: createFakeSdk(),
			storage,
			storageNamespace: 'test',
		});

		const first = app.agent({ agent: 'support', id: 'user-1' });
		const second = app.agent({ agent: 'support', id: 'user-1' });

		expect(first).toBe(second);
		app.releaseAgent(first);
		const third = app.agent({ agent: 'support', id: 'user-1' });
		expect(third).toBe(second);
		app.releaseAgent(second);
		app.releaseAgent(third);
	});

	it('rejects conflicting controller options for the same agent instance', () => {
		const app = createFlueAppClient({
			client: createFakeSdk(),
			storage: false,
		});
		const firstReducer: FlueAgentEventReducer = (snapshot) => snapshot;
		const secondReducer: FlueAgentEventReducer = (snapshot) => snapshot;

		const first = app.agent({ agent: 'support', id: 'user-1', reduceEvent: firstReducer });
		const second = app.agent({ agent: 'support', id: 'user-1', reduceEvent: firstReducer });

		expect(first).toBe(second);
		expect(() => app.agent({ agent: 'support', id: 'user-1', reduceEvent: secondReducer })).toThrow(
			FlueConfigurationError,
		);
		app.releaseAgent(first);
		app.releaseAgent(second);
	});

	it('shares controllers for equivalent inline header options', () => {
		const app = createFlueAppClient({
			client: createFakeSdk(),
			storage: false,
		});

		const first = app.agent({ agent: 'support', id: 'user-1', headers: { authorization: 'Bearer test' } });
		const second = app.agent({ agent: 'support', id: 'user-1', headers: { authorization: 'Bearer test' } });

		expect(first).toBe(second);
		app.releaseAgent(first);
		app.releaseAgent(second);
	});

	it('queues sends and resolves operation resources from matching submission ids', async () => {
		const batches = new Map<string, Array<FlueEventBatch<AttachedAgentEvent>>>();
		const sdk = createFakeSdk({
			send: async (_agent, _id, options) => {
				const submissionId = `sub:${options.message}`;
				batches.set(submissionId, [
					{
						events: [
							{
								type: 'text_delta',
								text: options.message,
								instanceId: 'inst-1',
								submissionId,
							},
							{ type: 'idle', instanceId: 'inst-1', submissionId },
						],
						nextOffset: `offset:${options.message}`,
					},
				]);
				return { submissionId, streamUrl: 'https://flue.test/agents/support/inst-1', offset: 'start' };
			},
			stream: (_agent, _id, options) => {
				const submissionId = [...batches.keys()].at(-1);
				if (!submissionId) throw new Error('Expected at least one accepted submission.');
				return createFakeStream(batches.get(submissionId) ?? [], options?.signal);
			},
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const first = agent.send('first');
		const second = agent.send('second');

		await expect(first.accepted).resolves.toMatchObject({ submissionId: 'sub:first' });
		await expect(first.idle).resolves.toMatchObject({ status: 'idle' });
		await expect(second.accepted).resolves.toMatchObject({ submissionId: 'sub:second' });
		await expect(second.idle).resolves.toMatchObject({ text: 'firstsecond' });
		expect(agent.getSnapshot().checkpoint?.offset).toBe('offset:second');
		expect(agent.getSnapshot().messages.map((message) => message.text)).toEqual([
			'first',
			'second',
			'first',
			'second',
		]);
	});

	it('persists checkpoints only after complete batches', async () => {
		const storage = createMemoryFlueStorage();
		const sdk = createFakeSdk({
			send: async () => ({ submissionId: 'sub-1', streamUrl: 'https://flue.test/agents/support/inst-1', offset: '-1' }),
			stream: () =>
				createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'hello ', instanceId: 'inst-1', submissionId: 'sub-1' },
							{ type: 'text_delta', text: 'world', instanceId: 'inst-1', submissionId: 'sub-1' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' },
						],
						nextOffset: 'offset:batch-1',
					},
				]),
		});
		const app = createFlueAppClient({
			client: sdk,
			storage,
			storageNamespace: 'test',
		});
		const agent = app.agent({ agent: 'support', id: 'inst-1', replay: 'offset' });

		const operation = agent.send('hello');
		await operation.idle;

		expect(agent.getSnapshot().checkpoint?.offset).toBe('offset:batch-1');
		expect(storage.getItem('flue:test:agent:support:inst-1:checkpoint')).toContain('offset:batch-1');

		app.releaseAgent(agent);
		const restored = app.agent({ agent: 'support', id: 'inst-1', replay: 'offset' });
		expect(restored.getSnapshot().checkpoint?.offset).toBe('offset:batch-1');
		expect(restored.getSnapshot().text).toBe('hello world');
	});

	it('builds SDK clients from controller connection options', async () => {
		const requests: Request[] = [];
		const app = createFlueAppClient({ storage: false });
		const agent = app.agent({
			agent: 'support',
			id: 'inst-1',
			baseUrl: 'https://controller.test/api',
			token: 'controller-token',
			headers: { 'x-controller': 'yes' },
			fetch: async (input, init) => {
				const request = new Request(input, init);
				requests.push(request);
				if (request.method === 'POST') {
					return Response.json({
						submissionId: 'sub-1',
						streamUrl: 'https://controller.test/api/agents/support/inst-1',
						offset: '-1',
					}, { status: 202 });
				}
				return dsJsonResponse([{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' }], {
					nextOffset: 'offset:done',
					closed: true,
				});
			},
		});

		const operation = agent.send('hello');

		await operation.idle;
		expect(requests.map((request) => new URL(request.url).origin)).toEqual([
			'https://controller.test',
			'https://controller.test',
		]);
		expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/agents/support/inst-1');
		expect(requests[0]?.headers.get('authorization')).toBe('Bearer controller-token');
		expect(requests[0]?.headers.get('x-controller')).toBe('yes');
	});

	it('builds SDK clients from app-level fetch options', async () => {
		const originalFetch = globalThis.fetch;
		const requests: Request[] = [];
		globalThis.fetch = async () => {
			throw new Error('Expected controller to use the app-level fetch option.');
		};
		try {
			const app = createFlueAppClient({
				baseUrl: 'https://provider.test/api',
				storage: false,
				fetch: async (input, init) => {
					const request = new Request(input, init);
					requests.push(request);
					if (request.method === 'POST') {
						return Response.json({
							submissionId: 'sub-1',
							streamUrl: 'https://provider.test/api/agents/support/inst-1',
							offset: '-1',
						}, { status: 202 });
					}
					return dsJsonResponse([{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' }], {
						nextOffset: 'offset:done',
						closed: true,
					});
				},
			});
			const agent = app.agent({ agent: 'support', id: 'inst-1' });

			await expect(agent.send('hello').idle).resolves.toMatchObject({ status: 'idle' });
			expect(requests).toHaveLength(2);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('preserves queued send options when the queued operation starts', async () => {
		const sentMessages: string[] = [];
		const sdk = createFakeSdk({
			send: async (_agent, _id, options) => {
				sentMessages.push(options.message);
				return { submissionId: `sub:${options.message}`, streamUrl: 'https://flue.test/agents/support/inst-1', offset: '-1' };
			},
			stream: () =>
				createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'done', instanceId: 'inst-1', submissionId: 'sub:first' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub:first' },
						],
						nextOffset: 'offset:first',
					},
				]),
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });
		const abort = new AbortController();

		const first = agent.send('first');
		const second = agent.send('second', { signal: abort.signal });
		abort.abort(new DOMException('Queued send canceled', 'AbortError'));

		await first.idle;
		await expect(second.accepted).rejects.toThrow('Queued send canceled');
		expect(sentMessages).toEqual(['first']);
	});

	it('rejects queued operations when stopped', async () => {
		const sdk = createFakeSdk({
			send: async () => ({
				submissionId: 'sub:first',
				streamUrl: 'https://flue.test/agents/support/inst-1',
				offset: '-1',
			}),
			stream: () => createNeverSettlingStream(),
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const first = agent.send('first');
		const second = agent.send('second');
		agent.stop();

		await expect(first.idle).rejects.toThrow('Stopped');
		await expect(second.accepted).rejects.toThrow('Stopped');
	});

	it('does not start streaming when a stopped admission resolves later', async () => {
		let resolveSend: ((value: Awaited<ReturnType<FlueClient['agents']['send']>>) => void) | undefined;
		let sendSignal: AbortSignal | undefined;
		let streamCount = 0;
		const sdk = createFakeSdk({
			send: async (_agent, _id, options) => {
				sendSignal = options.signal;
				return await new Promise((resolve) => {
					resolveSend = resolve;
				});
			},
			stream: () => {
				streamCount++;
				return createFakeStream([]);
			},
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const operation = agent.send('first');
		await Promise.resolve();
		agent.stop();

		expect(sendSignal?.aborted).toBe(true);
		await expect(operation.accepted).rejects.toThrow('Stopped');
		resolveSend?.({ submissionId: 'sub:first', streamUrl: 'https://flue.test/agents/support/inst-1', offset: '-1' });
		await Promise.resolve();
		expect(streamCount).toBe(0);
		expect(agent.getSnapshot()).toMatchObject({
			status: 'idle',
			isSubmitting: false,
			isStreaming: false,
		});
	});

	it('does not replay stopped submission output after reconnect', async () => {
		let streamCount = 0;
		const sdk = createFakeSdk({
			send: async () => ({
				submissionId: 'sub:stopped',
				streamUrl: 'https://flue.test/agents/support/inst-1',
				offset: '-1',
			}),
			stream: () => {
				streamCount++;
				if (streamCount === 1) return createNeverSettlingStream();
				return createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'late output', instanceId: 'inst-1', submissionId: 'sub:stopped' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub:stopped' },
						],
						nextOffset: 'offset:late',
					},
				]);
			},
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const operation = agent.send('hello');
		await operation.accepted;
		agent.stop();
		agent.reconnect('-1');
		await flushAsyncWork();

		expect(agent.getSnapshot().messages.map((message) => message.text)).toEqual(['hello']);
	});

	it('keeps active operation resources attached across reconnects', async () => {
		let streamCount = 0;
		const sdk = createFakeSdk({
			send: async () => ({
				submissionId: 'sub:reconnect',
				streamUrl: 'https://flue.test/agents/support/inst-1',
				offset: '-1',
			}),
			stream: () => {
				streamCount++;
				if (streamCount === 1) return createNeverSettlingStream();
				return createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'after reconnect', instanceId: 'inst-1', submissionId: 'sub:reconnect' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub:reconnect' },
						],
						nextOffset: 'offset:reconnected',
					},
				]);
			},
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const operation = agent.send('hello');
		await operation.accepted;
		agent.reconnect('-1');

		await expect(withTimeout(operation.idle, 'operation idle after reconnect')).resolves.toMatchObject({
			status: 'idle',
			text: 'after reconnect',
		});
	});

	it('reconstructs user messages from durable stream replay', async () => {
		const sdk = createFakeSdk({
			stream: () =>
				createFakeStream([
					{
						events: [
							{
								type: 'message_end',
								instanceId: 'inst-1',
								submissionId: 'sub:replay',
								message: {
									role: 'user',
									content: [{ type: 'text', text: 'hello from history' }],
									timestamp: 0,
								},
							} as AttachedAgentEvent,
							{ type: 'text_delta', text: 'assistant reply', instanceId: 'inst-1', submissionId: 'sub:replay' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub:replay' },
						],
						nextOffset: 'offset:replayed',
					},
				]),
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		agent.connect('-1');
		await flushAsyncWork();

		expect(agent.getSnapshot().messages.map((message) => [message.role, message.text])).toEqual([
			['user', 'hello from history'],
			['assistant', 'assistant reply'],
		]);
	});

	it('does not persist a checkpoint without the matching reduced snapshot', async () => {
		const items = new Map<string, string>();
		const storage = {
			getItem: (key: string) => items.get(key) ?? null,
			setItem(key: string, value: string) {
				items.set(key, value);
				if (key.endsWith(':snapshot')) throw new Error('Snapshot write failed.');
			},
			removeItem(key: string) {
				items.delete(key);
			},
		};
		const sdk = createFakeSdk({
			send: async () => ({ submissionId: 'sub-1', streamUrl: 'https://flue.test/agents/support/inst-1', offset: '-1' }),
			stream: () =>
				createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'hello', instanceId: 'inst-1', submissionId: 'sub-1' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' },
						],
						nextOffset: 'offset:batch-1',
					},
				]),
		});
		const app = createFlueAppClient({ client: sdk, storage, storageNamespace: 'test' });
		const agent = app.agent({ agent: 'support', id: 'inst-1', replay: 'offset' });

		await expect(agent.send('hello').idle).resolves.toMatchObject({ status: 'idle' });

		expect(storage.getItem('flue:test:agent:support:inst-1:checkpoint')).toBeNull();
	});

	it('derives stable event ids from durable stream batches when replayed', async () => {
		const sdk = createFakeSdk({
			stream: () =>
				createFakeStream([
					{
						events: [
							{ type: 'text_delta', text: 'hello', instanceId: 'inst-1', submissionId: 'sub-1' },
							{ type: 'idle', instanceId: 'inst-1', submissionId: 'sub-1' },
						],
						nextOffset: 'offset:stable-batch',
					},
				]),
		});
		const firstApp = createFlueAppClient({ client: sdk, storage: false });
		const firstAgent = firstApp.agent({ agent: 'support', id: 'inst-1', replay: 'all' });

		firstAgent.connect();
		await flushAsyncWork();
		const firstEventIds = firstAgent.getSnapshot().events.map((event) => event.id);
		const firstMessageIds = firstAgent.getSnapshot().messages.map((message) => message.id);

		const secondApp = createFlueAppClient({ client: sdk, storage: false });
		const secondAgent = secondApp.agent({ agent: 'support', id: 'inst-1', replay: 'all' });

		secondAgent.connect();
		await flushAsyncWork();

		expect(secondAgent.getSnapshot().events.map((event) => event.id)).toEqual(firstEventIds);
		expect(secondAgent.getSnapshot().messages.map((message) => message.id)).toEqual(firstMessageIds);
		expect(secondAgent.getSnapshot().events.map((event) => event.batchId)).toEqual([
			'batch:offset:stable-batch',
			'batch:offset:stable-batch',
		]);
	});

	it('rejects an operation when the stream ends before idle', async () => {
		const sdk = createFakeSdk({
			send: async () => ({
				submissionId: 'sub-1',
				streamUrl: 'https://flue.test/agents/support/inst-1',
				offset: '-1',
			}),
			stream: () =>
				createFakeStream([
					{
						events: [{ type: 'text_delta', text: 'partial', instanceId: 'inst-1', submissionId: 'sub-1' }],
						nextOffset: 'offset:partial',
					},
				]),
		});
		const app = createFlueAppClient({ client: sdk, storage: false });
		const agent = app.agent({ agent: 'support', id: 'inst-1' });

		const operation = agent.send('hello');

		await expect(operation.idle).rejects.toThrow('ended before idle');
			expect(agent.getSnapshot()).toMatchObject({
				status: 'error',
				isSubmitting: false,
				isStreaming: false,
			});
		});
	});

async function flushAsyncWork(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function withTimeout<T>(value: PromiseLike<T>, label: string): Promise<T> {
	return await Promise.race([
		Promise.resolve(value),
		new Promise<T>((_, reject) => {
			setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 25);
		}),
	]);
}

function createFakeSdk(overrides: Partial<FlueClient['agents']> = {}): FlueClient {
	return {
		agents: {
			prompt: async () => ({ result: null, streamUrl: '', offset: '-1' }),
			send: async () => ({ submissionId: 'sub-1', streamUrl: '', offset: '-1' }),
			stream: () => createFakeStream([]),
			...overrides,
		},
		runs: {
			get: async () => {
				throw new Error('Not implemented.');
			},
			stream: () => createFakeStream([]) as never,
			events: async () => [],
			list: undefined as never,
		} as never,
		workflows: {
			invoke: async () => ({ runId: 'run-1', streamUrl: '' }),
		},
		admin: {
			agents: { list: async () => ({ items: [] }) },
			runs: { list: async () => ({ items: [] }) },
		},
	};
}

function createNeverSettlingStream(): ReturnType<FlueClient['agents']['stream']> {
	return {
		offset: '-1',
		cancel: () => {},
		async *batches() {
			await new Promise(() => {});
		},
		async *[Symbol.asyncIterator]() {
			await new Promise(() => {});
		},
	};
}

function dsJsonResponse(
	events: unknown[],
	opts: { closed?: boolean; upToDate?: boolean; nextOffset?: string } = {},
): Response {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'stream-next-offset': opts.nextOffset ?? String(events.length).padStart(16, '0'),
	};
	if (opts.upToDate !== false) {
		headers['stream-up-to-date'] = 'true';
	}
	if (opts.closed) {
		headers['stream-closed'] = 'true';
	}
	return new Response(JSON.stringify(events), { status: 200, headers });
}

function createFakeStream(
	batches: Array<FlueEventBatch<AttachedAgentEvent>>,
	signal?: AbortSignal,
): ReturnType<FlueClient['agents']['stream']> {
	return {
		offset: batches.at(-1)?.nextOffset ?? '-1',
		cancel: () => {},
		async *batches() {
			for (const batch of batches) {
				if (signal?.aborted) return;
				yield batch;
			}
		},
		async *[Symbol.asyncIterator]() {
			for (const batch of batches) {
				for (const event of batch.events) yield event;
			}
		},
	};
}
