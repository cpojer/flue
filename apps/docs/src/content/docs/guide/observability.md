---
title: Observability
description: Inspect workflow runs, observe runtime events, and correlate application activity.
---

## Understand execution identifiers

TODO: Establish `runId`, `instanceId`, session names, `operationId`, and `dispatchId` before discussing logs.

## Workflow run events

TODO: Explain persisted lifecycle and operation events emitted during workflow invocation.

## Structured logging

TODO: Cover emitting application-level logs through workflow context.

## Inspect runs with the CLI

TODO: Explain `flue logs`, live following, replay, and output filtering.

## Stream and retrieve run events

TODO: Introduce run inspection endpoints/clients while deferring exact protocol reference.

## Observe application events

TODO: Explain `observe()` for cross-cutting metrics and error forwarding, including direct/dispatched agent events.

## Integrate error reporting

TODO: Cover Sentry-style reporting patterns and signals worth capturing.

## Correlate agent activity correctly

TODO: Reinforce that agent interactions and dispatches are not workflow runs.
