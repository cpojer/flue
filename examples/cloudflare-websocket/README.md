# Cloudflare WebSocket Example

This example exposes a created-agent WebSocket backed by its owning Durable Object and Workers AI binding.

```bash
pnpm exec flue dev --target cloudflare
```

Connect to a stable instance id with the SDK:

```ts
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({ baseUrl: 'http://localhost:3583' });
const chat = client.agents.connect('chat', 'customer-123');
await chat.ready;
chat.onEvent((event) => console.log(event));
console.log(await chat.prompt('Hello from Cloudflare', { session: 'support' }));
console.log(await chat.prompt('Continue our conversation', { session: 'support' }));
chat.close();
```

The stable instance id selects the same Durable Object-backed agent scope. The generated Cloudflare transport accepts hibernation-compatible sockets inside that owning Durable Object.

Deploy with:

```bash
pnpm exec flue build --target cloudflare
pnpm exec wrangler deploy
```

This example intentionally omits `.flue/app.ts`: custom app WebSocket mounting is not supported yet. Generated socket routes have no application-level upgrade authorization hook yet, so protect production endpoints with an authenticated upstream gateway or proxy.
