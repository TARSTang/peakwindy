import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationRunner } from '../src/lib/observation-runner.js';
import { coarseHorizon, solarPosition } from '../src/lib/observation-solar.js';
import { destination, mountainGrid } from '../src/lib/observation-geometry.js';
const peak = { lat: 30, lon: 102, elevationM: 6000 };
const timestampMs = Date.parse('2026-09-30T00:30:00Z');
const config = {
	camera: destination(peak, 270, 10000),
	peak,
	eyeM: 1.6,
	radiusM: 2000,
	model: 'ecmwf',
	date: '2026-09-30',
	timestampMs,
};
const window = {
	id: 'morning',
	startMs: timestampMs,
	endMs: timestampMs + 120000,
	sectorIds: [0],
	kind: 'morning',
};
const previous = {
	config,
	grid: [],
	sectors: [{ id: 0, normal: [0, 0, 1], representative: peak }],
	windows: [window],
	solarPaths: [],
	unknowns: [],
};
function weather(p) {
	return {
		frames: [
			{
				timestampMs: p.timestampMs,
				levels: [
					{
						heightM: 1000,
						cloudPct: 0,
						relativeHumidityPct: 40,
						pressureLevelIndex: 0,
					},
					{
						heightM: 100000,
						cloudPct: 0,
						relativeHumidityPct: 40,
						pressureLevelIndex: 1,
					},
				],
			},
		],
	};
}
test('on-demand solar stage checks start/middle/end and at most nine weather points per ray', async () => {
	const runner = createObservationRunner({
		elevation: async () => 1000,
		weather: async (p) => weather(p),
	});
	const r = await runner.analyzeSolar(config, previous, window);
	assert.equal(r.solarPaths.length, 3);
	assert.ok(
		r.solarPaths.every(
			(p) =>
				p.weatherPoints.length === 9 && p.points.at(-1).distanceM === 250000,
		),
	);
	assert.ok(r.solarPaths.every((p) => p.status === 'unknown'));
	assert.equal(previous.solarPaths.length, 0);
});
test('solar direction ridge produces explicit blocked evidence', async () => {
	const runner = createObservationRunner({
		elevation: async (p) => (p.distanceM === 1000 ? 10000 : 1000),
		weather: async (p) => weather(p),
	});
	const r = await runner.analyzeSolar(config, previous, window);
	assert.ok(
		r.solarPaths.every((p) => p.terrainBlocked && p.status === 'blocked'),
	);
	assert.equal(r.windows[0].status, 'blocked');
});
test('rate limit and missing upper layers do not become clear solar paths', async () => {
	const runner = createObservationRunner({
		elevation: async () => null,
		weather: async () => {
			throw Object.assign(new Error('429'), { status: 429 });
		},
	});
	const r = await runner.analyzeSolar(config, previous, window);
	assert.equal(r.stage, 'rate-limited');
	assert.ok(r.solarPaths.every((p) => p.status === 'unknown'));
	assert.ok(
		r.solarPaths[0].weatherPoints.some((p) => p.cloud?.reason === 'Windy 限流'),
	);
	assert.ok(
		r.solarPaths[0].weatherPoints.every((p) => p.cloud?.status !== 'clear'),
	);
});
test('coarse horizon constrains only sampled directions and accounts for curvature', () => {
	const grid = mountainGrid(peak).map((p) => ({ ...p, elevationM: 6000 }));
	const east = destination(peak, 90, 1000);
	grid.push({ ...east, eastM: 1000, northM: 0, elevationM: 9000 });
	assert.ok(coarseHorizon(peak, grid, 90).angleDeg > 60);
	const sun = solarPosition(timestampMs, peak);
	assert.ok(sun.geometricAltitudeDeg < sun.apparentAltitudeDeg);
});
