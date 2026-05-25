---
title: Project Layout
description: Organize agents, workflows, channels, application code, and workspace context in a Flue project.
---

## Choose a source layout

TODO: Explain that a project uses either the `.flue/` layout or root-level authored modules, never both.

### The `.flue/` layout

TODO: Outline the recommended colocated application source layout.

### The root-level layout

TODO: Explain the equivalent layout for projects without `.flue/`.

## Agent modules

TODO: Cover the location and purpose of addressable, default-exported created agents.

## Workflows

TODO: Cover the location and purpose of `run()`-exporting orchestration modules.

## Channels

TODO: Cover the location of authored inbound provider adapters.

## Custom application entrypoint

TODO: Explain where `app.ts` lives and when a project needs one.

## Workspace context

TODO: Distinguish runtime-discovered `AGENTS.md`, `CLAUDE.md`, and `.agents/skills/` from authored `.flue/` modules.

## Build output

TODO: Explain the default `dist/` artifact location and its relationship to the project root.
