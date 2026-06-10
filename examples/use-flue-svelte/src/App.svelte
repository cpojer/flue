<script lang="ts">
	import { type AttachedAgentEvent, createFlueAppClient, type FlueClient, setFlueClient, useFlue } from '@flue/svelte';

	const appClient = createFlueAppClient({ client: createDemoClient(), storage: false });
	setFlueClient(appClient);

	const flue = useFlue({ agent: 'support', id: 'demo-svelte' });
	let message = $state('');

	// biome-ignore lint/correctness/noUnusedVariables: Referenced from the Svelte template.
	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!message.trim()) return;
		flue.send(message);
		message = '';
	}

	function createDemoClient(): FlueClient {
		let count = 0;
		return {
			agents: {
				prompt: async () => ({ result: null, streamUrl: '', offset: '-1' }),
				send: async (_agent, id) => {
					count++;
					return { submissionId: `svelte-${count}`, streamUrl: `/agents/support/${id}`, offset: `offset-${count - 1}` };
				},
				stream: (_agent, id) => demoStream(id, `svelte-${count}`),
			},
			runs: {} as never,
			workflows: {} as never,
			admin: {} as never,
		};
	}

	function demoStream(id: string, submissionId: string): ReturnType<FlueClient['agents']['stream']> {
		const events: AttachedAgentEvent[] = [
			{ type: 'text_delta', text: `Building a Svelte response for ${id}. `, instanceId: id, submissionId },
			{ type: 'text_delta', text: 'The adapter is using the shared controller.', instanceId: id, submissionId },
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
</script>

<main class="shell">
	<section class="workspace">
		<header>
			<div>
				<p class="eyebrow">Svelte</p>
				<h1>useFlue demo</h1>
			</div>
			<span class="status {$flue.status}">{$flue.status}</span>
		</header>

		<form class="prompt" onsubmit={submit}>
			<input bind:value={message} placeholder="Ask the agent to plan a release note" />
			<button type="submit" disabled={$flue.isStreaming}>Send</button>
		</form>

		<section class="transcript">
			{#each $flue.messages as item}
				<p class={item.role}>
					<strong>{item.role}</strong>
					<span>{item.text}</span>
				</p>
			{/each}
		</section>
	</section>

	<aside>
		<h2>Events</h2>
		<ul>
			{#each $flue.events as event}
				<li>{event.event.type} · {event.event.submissionId}</li>
			{/each}
		</ul>
		<p class="checkpoint">{$flue.checkpoint?.offset ?? 'no checkpoint'}</p>
	</aside>
</main>
