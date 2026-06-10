import { type AttachedAgentEvent, createFlueAppClient, createFluePlugin, type FlueClient, useFlue } from '@flue/vue';
import { createApp, h, ref } from 'vue';
import './style.css';

const appClient = createFlueAppClient({ client: createDemoClient(), storage: false });

const Demo = {
	setup() {
		const message = ref('');
		const flue = useFlue({ agent: 'support', id: 'demo-vue' });
		const submit = () => {
			if (!message.value.trim()) return;
			flue.send(message.value);
			message.value = '';
		};
		return () =>
			h('main', { class: 'shell' }, [
				h('section', { class: 'workspace' }, [
					h('header', [
						h('div', [h('p', { class: 'eyebrow' }, 'Vue'), h('h1', 'useFlue demo')]),
						h('span', { class: ['status', flue.status.value] }, flue.status.value),
					]),
					h('form', {
						class: 'prompt',
						onSubmit: (event: Event) => {
							event.preventDefault();
							submit();
						},
					}, [
						h('input', {
							value: message.value,
							placeholder: 'Ask the agent to plan a launch checklist',
							onInput: (event: Event) => {
								message.value = (event.currentTarget as HTMLInputElement).value;
							},
						}),
						h('button', { disabled: flue.snapshot.value.isStreaming }, 'Send'),
					]),
					h('section', { class: 'transcript' }, flue.messages.value.map((item) =>
						h('p', { key: item.id, class: item.role }, [
							h('strong', item.role),
							h('span', item.text),
						]),
					)),
				]),
				h('aside', [
					h('h2', 'Events'),
					h('ul', flue.events.value.map((event) =>
						h('li', { key: event.id }, `${event.event.type} · ${event.event.submissionId}`),
					)),
					h('p', { class: 'checkpoint' }, flue.snapshot.value.checkpoint?.offset ?? 'no checkpoint'),
				]),
			]);
	},
};

createApp(Demo).use(createFluePlugin({ client: appClient.getSdk() })).mount('#app');

function createDemoClient(): FlueClient {
	let count = 0;
	return {
		agents: {
			prompt: async () => ({ result: null, streamUrl: '', offset: '-1' }),
			send: async (_agent: string, id: string) => {
				count++;
				return { submissionId: `vue-${count}`, streamUrl: `/agents/support/${id}`, offset: `offset-${count - 1}` };
			},
			stream: (_agent: string, id: string) => demoStream(id, `vue-${count}`),
		},
		runs: {} as never,
		workflows: {} as never,
		admin: {} as never,
	};
}

function demoStream(id: string, submissionId: string): ReturnType<FlueClient['agents']['stream']> {
	const events: AttachedAgentEvent[] = [
		{ type: 'text_delta', text: `Drafting a Vue handoff for ${id}. `, instanceId: id, submissionId },
		{ type: 'text_delta', text: 'The mock stream completed.', instanceId: id, submissionId },
		{ type: 'idle', instanceId: id, submissionId },
	];
	return {
		offset: `${submissionId}:done`,
		cancel() {},
		async *batches() {
			await new Promise((resolve) => setTimeout(resolve, 120));
			yield { events, nextOffset: `${submissionId}:done` };
		},
		async *[Symbol.asyncIterator]() {
			for (const event of events) yield event;
		},
	};
}
