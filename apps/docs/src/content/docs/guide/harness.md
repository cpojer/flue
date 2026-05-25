---
title: Harness
description: Understand initialized agent environments, sessions, context, state, and compaction.
---

## What is a harness?

TODO: Define the initialized environment returned by `init()` and why documentation uses the name `harness`.

## Harness names

TODO: Explain default and named harness scopes when orchestration initializes multiple environments.

## Sessions

TODO: Define sessions as named conversation/state scopes inside a harness.

### Default and named sessions

TODO: Explain continuing one conversation or separating several threads within an instance.

### Concurrent work

TODO: Explain why independent concurrent branches should use separate sessions.

## State and persistence

TODO: Explain session state and clarify that durability depends on target and configured persistence.

## Instructions and workspace context

TODO: Explain agent instructions plus runtime discovery of workspace guidance.

### AGENTS.md and CLAUDE.md

TODO: State how project guidance becomes session context.

### Working directory

TODO: Explain how `cwd` controls discovered context and skills.

## Files and shell setup

TODO: Introduce `harness.fs`, `session.fs`, `harness.shell()`, and `session.shell()` while deferring sandbox choices.

## Context compaction

TODO: Explain automatic/manual summarization for long sessions, retained recent context, and usage implications.
