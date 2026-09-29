import test from 'node:test';
import assert from 'node:assert/strict';
import {
	distanceToDisplay,
	heightFromDisplay,
	heightToDisplay,
	parseAltitudeList,
	precipitationToDisplay,
	temperatureFromDisplay,
	temperatureToDisplay,
	windFromDisplay,
	windToDisplay,
} from '../src/lib/units.js';

test('converts metric heights to feet and back without changing stored metres', () => {
	assert.equal(heightToDisplay(1_000, 'metric'), 1_000);
	assert.equal(heightToDisplay(1_000, 'imperial'), 1_000 / 0.3048);
	assert.equal(heightFromDisplay(heightToDisplay(8_848, 'imperial'), 'imperial'), 8_848);
	assert.equal(heightToDisplay(Number.NaN, 'imperial'), null);
});

test('parses ordered multi-height input with common separators and explicit units', () => {
	assert.deepEqual(parseAltitudeList('3666, 4900米；5000ft\n5100', 'metric').heightsM,
		[3666, 4900, 1524, 5100]);
	const imperial = parseAltitudeList('10000, 3000m, 9000英尺', 'imperial').heightsM;
	assert.deepEqual(imperial.slice(0, 2), [3048, 3000]);
	assert.ok(Math.abs(imperial[2] - 2743.2) < 1e-9);
	assert.deepEqual(parseAltitudeList('', 'metric'), { ok: true, heightsM: [], error: '' });
});

test('rejects malformed, out-of-range, and over-limit altitude lists without dropping items', () => {
	assert.equal(parseAltitudeList('3666, nope, 4900').error, '第 2 项不是有效高度：nope');
	assert.match(parseAltitudeList('20001', 'metric').error, /超出 0–20000 米范围/);
	assert.match(parseAltitudeList('-1', 'metric').error, /超出 0–20000 米范围/);
	const oversized = parseAltitudeList(Array(3).fill('100').join(','), 'metric', 2);
	assert.equal(oversized.ok, false);
	assert.match(oversized.error, /未删减任何项目/);
});

test('converts temperature, wind, distance, and precipitation to common imperial units', () => {
	assert.equal(temperatureToDisplay(0, 'imperial'), 32);
	assert.equal(temperatureToDisplay(-40, 'imperial'), -40);
	assert.equal(temperatureFromDisplay(32, 'imperial'), 0);
	assert.equal(temperatureFromDisplay(-4, 'imperial'), -20);
	assert.equal(windToDisplay(1, 'imperial'), 2.2369362920544);
	assert.ok(Math.abs(windFromDisplay(10, 'imperial') - 4.4704) < 1e-10);
	assert.equal(temperatureFromDisplay(12, 'metric'), 12);
	assert.equal(windFromDisplay(12, 'metric'), 12);
	assert.equal(distanceToDisplay(1_609.344, 'imperial'), 1);
	assert.equal(precipitationToDisplay(25.4, 'imperial'), 1);
});
