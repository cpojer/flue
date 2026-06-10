# Flue — The Open Agent Application Framework

Build durable agents and workflows in TypeScript and bring your own model, sandbox, routing, and deployment target.

```ts
// src/agents/support.ts
import { createAgent } from "@flue/runtime";
import { local } from "@flue/runtime/node";

export default createAgent(() => ({
  model: "anthropic/claude-fable-5",
  sandbox: local(),
  instructions: `
    Help customers by reading the workspace,
    investigating issues, and proposing fixes.
  `,
}));
```

```ts
// src/workflows/triage.ts
import { createAgent, type FlueContext } from "@flue/runtime";
import { local } from "@flue/runtime/node";

const triage = createAgent(() => ({
  model: "anthropic/claude-fable-5",
  sandbox: local(),
  instructions: "Investigate product issues and return clear next steps.",
}));

export async function run({ init, payload }: FlueContext<{ issue: string }>) {
  const harness = await init(triage);
  const session = await harness.session("triage");
  const response = await session.prompt(payload.issue);

  return { summary: response.text };
}
```

## Build the next generation of agents.

- **Composable:** Define persistent agents and workflows, then connect them to the tools and data your product already uses.
- **Runtime:** Give each agent a complete working environment: sessions, tools, skills, instructions, filesystem access, event streams, and a secure sandbox to run in.
- **Open:** Use the model provider you want, run agents in local, virtual, or remote sandboxes, and run the same app on Node.js, Cloudflare, CI, or your own infrastructure.

## Features

Build agents that can safely take action, maintain continuity, and connect to the systems where work already happens.

- **[Agents](https://flueframework.com/docs/guide/building-agents/)** — Build agents that can keep context across conversations and events as they autonomously work toward a goal.
- **[Workflows](https://flueframework.com/docs/guide/workflows/)** — Run structured automations where your code guides agent reasoning from a clear input to a finished result.
- **[Sandboxes](https://flueframework.com/docs/guide/sandboxes/)** — Give agents a secure environment where they can use tools, modify files, and autonomously complete real work.
- **[Durable Execution](https://flueframework.com/docs/guide/durable-execution/)** — Learn how agents preserve progress through failures and restarts with durable recovery for accepted work.
- **[Subagents](https://flueframework.com/docs/guide/subagents/)** — Define specialized roles for different tasks, then let your agent delegate work to the right expert.
- **[Tools](https://flueframework.com/docs/guide/tools/)** — Give agents typed actions for calling APIs, querying data, and making controlled changes through your application.
- **[Skills](https://flueframework.com/docs/guide/skills/)** — Package reusable expertise and workflows that agents can load whenever a task needs specialized guidance.
- **[MCP Servers](https://flueframework.com/docs/guide/tools/#connect-mcp-tools)** — Connect agents to authenticated tools and services through the open Model Context Protocol ecosystem.
- **[Observability](https://flueframework.com/docs/guide/observability/)** — Monitor your agents and export traces to OpenTelemetry, Braintrust, Sentry, or your own telemetry stack.
- **[Chat](https://flueframework.com/docs/guide/chat/)** — Connect agents to where your work happens across Slack, Teams, Discord, GitHub, and more.

## Deploy Anywhere

- **[Node.js](https://flueframework.com/docs/ecosystem/deploy/node/)**
- **[Cloudflare Workers](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)**
- **[GitHub Actions](https://flueframework.com/docs/ecosystem/deploy/github-actions/)**
- **[GitLab CI/CD](https://flueframework.com/docs/ecosystem/deploy/gitlab-ci/)**
- **[Daytona](https://flueframework.com/docs/ecosystem/sandboxes/daytona/)**
- **[Render](https://flueframework.com/docs/ecosystem/deploy/render/)**

## Packages

| Package                                         | Description                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| [`@flue/runtime`](packages/runtime)             | Runtime: harness, sessions, tools, sandbox             |
| [`@flue/cli`](packages/cli)                     | CLI and build/dev tooling (`flue` binary)              |
| [`@flue/sdk`](packages/sdk)                     | Client SDK for consuming deployed agents and workflows |
| [`@flue/opentelemetry`](packages/opentelemetry) | OpenTelemetry tracing adapter                          |
| [`@flue/postgres`](packages/postgres)           | Postgres persistence adapter                           |
