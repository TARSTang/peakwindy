import test from 'node:test';
import assert from 'node:assert/strict';
import { gcj02ToWgs84, parseOviCoordinate, resolveOviCoordinate } from '../src/lib/coordinates.js';

test('parses 奥维 g经度,纬度 coordinates in longitude-first order', () => {
	assert.deepEqual(parseOviCoordinate('g102.07896084,29.72998398'), {
		ok: true,
		lon: 102.07896084,
		lat: 29.72998398,
		coordinateSystem: 'GCJ-02',
	});
	const resolved = resolveOviCoordinate('g102.07896084,29.72998398');
	assert.equal(resolved.ok, true);
	assert.equal(resolved.coordinateSystem, 'GCJ-02');
	assert.match(resolved.source, /已近似转换/);
	assert.notEqual(resolved.lon, 102.07896084);
});

test('infers coordinate handling from the Ovi g prefix without asking for a region', () => {
	const domestic = resolveOviCoordinate('g102.07896084,29.72998398');
	assert.equal(domestic.ok, true);
	assert.equal(domestic.coordinateSystem, 'GCJ-02');
	assert.notEqual(domestic.lon, 102.07896084);
	assert.deepEqual(resolveOviCoordinate('86.9250,27.9881'), {
		ok: true,
		lon: 86.925,
		lat: 27.9881,
		coordinateSystem: 'WGS-84',
		source: '奥维无 g 坐标，按原值传给 Windy',
	});
});

test('converts domestic 奥维 GCJ-02 coordinates and passes overseas unmarked coordinates through', () => {
	const knownGcj = { lon: 116.397590, lat: 39.908776 };
	const converted = gcj02ToWgs84(knownGcj);
	assert.ok(Math.abs(converted.lon - 116.391349) < 0.00001);
	assert.ok(Math.abs(converted.lat - 39.907375) < 0.00001);
	const resolved = resolveOviCoordinate('g116.397590,39.908776');
	assert.equal(resolved.coordinateSystem, 'GCJ-02');
	assert.ok(Math.abs(resolved.lon - 116.391349) < 0.00001);
	assert.deepEqual(resolveOviCoordinate('86.925,27.9881'), {
		ok: true,
		lon: 86.925,
		lat: 27.9881,
		coordinateSystem: 'WGS-84',
		source: '奥维无 g 坐标，按原值传给 Windy',
	});
});

test('rejects malformed coordinates and GCJ-02 coordinates outside the supported region', () => {
	assert.equal(parseOviCoordinate('102.0 29.7').ok, false);
	assert.equal(parseOviCoordinate('g220,29').ok, false);
	assert.match(resolveOviCoordinate('g10,10').error, /不在支持/);
});
