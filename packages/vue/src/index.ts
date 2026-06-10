import {
	type AttachedAgentEvent,
	createFlueAppClient,
	type FlueAgentControllerOptions,
	type FlueAgentOperation,
	type FlueAgentSendOptions,
	type FlueAgentSnapshot,
	type FlueAppClient,
	type FlueAppClientOptions,
	type FlueClientEvent,
	type FlueResetOptions,
	type FlueUiMessage,
} from '@flue/client';
import {
	type ComputedRef,
	computed,
	getCurrentInstance,
	type InjectionKey,
	inject,
	onUnmounted,
	type Plugin,
	provide,
	type ShallowRef,
	shallowRef,
} from 'vue';

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

const FlueClientKey: InjectionKey<FlueAppClient> = Symbol('FlueClient');
const defaultClient = createFlueAppClient();

export function createFluePlugin(options: FlueAppClientOptions = {}): Plugin {
	const client = createFlueAppClient(options);
	return {
		install(app) {
			app.provide(FlueClientKey, client);
		},
	};
}

export function provideFlueClient(client: FlueAppClient): void {
	provide(FlueClientKey, client);
}

export function useFlueClient(): FlueAppClient {
	return inject(FlueClientKey, defaultClient);
}

export type VueFlueAgent = {
	snapshot: ShallowRef<FlueAgentSnapshot>;
	id: ComputedRef<string>;
	connectionStatus: ComputedRef<FlueAgentSnapshot['connectionStatus']>;
	status: ComputedRef<FlueAgentSnapshot['status']>;
	events: ComputedRef<Array<FlueClientEvent<AttachedAgentEvent>>>;
	messages: ComputedRef<Array<FlueUiMessage>>;
	text: ComputedRef<string>;
	latestOperation: ComputedRef<FlueAgentOperation | null>;
	send(message: string, options?: FlueAgentSendOptions): FlueAgentOperation;
	reconnect(offset?: string): void;
	stop(): void;
	reset(options?: FlueResetOptions): void;
};

export function useFlue(options: FlueAgentControllerOptions): VueFlueAgent {
	const appClient = useFlueClient();
	const controller = appClient.agent(options);
	const snapshot = shallowRef(controller.getSnapshot());
	const unsubscribe = controller.subscribe(() => {
		snapshot.value = controller.getSnapshot();
	});

	if (getCurrentInstance()) {
		onUnmounted(() => {
			unsubscribe();
			appClient.releaseAgent(controller);
		});
	}

	return {
		snapshot,
		id: computed(() => snapshot.value.id),
		connectionStatus: computed(() => snapshot.value.connectionStatus),
		status: computed(() => snapshot.value.status),
		events: computed(() => snapshot.value.events),
		messages: computed(() => snapshot.value.messages),
		text: computed(() => snapshot.value.text),
		latestOperation: computed(() => snapshot.value.latestOperation),
		send: controller.send.bind(controller),
		reconnect: controller.reconnect.bind(controller),
		stop: controller.stop.bind(controller),
		reset: controller.reset.bind(controller),
	};
}
