import { flue, observe } from '@flue/runtime/app';
import { Hono } from 'hono';

observe((event) => {
	if (event.type === 'agent_start') {
		console.log(`[github-webhook-example] agent_start ${event.dispatchId ?? event.instanceId ?? ''}`);
	}
	if (event.type === 'text_delta') {
		console.log(`[github-webhook-example] text_delta ${event.text}`);
	}
	if (event.type === 'agent_end') {
		console.log(`[github-webhook-example] agent_end ${event.dispatchId ?? event.instanceId ?? ''}`);
	}
	if (event.type === 'error') {
		console.log(`[github-webhook-example] error ${event.message}`);
	}
});

const app = new Hono();
app.route('/', flue());

export default app;
