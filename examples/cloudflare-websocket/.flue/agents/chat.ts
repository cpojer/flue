import { createAgent, websocket } from '@flue/runtime';

export const channels = [websocket()];

export default createAgent(() => ({
	model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
}));
