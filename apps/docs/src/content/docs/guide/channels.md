---
title: Channels
description: Receive external events and dispatch asynchronous input into persistent agent sessions.
---

## What is a channel?

TODO: Define authored inbound/provider channels separately from built-in HTTP and WebSocket exposure.

## Define an inbound channel

TODO: Explain typed event maps, thread/context data, and optional mounted application routes.

## Receive external events

TODO: Cover webhook authentication, payload parsing, and provider-specific normalization.

## Emit typed events

TODO: Explain channel listeners and isolated listener failures.

## Dispatch input to an agent

TODO: Explain `dispatch()` as asynchronous delivery triggered from application/channel logic.

## Choose agent instance and session identity

TODO: Show why external entity/thread keys map naturally to instances and sessions.

## Dispatch IDs and workflow run IDs

TODO: State that dispatch returns `dispatchId`, does not create a workflow run, and is observed differently.

## Route multiple providers into one agent

TODO: Introduce cross-channel case/thread consolidation as an application pattern.
