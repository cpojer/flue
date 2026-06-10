import {
	createFlueAppClient,
	type FlueAgentControllerOptions,
	type FlueAgentOperation,
	type FlueAgentSendOptions,
	type FlueAgentSnapshot,
	type FlueAppClient,
	type FlueAppClientOptions,
	type FlueResetOptions,
} from '@flue/client';
import { getContext, onDestroy, setContext } from 'svelte';
import { type Readable, readable } from 'svelte/store';

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

const FLUE_CLIENT_KEY = Symbol('FlueClient');
const defaultClient = createFlueAppClient();

export function createFlueContext(options: FlueAppClientOptions = {}): FlueAppClient {
	const client = createFlueAppClient(options);
	setContext(FLUE_CLIENT_KEY, client);
	return client;
}

export function setFlueClient(client: FlueAppClient): void {
	setContext(FLUE_CLIENT_KEY, client);
}

export function useFlueClient(): FlueAppClient {
	return getContext<FlueAppClient>(FLUE_CLIENT_KEY) ?? defaultClient;
}

export type SvelteFlueAgent = Readable<FlueAgentSnapshot> & {
	send(message: string, options?: FlueAgentSendOptions): FlueAgentOperation;
	reconnect(offset?: string): void;
	stop(): void;
	reset(options?: FlueResetOptions): void;
};

export function useFlue(options: FlueAgentControllerOptions): SvelteFlueAgent {
	const appClient = useFlueClient();
	const controller = appClient.agent(options);
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		appClient.releaseAgent(controller);
	};
	const snapshot = readable(controller.getSnapshot(), (set) => {
		const unsubscribe = controller.subscribe(() => set(controller.getSnapshot()));
		return () => {
			unsubscribe();
			release();
		};
	});

	onDestroy(release);

	return {
		subscribe: snapshot.subscribe,
		send: controller.send.bind(controller),
		reconnect: controller.reconnect.bind(controller),
		stop: controller.stop.bind(controller),
		reset: controller.reset.bind(controller),
	};
}
