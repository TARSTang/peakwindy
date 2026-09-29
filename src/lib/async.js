let activeWindyRequests = 0;
const windyRequestQueue = [];
const inFlightWindyRequests = new Map();

export function createMemoryCache({ ttlMs = 5 * 60_000, maxEntries = 48, now = () => Date.now() } = {}) {
	const entries = new Map();
	const capacity = Math.max(0, Math.floor(maxEntries));
	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt <= now()) {
				entries.delete(key);
				return undefined;
			}
			entries.delete(key);
			entries.set(key, entry);
			return entry.value;
		},
		set(key, value) {
			if (capacity === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) return;
			entries.delete(key);
			entries.set(key, { value, expiresAt: now() + ttlMs });
			while (entries.size > capacity) entries.delete(entries.keys().next().value);
		},
		clear() {
			entries.clear();
		},
		get size() {
			return entries.size;
		},
	};
}

function makeAbortError() {
	if (typeof DOMException === 'function') return new DOMException('Windy request aborted', 'AbortError');
	const error = new Error('Windy request aborted');
	error.name = 'AbortError';
	return error;
}

function detachQueuedAbort(task) {
	if (task.signal && task.onAbort) task.signal.removeEventListener('abort', task.onAbort);
	task.onAbort = null;
}

function pumpWindyRequestQueue() {
	while (activeWindyRequests < 3 && windyRequestQueue.length) {
		const task = windyRequestQueue.shift();
		detachQueuedAbort(task);
		if (task.signal?.aborted) {
			task.reject(makeAbortError());
			continue;
		}
		startWindyRequest(task);
	}
}

function startWindyRequest(task) {
	if (task.signal?.aborted) {
		task.reject(makeAbortError());
		pumpWindyRequestQueue();
		return;
	}
	task.started = true;
	activeWindyRequests += 1;
	let abortHandler = null;
	const requestPromise = Promise.resolve().then(() => task.request(task.signal));
	const guardedPromise = task.signal
		? Promise.race([requestPromise, new Promise((_, reject) => {
			abortHandler = () => reject(makeAbortError());
			task.signal.addEventListener('abort', abortHandler, { once: true });
			if (task.signal.aborted) abortHandler();
		})])
		: requestPromise;
	guardedPromise.then(task.resolve, task.reject).finally(() => {
		if (abortHandler) task.signal.removeEventListener('abort', abortHandler);
		activeWindyRequests -= 1;
		pumpWindyRequestQueue();
	});
}

function runWithWindyRequestLimit(request, signal = null) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(makeAbortError());
			return;
		}
		const task = { request, signal, resolve, reject, started: false, onAbort: null };
		if (activeWindyRequests < 3) {
			startWindyRequest(task);
			return;
		}
		task.onAbort = () => {
			if (task.started) return;
			const index = windyRequestQueue.indexOf(task);
			if (index >= 0) windyRequestQueue.splice(index, 1);
			detachQueuedAbort(task);
			reject(makeAbortError());
			pumpWindyRequestQueue();
		};
		windyRequestQueue.push(task);
		signal?.addEventListener('abort', task.onAbort, { once: true });
		if (signal?.aborted) task.onAbort();
	});
}

export function isWindyRateLimit(error) {
	const record = error !== null && typeof error === 'object' ? error : {};
	const response = record.response !== null && typeof record.response === 'object' ? record.response : {};
	const status = Number(record.status ?? record.statusCode ?? response.status);
	const message = error instanceof Error ? error.message : String(error ?? '');
	return status === 429 || /\b429\b|too many requests|rate.?limit|请求过于频繁|频率限制/i.test(message);
}

function subscribeToWindyRequest(flight, callerSignal) {
	if (callerSignal?.aborted) return Promise.reject(makeAbortError());
	const subscriber = Symbol('windy-request-subscriber');
	flight.subscribers.add(subscriber);
	let abortHandler = null;
	const callerPromise = callerSignal
		? new Promise((_, reject) => {
			abortHandler = () => reject(makeAbortError());
			callerSignal.addEventListener('abort', abortHandler, { once: true });
			if (callerSignal.aborted) abortHandler();
		})
		: null;
	return (callerPromise ? Promise.race([flight.promise, callerPromise]) : flight.promise).finally(() => {
		if (abortHandler) callerSignal.removeEventListener('abort', abortHandler);
		flight.subscribers.delete(subscriber);
		if (!flight.settled && flight.subscribers.size === 0) flight.controller.abort();
	});
}

export function withWindyRequestLimit(request, requestKey = null, callerSignal = null) {
	if (callerSignal?.aborted) return Promise.reject(makeAbortError());
	if (requestKey === null) return runWithWindyRequestLimit(request, callerSignal);

	let flight = inFlightWindyRequests.get(requestKey);
	if (flight?.controller.signal.aborted || flight?.settled) {
		if (inFlightWindyRequests.get(requestKey) === flight) inFlightWindyRequests.delete(requestKey);
		flight = null;
	}
	if (!flight) {
		const controller = new AbortController();
		flight = { controller, subscribers: new Set(), settled: false, promise: null };
		const createdFlight = flight;
		createdFlight.promise = runWithWindyRequestLimit(request, controller.signal).finally(() => {
			createdFlight.settled = true;
			if (inFlightWindyRequests.get(requestKey) === createdFlight) inFlightWindyRequests.delete(requestKey);
		});
		inFlightWindyRequests.set(requestKey, createdFlight);
	}
	return subscribeToWindyRequest(flight, callerSignal);
}

export async function mapWithConcurrency(items, limit, worker, isCancelled = () => false) {
	const output = new Array(items.length);
	let cursor = 0;
	const count = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
	const runners = Array.from({ length: count }, async () => {
		while (!isCancelled()) {
			const index = cursor++;
			if (index >= items.length) return;
			output[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return output;
}
