import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCache, isWindyRateLimit, mapWithConcurrency, withWindyRequestLimit } from '../src/lib/async.js';

test('session memory cache expires values, evicts least recently used entries, and clears on close', () => {
	let now = 100;
	const cache = createMemoryCache({ ttlMs: 10, maxEntries: 2, now: () => now });
	cache.set('a', 'first');
	cache.set('b', 'second');
	assert.equal(cache.get('a'), 'first');
	cache.set('c', 'third');
	assert.equal(cache.get('b'), undefined);
	assert.equal(cache.get('a'), 'first');
	now = 110;
	assert.equal(cache.get('a'), undefined);
	assert.equal(cache.get('c'), undefined);
	cache.set('d', 'fourth');
	cache.clear();
	assert.equal(cache.size, 0);
	assert.equal(cache.get('d'), undefined);
});

test('bounded worker pool respects its limit and keeps result order', async () => {
	let active = 0;
	let maxActive = 0;
	const result = await mapWithConcurrency([0, 1, 2, 3, 4], 2, async value => {
		active += 1;
		maxActive = Math.max(maxActive, active);
		await new Promise(resolve => setTimeout(resolve, 4));
		active -= 1;
		return value * 2;
	});
	assert.equal(maxActive, 2);
	assert.deepEqual(result, [0, 2, 4, 6, 8]);
});

test('worker pool stops assigning queued items after cancellation', async () => {
	let cancelled = false;
	let release;
	const barrier = new Promise(resolve => { release = resolve; });
	const assigned = [];
	await mapWithConcurrency([0, 1, 2, 3, 4], 2, async value => {
		assigned.push(value);
		if (assigned.length === 2) {
			cancelled = true;
			release();
		}
		await barrier;
		return value;
	}, () => cancelled);
	assert.deepEqual(assigned, [0, 1]);
});

test('shared Windy request limiter caps simultaneous calls at three', async () => {
	let active = 0;
	let maxActive = 0;
	await Promise.all(Array.from({ length: 9 }, (_, index) => withWindyRequestLimit(async () => {
		active += 1;
		maxActive = Math.max(maxActive, active);
		await new Promise(resolve => setTimeout(resolve, 3 + index % 2));
		active -= 1;
		return index;
	})));
	assert.equal(maxActive, 3);
});

test('coalesces concurrent identical Windy requests and clears the key after completion', async () => {
	let calls = 0;
	const request = async () => {
		calls += 1;
		await new Promise(resolve => setTimeout(resolve, 4));
		return 'forecast';
	};
	const results = await Promise.all(Array.from({ length: 6 }, () => withWindyRequestLimit(request, 'same-profile')));
	assert.deepEqual(results, Array(6).fill('forecast'));
	assert.equal(calls, 1);
	assert.equal(await withWindyRequestLimit(request, 'same-profile'), 'forecast');
	assert.equal(calls, 2);
});

test('aborting the last subscriber cancels an active Windy request and allows a clean retry', async () => {
	const caller = new AbortController();
	let requestSignal;
	let started;
	const startedPromise = new Promise(resolve => { started = resolve; });
	let requestCalls = 0;
	const pending = withWindyRequestLimit(signal => {
		requestCalls += 1;
		requestSignal = signal;
		started();
		return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
			const error = new Error('aborted by caller');
			error.name = 'AbortError';
			reject(error);
		}, { once: true }));
	}, 'abortable-profile', caller.signal);
	await startedPromise;
	caller.abort();
	await assert.rejects(pending, { name: 'AbortError' });
	assert.equal(requestSignal.aborted, true);
	assert.equal(await withWindyRequestLimit(async () => 'retried', 'abortable-profile'), 'retried');
	assert.equal(requestCalls, 1);
});

test('one cancelled subscriber does not abort a deduplicated request still used by another caller', async () => {
	const cancelledCaller = new AbortController();
	const activeCaller = new AbortController();
	let requestSignal;
	let finishRequest;
	let started;
	const startedPromise = new Promise(resolve => { started = resolve; });
	let requestCalls = 0;
	const request = signal => {
		requestCalls += 1;
		requestSignal = signal;
		started();
		return new Promise(resolve => { finishRequest = resolve; });
	};
	const cancelled = withWindyRequestLimit(request, 'shared-profile', cancelledCaller.signal);
	const stillNeeded = withWindyRequestLimit(request, 'shared-profile', activeCaller.signal);
	await startedPromise;
	cancelledCaller.abort();
	await assert.rejects(cancelled, { name: 'AbortError' });
	assert.equal(requestSignal.aborted, false);
	finishRequest('forecast');
	assert.equal(await stillNeeded, 'forecast');
	assert.equal(requestCalls, 1);
});

test('aborting a queued Windy request removes it before network work starts', async () => {
	const releases = [];
	let startedCount = 0;
	let signalStarted;
	const allStarted = new Promise(resolve => { signalStarted = resolve; });
	const activeRequests = Array.from({ length: 3 }, () => withWindyRequestLimit(() => new Promise(resolve => {
		startedCount += 1;
		releases.push(resolve);
		if (startedCount === 3) signalStarted();
	})));
	await allStarted;
	const caller = new AbortController();
	let queuedStarted = false;
	const queued = withWindyRequestLimit(() => {
		queuedStarted = true;
		return 'unexpected';
	}, null, caller.signal);
	caller.abort();
	await assert.rejects(queued, { name: 'AbortError' });
	for (const release of releases) release('done');
	await Promise.all(activeRequests);
	assert.equal(queuedStarted, false);
});

test('identifies Windy throttling responses so route sampling can stop safely', () => {
	assert.equal(isWindyRateLimit({ status: 429 }), true);
	assert.equal(isWindyRateLimit({ response: { status: 429 } }), true);
	assert.equal(isWindyRateLimit(new Error('Too many requests')), true);
	assert.equal(isWindyRateLimit(new Error('network timeout')), false);
});
