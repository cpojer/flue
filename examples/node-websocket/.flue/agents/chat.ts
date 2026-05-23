import { createAgent, websocket } from '@flue/runtime';

export const channels = [websocket()];

export default createAgent(() => ({
	model: 'anthropic/claude-haiku-4-5',
}));
