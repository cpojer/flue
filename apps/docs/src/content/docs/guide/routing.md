---
title: Routing
description: Expose agents and workflows over HTTP or WebSockets inside an authenticated application.
---

## Choose an exposed surface

TODO: Explain that applications expose agent interactions or workflow invocations intentionally.

## Expose agents over HTTP

TODO: Cover direct prompt routes, stable instance IDs, session selection, and attached responses.

## Expose workflows over HTTP

TODO: Cover accepted, wait-for-result, and streamed workflow invocation modes.

## Use WebSockets

TODO: Explain long-lived agent conversations versus one-invocation workflow sockets.

## Agent interactions and workflow runs

TODO: Reinforce that only workflow invocations create inspectable runs and `runId` values.

## Compose a custom app

TODO: Explain `app.ts`, mounting `flue()`, prefixes, and additional application routes.

## Authenticate routes and upgrades

TODO: Cover middleware boundaries and the separate concerns of HTTP and WebSocket authentication.

## Use clients and SDKs

TODO: Introduce client access patterns without duplicating transport API reference.

## Asynchronous inbound delivery

TODO: Point webhook/event readers to Channels and `dispatch()` rather than presenting dispatch as direct routing.
