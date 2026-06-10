/**
 * Typed Durable Streams wrapper for Flue event consumption.
 *
 * Wraps `@durable-streams/client` to provide an {@link AsyncIterable} of
 * {@link FlueEvent} values with automatic reconnection, offset-based replay,
 * and SSE live tailing.
 */

import type { BackoffOptions, JsonBatch, LiveMode } from '@durable-streams/client';
import { stream } from '@durable-streams/client';
import type { FlueEvent } from '../types.ts';

/** Options for streaming Flue events from an agent instance or workflow run. */
export interface FlueStreamOptions {
	/** Starting offset. Defaults to `'-1'` (full history). */
	offset?: string;
	/** Live tailing mode. Defaults to `true` (long-poll). */
	live?: LiveMode;
	/** Abort signal to cancel the stream. */
	signal?: AbortSignal;
	/** Retry behavior for stream connection attempts. */
	backoffOptions?: BackoffOptions;
}

export interface FlueEventBatch<T = FlueEvent> {
	readonly events: ReadonlyArray<T>;
	readonly nextOffset: string;
}

/**
 * Async iterable of Flue events backed by a Durable Streams connection.
 *
 * Supports `for await...of` and explicit {@link cancel}. Breaking out of a
 * `for await` loop automatically cleans up the underlying connection.
 */
export interface FlueEventStream<T = FlueEvent> extends AsyncIterable<T> {
	/** Cancel the stream and abort the underlying connection. */
	cancel(reason?: unknown): void;
	/**
	 * Iterates complete Durable Streams response batches. `nextOffset` is safe
	 * to checkpoint only after every event in the batch has been processed.
	 */
	batches(): AsyncIterable<FlueEventBatch<T>>;
	/**
	 * Resume offset of the most recently fetched batch (the server's
	 * `Stream-Next-Offset`). Advances per HTTP response, not per delivered
	 * event — every event in a batch observes the batch's final offset, so
	 * checkpointing this value mid-batch and resuming from it skips the rest
	 * of that batch. On workflow-run streams the event's `eventIndex` equals
	 * the stream sequence and can serve as a per-event checkpoint instead.
	 * Agent streams restart `eventIndex` per prompt, so there it is not an
	 * offset.
	 */
	readonly offset: string;
}

/** Internal options passed by the FlueClient to configure the DS connection. */
export interface StreamConnectionOptions {
	/** Full URL of the stream endpoint. */
	url: string;
	/** Custom fetch implementation. */
	fetch?: typeof globalThis.fetch;
}

/**
 * Creates a {@link FlueEventStream} that yields individual {@link FlueEvent}
 * values from a Durable Streams endpoint.
 *
 * Pulls events directly from the DS client's `jsonStream()` ReadableStream
 * reader in each `next()` call. This provides natural backpressure — the DS
 * client only fetches the next batch when the consumer is ready — and avoids
 * unbounded memory growth for slow consumers.
 */
export function createFlueEventStream<T = FlueEvent>(
	streamOpts: FlueStreamOptions,
	connectionOpts: StreamConnectionOptions,
): FlueEventStream<T> {
	const abortController = new AbortController();

	// Link external signal to our controller. Store the handler so we can
	// remove it when the stream completes naturally (avoids retaining the
	// closure scope on long-lived AbortSignals).
	let removeExternalAbortListener: (() => void) | undefined;
	const externalSignal = streamOpts.signal;
	if (externalSignal) {
		if (externalSignal.aborted) {
			abortController.abort(externalSignal.reason);
		} else {
			const onAbort = () => abortController.abort(externalSignal.reason);
			externalSignal.addEventListener('abort', onAbort, { once: true });
			removeExternalAbortListener = () => externalSignal.removeEventListener('abort', onAbort);
		}
	}

	const fetch = connectionOpts.fetch ?? globalThis.fetch;

	let responsePromise: Promise<Awaited<ReturnType<typeof stream<T>>>> | undefined;
	const connect = (): Promise<Awaited<ReturnType<typeof stream<T>>>> => {
		if (responsePromise) return responsePromise;
		if (abortController.signal.aborted) {
			return Promise.reject(abortController.signal.reason ?? new DOMException('Aborted', 'AbortError'));
		}
		responsePromise = stream<T>({
			url: connectionOpts.url,
			offset: streamOpts.offset ?? '-1',
			live: streamOpts.live ?? true,
			json: true,
			signal: abortController.signal,
			fetch,
			backoffOptions: streamOpts.backoffOptions,
			warnOnHttp: false,
		});
		return responsePromise;
	};

	const cancel = (reason?: unknown) => {
		abortController.abort(reason);
		removeExternalAbortListener?.();
	};

	let consumed = false;
	let currentOffset = streamOpts.offset ?? '-1';

	const claimStream = () => {
		if (consumed) {
			throw new Error('[flue-sdk] A stream can only be consumed once.');
		}
		consumed = true;
	};

	const batches = (): AsyncIterable<FlueEventBatch<T>> => createBatchIterable({
		claimStream,
		connect,
		cancel,
		abortSignal: abortController.signal,
		live: streamOpts.live ?? true,
		removeExternalAbortListener: () => removeExternalAbortListener?.(),
		setOffset(offset) {
			currentOffset = offset;
		},
	});

	let eventReader: ReadableStreamDefaultReader<T> | undefined;
	let eventReaderDone = false;

	const iterator: AsyncIterator<T> = {
		async next(): Promise<IteratorResult<T>> {
			if (abortController.signal.aborted) {
				removeExternalAbortListener?.();
				return { value: undefined as T, done: true };
			}

			try {
				if (!eventReader) {
					claimStream();
					const res = await connect();
					currentOffset = res.offset;
					eventReader = res.jsonStream().getReader();
				}

				if (eventReaderDone) {
					return { value: undefined as T, done: true };
				}

				const { value, done } = await eventReader.read();
				if (done) {
					eventReaderDone = true;
					removeExternalAbortListener?.();
					return { value: undefined as T, done: true };
				}
				if (responsePromise) {
					currentOffset = (await responsePromise).offset;
				}
				return { value, done: false };
			} catch (err) {
				if (abortController.signal.aborted || isAbortError(err)) {
					return { value: undefined as T, done: true };
				}
				throw err;
			}
		},
		async return(): Promise<IteratorResult<T>> {
			cancel();
			try { await eventReader?.cancel(); } catch { /* ignore */ }
			return { value: undefined as T, done: true };
		},
	};

	return {
		batches,
		cancel,
		get offset() {
			return currentOffset;
		},
		[Symbol.asyncIterator]() {
			return iterator;
		},
	};
}

function createBatchIterable<T>({
	claimStream,
	connect,
	cancel,
	abortSignal,
	live,
	removeExternalAbortListener,
	setOffset,
}: {
	claimStream(): void;
	connect(): Promise<{
		readonly closed: Promise<void>;
		readonly offset: string;
		readonly streamClosed: boolean;
		json<U = T>(): Promise<Array<U>>;
		subscribeJson<U = T>(subscriber: (batch: JsonBatch<U>) => void | Promise<void>): () => void;
	}>;
	cancel(reason?: unknown): void;
	abortSignal: AbortSignal;
	live: LiveMode;
	removeExternalAbortListener(): void;
	setOffset(offset: string): void;
}): AsyncIterable<FlueEventBatch<T>> {
	return {
		async *[Symbol.asyncIterator]() {
			claimStream();
			if (abortSignal.aborted) {
				removeExternalAbortListener();
				return;
			}

			const queue: Array<FlueEventBatch<T>> = [];
			let wake: (() => void) | undefined;
			let done = false;
			let error: unknown;
			let unsubscribe: (() => void) | undefined;

			const notify = () => {
				wake?.();
				wake = undefined;
			};

			try {
				const res = await connect();
				if (live === false) {
					const events = await res.json<T>();
					setOffset(res.offset);
					if (events.length > 0) {
						yield { events, nextOffset: res.offset };
					}
					return;
				}

				if (res.streamClosed) {
					const events = await res.json<T>();
					setOffset(res.offset);
					if (events.length > 0) {
						yield { events, nextOffset: res.offset };
					}
					return;
				}

				unsubscribe = res.subscribeJson<T>((batch) => {
					setOffset(batch.offset);
					if (batch.items.length > 0) {
						queue.push({ events: batch.items, nextOffset: batch.offset });
					}
					if (batch.streamClosed) {
						done = true;
					}
					notify();
				});
				void res.closed.then(
					() => {
						queueMicrotask(() => {
							done = true;
							notify();
						});
					},
					(reason) => {
						queueMicrotask(() => {
							error = reason;
							notify();
						});
					},
				);

				while (true) {
					while (queue.length > 0) {
						const batch = queue.shift();
						if (batch) yield batch;
					}
					if (done || abortSignal.aborted) return;
					if (error) throw error;
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
				}
			} catch (err) {
				if (abortSignal.aborted || isAbortError(err)) return;
				throw err;
			} finally {
				done = true;
				unsubscribe?.();
				cancel();
				removeExternalAbortListener();
			}
		},
	};
}

function isAbortError(err: unknown): boolean {
	if (err instanceof DOMException && err.name === 'AbortError') return true;
	if (err instanceof Error && err.name === 'AbortError') return true;
	return false;
}
