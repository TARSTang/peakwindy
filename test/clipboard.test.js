import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard } from '../src/lib/clipboard.js';

test('copies directly with the browser clipboard API', async () => {
	const writes = [];
	const documentRef = { createElement() { throw new Error('fallback should not run'); } };
	const result = await copyTextToClipboard('摘要', {
		clipboard: { async writeText(text) { writes.push(text); } },
		documentRef,
	});
	assert.equal(result, true);
	assert.deepEqual(writes, ['摘要']);
});

test('falls back to a temporary selected textarea when the clipboard API rejects', async () => {
	const calls = [];
	let temporary;
	const documentRef = {
		body: { appendChild(element) { temporary = element; calls.push('append'); } },
		createElement(tag) {
			assert.equal(tag, 'textarea');
			return {
				style: {},
				value: '',
				parentNode: { removeChild(element) { assert.equal(element, temporary); calls.push('remove'); } },
				setAttribute(name) { calls.push(`attribute:${name}`); },
				focus() { calls.push('focus'); },
				select() { calls.push('select'); },
				setSelectionRange(start, end) { calls.push(`selection:${start}-${end}`); },
			};
		},
		execCommand(command) { calls.push(command); return true; },
	};
	const result = await copyTextToClipboard('windy 摘要', {
		clipboard: { async writeText() { throw new Error('permission denied'); } },
		documentRef,
	});
	assert.equal(result, true);
	assert.equal(temporary.value, 'windy 摘要');
	assert.deepEqual(calls, ['attribute:readonly', 'attribute:aria-hidden', 'append', 'focus', 'select', 'selection:0-8', 'copy', 'remove']);
});

test('returns false when both clipboard routes are unavailable', async () => {
	assert.equal(await copyTextToClipboard('摘要', { clipboard: null, documentRef: null }), false);
	assert.equal(await copyTextToClipboard('', { clipboard: { writeText() {} } }), false);
});
