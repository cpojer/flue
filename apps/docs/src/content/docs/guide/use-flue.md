---
title: Browser UI
description: Build browser UIs for Flue agents with the React, Vue, and Svelte adapters.
---

`useFlue` connects a browser UI to one persistent Flue agent instance. It gives the UI a live snapshot of the agent's messages, events, status, and stream checkpoint, plus methods for sending prompts and managing the connection.

Install the adapter for your framework:

```sh
pnpm add @flue/react
pnpm add @flue/vue
pnpm add @flue/svelte
```

The shared controller lives in `@flue/client`, but the framework packages depend on it for you. Install `@flue/client` directly only when you are building your own UI integration or using the controller without React, Vue, or Svelte. You do not need the Chat SDK to use `useFlue`.

## React

`@flue/react` requires React 19. The hook uses `useSyncExternalStore` for the live snapshot and exposes a React form action for prompt submission.

```tsx
import { FlueProvider, useFlue } from '@flue/react';
import { useFormStatus } from 'react-dom';
import { createRoot } from 'react-dom/client';

function Chat() {
  const flue = useFlue({ agent: 'support', id: 'browser-demo' });

  return (
    <form action={flue.action}>
      <input name="message" />
      <SubmitButton isStreaming={flue.isStreaming} />

      {flue.messages.map((message) => (
        <p key={message.id}>{message.text}</p>
      ))}
    </form>
  );
}

function SubmitButton({ isStreaming }: { isStreaming: boolean }) {
  const { pending } = useFormStatus();

  return <button disabled={pending || isStreaming}>Send</button>;
}

createRoot(document.getElementById('root')!).render(
  <FlueProvider baseUrl="/api">
    <Chat />
  </FlueProvider>,
);
```

For Suspense-style reads, pass an operation resource to `useFlueOperation(...)`:

```tsx
import { useFlueOperation } from '@flue/react';

const snapshot = useFlueOperation(operation, 'idle');
```

## Vue

`@flue/vue` provides an app plugin and composables. `useFlue(...)` returns computed refs for common snapshot fields.

```ts
import { createFluePlugin, useFlue } from '@flue/vue';
import { createApp } from 'vue';

const app = createApp({
  setup() {
    const flue = useFlue({ agent: 'support', id: 'browser-demo' });

    function send(message: string) {
      flue.send(message);
    }

    return { flue, send };
  },
});

app.use(createFluePlugin({ baseUrl: '/api' }));
app.mount('#app');
```

Read `flue.snapshot.value` for the complete snapshot, or use computed refs such as `flue.messages.value`, `flue.status.value`, and `flue.connectionStatus.value`.

## Svelte

`@flue/svelte` exposes a Svelte readable store. Create the client context once near the root, then call `useFlue(...)` in child components.

```svelte
<!-- Root.svelte -->
<script lang="ts">
  import { createFlueContext } from '@flue/svelte';
  import Chat from './Chat.svelte';

  createFlueContext({ baseUrl: '/api' });
</script>

<Chat />
```

```svelte
<!-- Chat.svelte -->
<script lang="ts">
  import { useFlue } from '@flue/svelte';

  const flue = useFlue({ agent: 'support', id: 'browser-demo' });
  let message = $state('');

  function send(event: SubmitEvent) {
    event.preventDefault();
    flue.send(message);
    message = '';
  }
</script>

<form onsubmit={send}>
  <input bind:value={message} />
  <button disabled={$flue.isStreaming}>Send</button>
</form>

{#each $flue.messages as message}
  <p>{message.text}</p>
{/each}
```

## Client configuration

Framework providers create the shared Flue client for you.

Pass connection options through the framework provider:

```tsx
<FlueProvider baseUrl="/api" token={authToken}>
  <App />
</FlueProvider>
```

`baseUrl` defaults to `/api`. Relative URLs resolve against `window.location.origin`, so same-origin apps can usually omit it. Use an absolute `baseUrl` when the frontend and Flue runtime are served from different origins.

If you are building without a framework adapter, install `@flue/client` and create the shared client directly:

```ts
import { createFlueAppClient } from '@flue/client';

const client = createFlueAppClient({
  baseUrl: '/api',
  token: authToken,
  headers: () => ({ 'x-request-source': 'browser' }),
});
```

## Agent identity

`useFlue({ agent, id })` targets one Flue agent instance. If `id` is omitted, Flue generates a browser ID and stores it in the configured storage.

```ts
useFlue({
  agent: 'support',
  id: 'customer-42',
});
```

By default, storage is `sessionStorage`. Set `storage: 'local'` to keep the generated ID across browser sessions, pass a custom storage object, or set `storage: false` for an in-memory controller.

Multiple components using the same `agent` and `id` share one controller as long as their controller options are compatible. If two callers use the same identity with conflicting options, Flue throws a configuration error instead of silently mixing state.

## Sending prompts

`send(...)` admits a new operation and returns resources for the operation lifecycle.

```ts
const operation = flue.send('Draft a handoff plan');

await operation.accepted;
await operation.idle;
```

Each operation exposes:

| Resource     | Resolves when                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| `accepted`   | The runtime accepts the prompt and returns the submission ID and stream offset. |
| `firstEvent` | The first event for the accepted submission arrives.                           |
| `idle`       | The accepted submission emits `idle`.                                          |
| `snapshot`   | The controller snapshot is available after the operation reaches idle.          |

The default `sendPolicy` is `queue`, so a second send waits until the active operation reaches idle. Use `sendPolicy: 'reject'` when the UI should reject overlapping sends instead.

### Stopping local work

Call `stop()` to disconnect the current stream, abort an in-flight prompt admission request, reject active and queued operation resources, and stop applying output for submissions the controller already knows were stopped.

`stop()` is client-side cancellation. If the runtime has already accepted a submission, the agent may continue running on the server and may still write to its durable history. Server-side submission cancellation requires runtime support and is not part of `useFlue` yet.

## Replay and snapshots

The default replay mode is `new`, which starts future connections at the current stream position. Set `replay: 'offset'` to persist the latest checkpoint and reduced snapshot in browser storage:

```ts
useFlue({
  agent: 'support',
  id: 'customer-42',
  replay: 'offset',
});
```

Replay mode controls the initial connection offset:

| `replay`   | Initial offset behavior                                           |
| ---------- | ----------------------------------------------------------------- |
| `'new'`    | Start from `initialOffset`, which defaults to `'now'`.             |
| `'offset'` | Resume from the stored checkpoint, then fall back to `initialOffset`. |
| `'all'`    | Read from the beginning of the agent stream.                       |

Call `reset()` to clear local UI state and stored replay data for the controller. Pass `reset({ regenerateId: true })` to also remove a generated browser agent ID.

## Custom message state

By default, Flue reduces `text_delta` and `idle` events into `messages` and `text`. Use `reduceEvent` when your UI needs a different projection of raw agent events:

```ts
useFlue({
  agent: 'support',
  id: 'customer-42',
  reduceEvent(snapshot, event) {
    return {
      ...snapshot,
      events: [...snapshot.events, event],
    };
  },
});
```

Use `onEvent` for side effects such as analytics. Keep `reduceEvent` pure; it controls the snapshot that every subscriber receives.
