import {
	createFlueAppClient,
	type FlueAgentControllerOptions,
	type FlueAgentOperation,
	type FlueAgentSendOptions,
	type FlueAgentSnapshot,
	type FlueAppClient,
	type FlueAppClientOptions,
	type FlueResetOptions,
	type FlueThenable,
} from '@flue/client';
import {
	createContext,
	type ReactNode,
	use,
	useActionState,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';

export {
	type AttachedAgentEvent,
	createFlueAppClient,
	createMemoryFlueStorage,
	type FlueAgentControllerOptions,
	type FlueAgentOperation,
	type FlueAgentSnapshot,
	type FlueAppClient,
	type FlueClient,
	type FlueClientEvent,
	type FlueResetOptions,
	type FlueUiMessage,
} from '@flue/client';
export type { FlueAppClientOptions };

const FlueContext = createContext<FlueAppClient | null>(null);

export function FlueProvider({
	children,
	client,
	...options
}: FlueAppClientOptions & { children: ReactNode }): ReactNode {
	const appClient = useMemo(() => {
		if (client) return createFlueAppClient({ client });
		return createFlueAppClient({
			baseUrl: options.baseUrl,
			origin: options.origin,
			token: options.token,
			headers: options.headers,
			fetch: options.fetch,
			storage: options.storage,
			storageNamespace: options.storageNamespace,
		});
	}, [
		client,
		options.baseUrl,
		options.origin,
		options.token,
		options.headers,
		options.fetch,
		options.storage,
		options.storageNamespace,
	]);
	return <FlueContext value={appClient}>{children}</FlueContext>;
}

export function useFlueClient(): FlueAppClient {
	const client = useContext(FlueContext);
	return client ?? defaultClient;
}

export type ReactUseFlueResult = FlueAgentSnapshot & {
	pending: boolean;
	action(formData: FormData): void | Promise<void>;
	send(message: string, options?: FlueAgentSendOptions): FlueAgentOperation;
	reconnect(offset?: string): void;
	stop(): void;
	reset(options?: FlueResetOptions): void;
};

export function useFlue(options: FlueAgentControllerOptions): ReactUseFlueResult {
	const appClient = useFlueClient();
	const [binding] = useState(() => new ReactFlueBinding(options));
	const {
		agent,
		id,
		client,
		baseUrl,
		origin,
		token,
		headers,
		fetch,
		initialOffset,
		replay,
		storage,
		storageKey,
		storageNamespace,
		autoConnect,
		live,
		sendPolicy,
		onEvent,
		reduceEvent,
	} = options;
	useEffect(
		() =>
			binding.connect(appClient, {
				agent,
				id,
				client,
				baseUrl,
				origin,
				token,
				headers,
				fetch,
				initialOffset,
				replay,
				storage,
				storageKey,
				storageNamespace,
				autoConnect,
				live,
				sendPolicy,
				onEvent,
				reduceEvent,
			}),
		[
			binding,
			appClient,
			agent,
			id,
			client,
			baseUrl,
			origin,
			token,
			headers,
			fetch,
			initialOffset,
			replay,
			storage,
			storageKey,
			storageNamespace,
			autoConnect,
			live,
			sendPolicy,
			onEvent,
			reduceEvent,
		],
	);

	const snapshot = useSyncExternalStore(
		(listener) => binding.subscribe(listener),
		() => binding.getSnapshot(),
		() => binding.getServerSnapshot(),
	);
	const [_, action, pending] = useActionState(async (_previous: null, submitted: FormData) => {
		const message = String(submitted.get('message') ?? '');
		const operation = binding.send(message);
		await operation.accepted;
		return null;
	}, null);

	return {
		...snapshot,
		pending,
		action,
		send: binding.send.bind(binding),
		reconnect: binding.reconnect.bind(binding),
		stop: binding.stop.bind(binding),
		reset: binding.reset.bind(binding),
	};
}

export function useFlueOperation<T>(
	operation: FlueAgentOperation | null | undefined,
	mode: 'accepted' | 'firstEvent' | 'idle' | 'snapshot',
): T | null {
	if (!operation) return null;
	return use(operation[mode] as FlueThenable<T>);
}

const defaultClient = createFlueAppClient();

class ReactFlueBinding {
	#controller: ReturnType<FlueAppClient['agent']> | null = null;
	#listeners = new Set<() => void>();
	#snapshot: FlueAgentSnapshot;
	#unsubscribe: (() => void) | null = null;

	constructor(options: FlueAgentControllerOptions) {
		this.#snapshot = createInitialSnapshot(options.id ?? '');
	}

	connect(appClient: FlueAppClient, options: FlueAgentControllerOptions): () => void {
		this.#unsubscribe?.();
		const controller = appClient.agent(options);
		this.#controller = controller;
		this.#snapshot = controller.getSnapshot();
		this.#unsubscribe = controller.subscribe(() => {
			if (this.#controller !== controller) return;
			this.#snapshot = controller.getSnapshot();
			this.#notify();
		});
		this.#notify();

		return () => {
			this.#unsubscribe?.();
			this.#unsubscribe = null;
			if (this.#controller === controller) {
				this.#controller = null;
				this.#snapshot = controller.getServerSnapshot();
				this.#notify();
			}
			appClient.releaseAgent(controller);
		};
	}

	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	getSnapshot(): FlueAgentSnapshot {
		return this.#snapshot;
	}

	getServerSnapshot(): FlueAgentSnapshot {
		return this.#snapshot;
	}

	send(message: string, options?: FlueAgentSendOptions): FlueAgentOperation {
		return this.#requireController().send(message, options);
	}

	reconnect(offset?: string): void {
		this.#requireController().reconnect(offset);
	}

	stop(): void {
		this.#requireController().stop();
	}

	reset(options?: FlueResetOptions): void {
		this.#requireController().reset(options);
	}

	#requireController(): ReturnType<FlueAppClient['agent']> {
		if (!this.#controller) {
			throw new Error('useFlue is not connected to an agent controller yet.');
		}
		return this.#controller;
	}

	#notify(): void {
		for (const listener of this.#listeners) listener();
	}
}

function createInitialSnapshot(id: string): FlueAgentSnapshot {
	return {
		id,
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
