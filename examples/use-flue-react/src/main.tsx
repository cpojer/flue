import { type AttachedAgentEvent, createFlueAppClient, type FlueClient, FlueProvider, useFlue } from '@flue/react';
import { useFormStatus } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './style.css';

const client = createFlueAppClient({ client: createDemoClient(), storage: false });

function App() {
	const flue = useFlue({ agent: 'support', id: 'demo-react' });

	return (
		<main className="shell">
			<section className="workspace">
				<header>
					<div>
						<p className="eyebrow">React</p>
						<h1>useFlue demo</h1>
					</div>
					<span className={`status ${flue.status}`}>{flue.status}</span>
				</header>

				<form action={flue.action} className="prompt">
					<input name="message" placeholder="Ask the agent to plan a deploy handoff" />
					<SubmitButton isStreaming={flue.isStreaming} />
				</form>

				<section className="transcript">
					{flue.messages.map((message) => (
						<p key={message.id} className={message.role}>
							<strong>{message.role}</strong>
							<span>{message.text}</span>
						</p>
					))}
				</section>
			</section>

			<aside>
				<h2>Events</h2>
				<ul>
					{flue.events.map((event) => (
						<li key={event.id}>
							{event.event.type} · {event.event.submissionId}
						</li>
					))}
				</ul>
				<p className="checkpoint">{flue.checkpoint?.offset ?? 'no checkpoint'}</p>
			</aside>
		</main>
	);
}

function SubmitButton({ isStreaming }: { isStreaming: boolean }) {
	const { pending } = useFormStatus();
	return (
		<button type="submit" disabled={pending || isStreaming}>
			Send
		</button>
	);
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
	<FlueProvider client={client.getSdk()}>
		<App />
	</FlueProvider>,
);

function createDemoClient(): FlueClient {
	let count = 0;
	return {
		agents: {
			prompt: async () => ({ result: null, streamUrl: '', offset: '-1' }),
			send: async (_agent: string, id: string, _options: { message: string }) => {
				count++;
				return { submissionId: `react-${count}`, streamUrl: `/agents/support/${id}`, offset: `offset-${count - 1}` };
			},
			stream: (_agent: string, id: string) => demoStream(id, `react-${count}`),
		},
		runs: {} as never,
		workflows: {} as never,
		admin: {} as never,
	};
}

function demoStream(id: string, submissionId: string): ReturnType<FlueClient['agents']['stream']> {
	const events: AttachedAgentEvent[] = [
		{ type: 'text_delta', text: `Preparing a plan for ${id}. `, instanceId: id, submissionId },
		{ type: 'text_delta', text: 'I found three next steps.', instanceId: id, submissionId },
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
