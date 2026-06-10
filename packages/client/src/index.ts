import {
	type AgentSendResult,
	type AttachedAgentEvent,
	createFlueClient,
	type FlueClient,
	type FlueEventBatch,
	type LiveMode,
	type RequestHeaders,
} from '@flue/sdk';

export type { AttachedAgentEvent, FlueClient } from '@flue/sdk';

export type FlueStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

export type FlueStorageMode = FlueStorage | 'session' | 'local' | false;

export type FlueAppClientOptions = {
	client?: FlueClient;
	baseUrl?: string;
	origin?: string;
	token?: string;
	headers?: RequestHeaders;
	fetch?: typeof globalThis.fetch;
	storage?: FlueStorageMode;
	storageNamespace?: string;
};

export type FlueAgentControllerOptions = {
	agent: string;
	id?: string;
	client?: FlueClient;
	baseUrl?: string;
	origin?: string;
	token?: string;
	headers?: RequestHeaders;
	fetch?: typeof globalThis.fetch;
	initialOffset?: string;
	replay?: 'new' | 'all' | 'offset';
	storage?: FlueStorageMode;
	storageKey?: string;
	storageNamespace?: string;
	autoConnect?: boolean;
	live?: LiveMode;
	sendPolicy?: 'reject' | 'queue';
	onEvent?: (event: FlueClientEvent<AttachedAgentEvent>) => void;
	reduceEvent?: FlueAgentEventReducer;
};

export type FlueAgentSendOptions = {
	signal?: AbortSignal;
};

export type FlueResetOptions = {
	regenerateId?: boolean;
};

export type FlueConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type FlueAgentStatus = 'idle' | 'connecting' | 'submitting' | 'streaming' | 'error';

export type FlueStreamCheckpoint = {
	offset: string;
	batchId: string;
	receivedAt: number;
};

export type FlueClientEvent<T = AttachedAgentEvent> = {
	id: string;
	event: T;
	batchId: string;
	indexInBatch: number;
	receivedAt: number;
};

export type FlueUiMessage = {
	id: string;
	role: 'user' | 'assistant' | 'tool' | 'system';
	text: string;
	status: 'streaming' | 'complete' | 'error';
	eventIds: Array<string>;
};

export type FlueAgentSnapshot = {
	id: string;
	connectionStatus: FlueConnectionStatus;
	status: FlueAgentStatus;
	isSubmitting: boolean;
	isStreaming: boolean;
	error: unknown;
	events: Array<FlueClientEvent<AttachedAgentEvent>>;
	messages: Array<FlueUiMessage>;
	text: string;
	checkpoint: FlueStreamCheckpoint | null;
	latestOperation: FlueAgentOperation | null;
};

export type FlueAgentEventReducer = (
	snapshot: FlueAgentSnapshot,
	event: FlueClientEvent<AttachedAgentEvent>,
) => FlueAgentSnapshot;

export type FlueThenable<T> = PromiseLike<T> & (
	| { status: 'pending' }
	| { status: 'fulfilled'; value: T }
	| { status: 'rejected'; reason: unknown }
);

export type FlueAgentAdmission = AgentSendResult;

export type FlueAgentOperation = {
	readonly clientId: string;
	readonly submissionId: string | null;
	readonly message: string;
	readonly accepted: FlueThenable<FlueAgentAdmission>;
	readonly firstEvent: FlueThenable<FlueClientEvent<AttachedAgentEvent>>;
	readonly idle: FlueThenable<FlueAgentSnapshot>;
	readonly snapshot: FlueThenable<FlueAgentSnapshot>;
};

export type FlueAgentController = {
	readonly id: string;
	readonly agent: string;
	getSnapshot(): FlueAgentSnapshot;
	getServerSnapshot(): FlueAgentSnapshot;
	subscribe(listener: () => void): () => void;
	connect(offset?: string): void;
	send(message: string, options?: FlueAgentSendOptions): FlueAgentOperation;
	reconnect(offset?: string): void;
	stop(): void;
	reset(options?: FlueResetOptions): void;
	dispose(): void;
};

export type FlueAppClient = {
	getSdk(): FlueClient;
	agent(options: FlueAgentControllerOptions): FlueAgentController;
	releaseAgent(controller: FlueAgentController): void;
};

export class FlueSendRejectedError extends Error {
	constructor() {
		super('A Flue agent operation is already active.');
		this.name = 'FlueSendRejectedError';
	}
}

export class FlueConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FlueConfigurationError';
	}
}

type Resource<T> = FlueThenable<T> & {
	resolve(value: T): void;
	reject(reason: unknown): void;
};

type MutableOperation = FlueAgentOperation & {
	submissionId: string | null;
	firstEventSettled: boolean;
	resolveAccepted(value: FlueAgentAdmission): void;
	resolveFirstEvent(value: FlueClientEvent<AttachedAgentEvent>): void;
	resolveIdle(value: FlueAgentSnapshot): void;
	resolveSnapshot(value: FlueAgentSnapshot): void;
	reject(reason: unknown): void;
};

type RegistryEntry = {
	controller: FlueAgentController;
	refs: number;
	config: ControllerConfig;
};

type QueuedOperation = {
	operation: MutableOperation;
	options: FlueAgentSendOptions;
};

type ControllerConfig = {
	client?: FlueClient;
	baseUrl: string;
	origin?: string;
	token?: string;
	headers?: RequestHeaders;
	fetch?: typeof globalThis.fetch;
	replay: NonNullable<FlueAgentControllerOptions['replay']>;
	storage: FlueStorageMode;
	storageKey?: string;
	initialOffset: string;
	sendPolicy: NonNullable<FlueAgentControllerOptions['sendPolicy']>;
	autoConnect: boolean;
	live: LiveMode;
	onEvent?: FlueAgentControllerOptions['onEvent'];
	reduceEvent?: FlueAgentEventReducer;
};

const DEFAULT_BASE_URL = '/api';
const DEFAULT_INITIAL_OFFSET = 'now';
let nextClientEventId = 0;
let nextBatchId = 0;
let nextOperationId = 0;

export function createFlueAppClient(options: FlueAppClientOptions = {}): FlueAppClient {
	let sdk: FlueClient | undefined = options.client;
	const registry = new Map<string, RegistryEntry>();
	const appOptions = { ...options };
	const namespace = resolveStorageNamespace(appOptions);

	const getSdk = () => {
		if (sdk) return sdk;
		const baseUrl = resolveBrowserBaseUrl(appOptions.baseUrl ?? DEFAULT_BASE_URL, appOptions.origin);
		sdk = createFlueClient({
			baseUrl,
			token: appOptions.token,
			headers: appOptions.headers,
			fetch: appOptions.fetch,
		});
		return sdk;
	};

	return {
		getSdk,
		agent(agentOptions) {
			const merged = mergeControllerOptions(appOptions, agentOptions, namespace);
			const storage = resolveStorage(merged.storage);
			const id = resolveAgentId(merged, storage);
			const registryKey = `${merged.storageNamespace}:${merged.agent}:${id}`;
			const config = controllerConfig(merged);
			const existing = registry.get(registryKey);
			if (existing) {
				if (!sameControllerConfig(existing.config, config)) {
					throw new FlueConfigurationError(
						`Conflicting useFlue configuration for agent "${merged.agent}" id "${id}".`,
					);
				}
				existing.refs++;
				return existing.controller;
			}

			const controller = createFlueAgentController({
				...merged,
				id,
				client: merged.client ?? createSdkFromControllerOptions(merged),
				storage,
			});
			registry.set(registryKey, { controller, refs: 1, config });
			return controller;
		},
		releaseAgent(controller) {
			for (const [key, entry] of registry) {
				if (entry.controller !== controller) continue;
				entry.refs--;
				if (entry.refs <= 0) {
					entry.controller.dispose();
					registry.delete(key);
				}
				return;
			}
			controller.dispose();
		},
	};
}

export function createFlueAgentController(
	options: FlueAgentControllerOptions & { client: FlueClient; id: string; storage?: FlueStorage | false },
): FlueAgentController {
	return new AgentController(options);
}

export function createMemoryFlueStorage(): FlueStorage {
	const items = new Map<string, string>();
	return {
		getItem: (key) => items.get(key) ?? null,
		setItem(key, value) {
			items.set(key, value);
		},
		removeItem(key) {
			items.delete(key);
		},
	};
}

export function resolveBrowserBaseUrl(baseUrl = DEFAULT_BASE_URL, origin?: string): string {
	if (/^[a-z][a-z\d+\-.]*:/i.test(baseUrl)) return baseUrl;
	const resolvedOrigin = origin ?? globalThis.window?.location.origin;
	if (!resolvedOrigin) {
		throw new FlueConfigurationError('Relative Flue baseUrl values require a browser origin.');
	}
	return new URL(baseUrl, resolvedOrigin).toString();
}

export function defaultFlueAgentReducer(
	snapshot: FlueAgentSnapshot,
	clientEvent: FlueClientEvent<AttachedAgentEvent>,
): FlueAgentSnapshot {
	const event = clientEvent.event;
	const events = [...snapshot.events, clientEvent];
	let messages = snapshot.messages;
	let text = snapshot.text;

	if (event.type === 'text_delta') {
		const delta = 'text' in event && typeof event.text === 'string' ? event.text : '';
		text += delta;
		const last = messages.at(-1);
		if (last?.role === 'assistant' && last.status === 'streaming') {
			messages = [
				...messages.slice(0, -1),
				{
					...last,
					text: last.text + delta,
					eventIds: [...last.eventIds, clientEvent.id],
				},
			];
		} else {
			messages = [
				...messages,
				{
					id: `assistant:${clientEvent.id}`,
					role: 'assistant',
					text: delta,
					status: 'streaming',
					eventIds: [clientEvent.id],
				},
			];
		}
	}

	if (event.type === 'idle') {
		messages = messages.map((message) =>
			message.status === 'streaming' ? { ...message, status: 'complete' } : message,
		);
	}

	return { ...snapshot, events, messages, text };
}

class AgentController implements FlueAgentController {
	readonly agent: string;
	readonly id: string;

	#client: FlueClient;
	#listeners = new Set<() => void>();
	#snapshot: FlueAgentSnapshot;
	#storage: FlueStorage | false;
	#storageKeys: { id: string; checkpoint: string; snapshot: string };
	#options: Required<Pick<FlueAgentControllerOptions, 'initialOffset' | 'replay' | 'autoConnect' | 'sendPolicy'>> &
		FlueAgentControllerOptions;
	#reduceEvent: FlueAgentEventReducer;
	#queue: QueuedOperation[] = [];
	#activeOperation: MutableOperation | null = null;
	#activeAdmissionAbortController: AbortController | null = null;
	#currentStream: { cancel(reason?: unknown): void } | null = null;
	#connectionGeneration = 0;
	#disposed = false;

	constructor(
		options: FlueAgentControllerOptions & { client: FlueClient; id: string; storage?: FlueStorage | false },
	) {
		this.agent = options.agent;
		this.id = options.id;
		this.#client = options.client;
		this.#storage = options.storage ?? false;
		this.#options = {
			...options,
			initialOffset: options.initialOffset ?? DEFAULT_INITIAL_OFFSET,
			replay: options.replay ?? 'new',
			autoConnect: options.autoConnect ?? false,
			sendPolicy: options.sendPolicy ?? 'queue',
		};
		this.#reduceEvent = options.reduceEvent ?? defaultFlueAgentReducer;
		this.#storageKeys = storageKeys(this.#options, this.id);
		this.#snapshot = this.#restoreSnapshot() ?? this.#initialSnapshot();
		if (this.#options.autoConnect) queueMicrotask(() => this.connect());
	}

	getSnapshot(): FlueAgentSnapshot {
		return this.#snapshot;
	}

	getServerSnapshot(): FlueAgentSnapshot {
		return this.#initialSnapshot();
	}

	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	connect(offset?: string): void {
		void this.#connect(offset ?? this.#initialConnectionOffset(), undefined);
	}

	reconnect(offset?: string): void {
		void this.#connect(offset ?? this.#snapshot.checkpoint?.offset ?? this.#initialConnectionOffset(), undefined);
	}

	send(message: string, options: FlueAgentSendOptions = {}): FlueAgentOperation {
		if (this.#disposed) throw new FlueConfigurationError('Cannot send with a disposed Flue agent controller.');
		if (this.#activeOperation && this.#options.sendPolicy === 'reject') throw new FlueSendRejectedError();

		const operation = createOperation(message);
		this.#appendUserMessage(operation);
		if (this.#activeOperation) {
			this.#queue.push({ operation, options });
		} else {
			void this.#runOperation(operation, options);
		}
		this.#notify();
		return operation;
	}

	stop(): void {
		this.#connectionGeneration++;
		this.#currentStream?.cancel(new DOMException('Stopped', 'AbortError'));
		this.#currentStream = null;
		this.#activeAdmissionAbortController?.abort(new DOMException('Stopped', 'AbortError'));
		this.#activeAdmissionAbortController = null;
		const reason = new DOMException('Stopped', 'AbortError');
		this.#activeOperation?.reject(reason);
		this.#activeOperation = null;
		this.#rejectQueued(reason);
		this.#setSnapshot({
			connectionStatus: 'disconnected',
			status: 'idle',
			isSubmitting: false,
			isStreaming: false,
		});
	}

	reset(options: FlueResetOptions = {}): void {
		this.stop();
		if (this.#storage) {
			this.#storage.removeItem(this.#storageKeys.checkpoint);
			this.#storage.removeItem(this.#storageKeys.snapshot);
			if (options.regenerateId) this.#storage.removeItem(this.#storageKeys.id);
		}
		this.#snapshot = this.#initialSnapshot();
		this.#notify();
	}

	dispose(): void {
		this.#disposed = true;
		this.stop();
		this.#listeners.clear();
	}

	async #runOperation(operation: MutableOperation, options: FlueAgentSendOptions): Promise<void> {
		const generation = this.#connectionGeneration;
		const admissionAbortController = new AbortController();
		this.#activeAdmissionAbortController = admissionAbortController;
		const removeAbortListener = linkAbortSignal(options.signal, admissionAbortController);
		this.#activeOperation = operation;
		this.#setSnapshot({
			status: 'submitting',
			isSubmitting: true,
			error: null,
			latestOperation: operation,
		});
		try {
			if (admissionAbortController.signal.aborted) {
				throw admissionAbortController.signal.reason ?? new DOMException('Aborted', 'AbortError');
			}
			const accepted = await this.#client.agents.send(this.agent, this.id, {
				message: operation.message,
				signal: admissionAbortController.signal,
			});
			if (
				this.#activeOperation !== operation ||
				generation !== this.#connectionGeneration ||
				admissionAbortController.signal.aborted
			) {
				return;
			}
			operation.submissionId = accepted.submissionId;
			operation.resolveAccepted(accepted);
			this.#setSnapshot({ isSubmitting: false, status: 'streaming', isStreaming: true });
			await this.#connect(accepted.offset, operation);
		} catch (error) {
			operation.reject(error);
			this.#setSnapshot({
				connectionStatus: isAbortError(error) ? 'disconnected' : 'error',
				status: isAbortError(error) ? 'idle' : 'error',
				isSubmitting: false,
				isStreaming: false,
				error: isAbortError(error) ? null : error,
			});
			this.#activeOperation = null;
			this.#advanceQueue();
		} finally {
			removeAbortListener();
			if (this.#activeAdmissionAbortController === admissionAbortController) {
				this.#activeAdmissionAbortController = null;
			}
		}
	}

	async #connect(offset: string, operation: MutableOperation | undefined): Promise<void> {
		const generation = ++this.#connectionGeneration;
		this.#currentStream?.cancel();
		const stream = this.#client.agents.stream(this.agent, this.id, {
			offset,
			live: this.#options.live ?? true,
		});
		this.#currentStream = stream;
		this.#setSnapshot({
			connectionStatus: 'connecting',
			status: operation ? 'streaming' : 'connecting',
			isStreaming: Boolean(operation),
		});

		try {
			for await (const batch of stream.batches()) {
				if (generation !== this.#connectionGeneration) break;
				this.#setSnapshot({ connectionStatus: 'connected' });
				this.#dispatchBatch(batch, operation);
			}
			if (generation !== this.#connectionGeneration) return;
			this.#currentStream = null;
			if (operation && this.#activeOperation === operation) {
				const error = new Error(`Flue agent stream ended before idle for submission "${operation.submissionId}".`);
				operation.reject(error);
				this.#setSnapshot({
					connectionStatus: 'disconnected',
					status: 'error',
					isSubmitting: false,
					isStreaming: false,
					error,
				});
				this.#activeOperation = null;
				this.#advanceQueue();
				return;
			}
			if (!operation) {
				this.#setSnapshot({
					connectionStatus: 'disconnected',
					status: 'idle',
					isStreaming: false,
				});
			}
		} catch (error) {
			if (generation !== this.#connectionGeneration || isAbortError(error)) return;
			operation?.reject(error);
			this.#setSnapshot({
				connectionStatus: 'error',
				status: 'error',
				isSubmitting: false,
				isStreaming: false,
				error,
			});
			this.#activeOperation = null;
			this.#advanceQueue();
		}
	}

	#dispatchBatch(batch: FlueEventBatch<AttachedAgentEvent>, operation: MutableOperation | undefined): void {
		const batchId = `batch:${++nextBatchId}`;
		const receivedAt = Date.now();
		let sawIdle = false;
		let snapshot = this.#snapshot;

		for (const [indexInBatch, event] of batch.events.entries()) {
			const clientEvent: FlueClientEvent<AttachedAgentEvent> = {
				id: `event:${++nextClientEventId}`,
				event,
				batchId,
				indexInBatch,
				receivedAt,
			};
			snapshot = this.#reduceEvent(snapshot, clientEvent);
			this.#options.onEvent?.(clientEvent);
			if (operation && event.submissionId === operation.submissionId) {
				if (!operation.firstEventSettled) operation.resolveFirstEvent(clientEvent);
				if (event.type === 'idle') sawIdle = true;
			}
		}

		const checkpoint = { offset: batch.nextOffset, batchId, receivedAt };
		this.#snapshot = { ...snapshot, checkpoint };

		if (operation && sawIdle) {
			this.#snapshot = {
				...this.#snapshot,
				status: 'idle',
				isSubmitting: false,
				isStreaming: false,
			};
			operation.resolveIdle(this.#snapshot);
			operation.resolveSnapshot(this.#snapshot);
			this.#activeOperation = null;
			this.#advanceQueue();
		}
		this.#persistCheckpoint(checkpoint);
		this.#persistSnapshot(this.#snapshot);
		this.#notify();
	}

	#advanceQueue(): void {
		if (this.#activeOperation || this.#queue.length === 0) return;
		const next = this.#queue.shift();
		if (!next) return;
		void this.#runOperation(next.operation, next.options);
	}

	#rejectQueued(reason: unknown): void {
		const queued = this.#queue;
		this.#queue = [];
		for (const { operation } of queued) {
			operation.reject(reason);
		}
	}

	#appendUserMessage(operation: MutableOperation): void {
		this.#setSnapshot({
			messages: [
				...this.#snapshot.messages,
				{
					id: `user:${operation.clientId}`,
					role: 'user',
					text: operation.message,
					status: 'complete',
					eventIds: [],
				},
			],
			latestOperation: operation,
		});
	}

	#setSnapshot(patch: Partial<FlueAgentSnapshot>): void {
		this.#snapshot = { ...this.#snapshot, ...patch };
		this.#notify();
	}

	#notify(): void {
		for (const listener of this.#listeners) listener();
	}

	#initialSnapshot(): FlueAgentSnapshot {
		return {
			id: this.id,
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
		};
	}

	#initialConnectionOffset(): string {
		if (this.#options.replay === 'all') return '-1';
		if (this.#options.replay === 'offset') {
			return this.#snapshot.checkpoint?.offset ?? this.#options.initialOffset;
		}
		return this.#options.initialOffset;
	}

	#restoreSnapshot(): FlueAgentSnapshot | null {
		if (this.#options.replay !== 'offset') return null;
		const raw = this.#storage ? this.#storage.getItem(this.#storageKeys.snapshot) : null;
		const checkpointRaw = this.#storage ? this.#storage.getItem(this.#storageKeys.checkpoint) : null;
		const checkpoint = checkpointRaw ? parseJson<FlueStreamCheckpoint>(checkpointRaw) : null;
		const restored = raw ? parseJson<Omit<FlueAgentSnapshot, 'latestOperation'>>(raw) : null;
		if (restored) return { ...restored, latestOperation: null, checkpoint };
		if (checkpoint) return { ...this.#initialSnapshot(), checkpoint };
		return null;
	}

	#persistCheckpoint(checkpoint: FlueStreamCheckpoint): void {
		if (this.#storage) this.#storage.setItem(this.#storageKeys.checkpoint, JSON.stringify(checkpoint));
	}

	#persistSnapshot(snapshot: FlueAgentSnapshot): void {
		if (this.#options.replay !== 'offset') return;
		const { latestOperation: _latestOperation, ...serializable } = snapshot;
		if (this.#storage) this.#storage.setItem(this.#storageKeys.snapshot, JSON.stringify(serializable));
	}
}

function mergeControllerOptions(
	appOptions: FlueAppClientOptions,
	agentOptions: FlueAgentControllerOptions,
	namespace: string,
): FlueAgentControllerOptions {
	return {
		...agentOptions,
		client: agentOptions.client ?? appOptions.client,
		baseUrl: agentOptions.baseUrl ?? appOptions.baseUrl ?? DEFAULT_BASE_URL,
		origin: agentOptions.origin ?? appOptions.origin,
		token: agentOptions.token ?? appOptions.token,
		headers: agentOptions.headers ?? appOptions.headers,
		storage: agentOptions.storage ?? appOptions.storage ?? 'session',
		storageNamespace: agentOptions.storageNamespace ?? appOptions.storageNamespace ?? namespace,
	};
}

function controllerConfig(options: FlueAgentControllerOptions): ControllerConfig {
	return {
		client: options.client,
		baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
		origin: options.origin,
		token: options.token,
		headers: options.headers,
		fetch: options.fetch,
		replay: options.replay ?? 'new',
		storage: options.storage ?? 'session',
		storageKey: options.storageKey,
		initialOffset: options.initialOffset ?? DEFAULT_INITIAL_OFFSET,
		sendPolicy: options.sendPolicy ?? 'queue',
		autoConnect: options.autoConnect ?? false,
		live: options.live ?? true,
		onEvent: options.onEvent,
		reduceEvent: options.reduceEvent,
	};
}

function sameControllerConfig(first: ControllerConfig, second: ControllerConfig): boolean {
	return (
		first.client === second.client &&
		first.baseUrl === second.baseUrl &&
		first.origin === second.origin &&
		first.token === second.token &&
		first.headers === second.headers &&
		first.fetch === second.fetch &&
		first.replay === second.replay &&
		first.storage === second.storage &&
		first.storageKey === second.storageKey &&
		first.initialOffset === second.initialOffset &&
		first.sendPolicy === second.sendPolicy &&
		first.autoConnect === second.autoConnect &&
		first.live === second.live &&
		first.onEvent === second.onEvent &&
		first.reduceEvent === second.reduceEvent
	);
}

function createSdkFromControllerOptions(options: FlueAgentControllerOptions): FlueClient {
	return createFlueClient({
		baseUrl: resolveBrowserBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL, options.origin),
		token: options.token,
		headers: options.headers,
		fetch: options.fetch,
	});
}

function resolveStorageNamespace(options: FlueAppClientOptions): string {
	if (options.storageNamespace) return options.storageNamespace;
	if (options.client && !options.baseUrl) return 'client';
	const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
	if (/^[a-z][a-z\d+\-.]*:/i.test(baseUrl)) return new URL(baseUrl).origin + new URL(baseUrl).pathname;
	const origin = options.origin ?? globalThis.window?.location.origin ?? 'http://localhost';
	return new URL(baseUrl, origin).toString();
}

function resolveStorage(mode: FlueStorageMode | undefined): FlueStorage | false {
	if (mode === false) return false;
	if (mode && typeof mode === 'object') return mode;
	if (mode === 'local') return globalThis.window?.localStorage ?? false;
	return globalThis.window?.sessionStorage ?? false;
}

function resolveAgentId(options: FlueAgentControllerOptions, storage: FlueStorage | false): string {
	if (options.id) return options.id;
	const keys = storageKeys(options, '');
	const existing = storage ? storage.getItem(keys.id) : null;
	if (existing) return existing;
	const id = `browser:${randomId()}`;
	if (storage) storage.setItem(keys.id, id);
	return id;
}

function storageKeys(options: FlueAgentControllerOptions, id: string): { id: string; checkpoint: string; snapshot: string } {
	const namespace = options.storageNamespace ?? 'default';
	const baseKey = options.storageKey ?? `flue:${namespace}:agent:${options.agent}`;
	return {
		id: `${baseKey}:id`,
		checkpoint: `${baseKey}:${id}:checkpoint`,
		snapshot: `${baseKey}:${id}:snapshot`,
	};
}

function createOperation(message: string): MutableOperation {
	const accepted = createResource<FlueAgentAdmission>();
	const firstEvent = createResource<FlueClientEvent<AttachedAgentEvent>>();
	const idle = createResource<FlueAgentSnapshot>();
	const snapshot = createResource<FlueAgentSnapshot>();
	const operation: MutableOperation = {
		clientId: `operation:${++nextOperationId}`,
		submissionId: null,
		message,
		accepted,
		firstEvent,
		idle,
		snapshot,
		firstEventSettled: false,
		resolveAccepted(value) {
			accepted.resolve(value);
		},
		resolveFirstEvent(value) {
			operation.firstEventSettled = true;
			firstEvent.resolve(value);
		},
		resolveIdle(value) {
			idle.resolve(value);
		},
		resolveSnapshot(value) {
			snapshot.resolve(value);
		},
		reject(reason) {
			accepted.reject(reason);
			firstEvent.reject(reason);
			idle.reject(reason);
			snapshot.reject(reason);
		},
	};
	return operation;
}

function createResource<T>(): Resource<T> {
	let status: 'pending' | 'fulfilled' | 'rejected' = 'pending';
	let value: T | undefined;
	let reason: unknown;
	let resolvePromise!: (value: T) => void;
	let rejectPromise!: (reason: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	promise.catch(() => {});
	const resource = {
		// biome-ignore lint/suspicious/noThenProperty: React use() consumes thenables directly.
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
		) {
			return promise.then(onfulfilled, onrejected);
		},
		resolve(nextValue: T) {
			if (status !== 'pending') return;
			status = 'fulfilled';
			value = nextValue;
			resolvePromise(nextValue);
		},
		reject(nextReason: unknown) {
			if (status !== 'pending') return;
			status = 'rejected';
			reason = nextReason;
			rejectPromise(nextReason);
		},
		get status() {
			return status;
		},
		get value() {
			return value;
		},
		get reason() {
			return reason;
		},
	};
	return resource as Resource<T>;
}

function parseJson<T>(raw: string): T | null {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function randomId(): string {
	return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => {};
	if (source.aborted) {
		target.abort(source.reason);
		return () => {};
	}
	const onAbort = () => target.abort(source.reason);
	source.addEventListener('abort', onAbort, { once: true });
	return () => source.removeEventListener('abort', onAbort);
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}
