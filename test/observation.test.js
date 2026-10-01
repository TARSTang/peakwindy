import test from 'node:test';
import assert from 'node:assert/strict';
import {
	directPath,
	terrainSight,
	rayHeight,
	mountainGrid,
	mountainSectors,
	destination,
	bearing,
} from '../src/lib/observation-geometry.js';
import { cloudAtRay, timeBracket } from '../src/lib/observation-weather.js';
import { createObservationRunner } from '../src/lib/observation-runner.js';

const camera = { lat: 30, lon: 102 },
	peak = destination(camera, 90, 10000);
const frame = (timestampMs, cloud = 0, rh = 60) => ({
	timestampMs,
	levels: [
		{
			heightM: 1000,
			cloudPct: cloud,
			relativeHumidityPct: rh,
			temperatureC: 10,
			windSpeedMs: 3,
			windDirectionDeg: 90,
			pressureLevelIndex: 0,
		},
		{
			heightM: 2000,
			cloudPct: cloud,
			relativeHumidityPct: rh,
			temperatureC: 0,
			windSpeedMs: 5,
			windDirectionDeg: 90,
			pressureLevelIndex: 1,
		},
	],
});
const profile = { frames: [frame(1000000), frame(4600000, 30, 95)] };

test('direct path stays on great circle, reports capped terrain spacing', () => {
	const p = directPath(camera, destination(camera, 90, 150000));
	assert.equal(p.length, 81);
	assert.ok(p[1].distanceM > 250);
	assert.ok(Math.abs(bearing(camera, peak) - 90) < 0.01);
});
test('flat high line clear; one ridge blocked; missing and grazing terrain unknown', () => {
	const path = directPath(camera, peak).map((p) => ({ ...p, elevationM: 100 }));
	assert.equal(terrainSight(path, 1000, 1000).status, 'clear');
	path[10].elevationM = 1500;
	assert.equal(terrainSight(path, 1000, 1000).status, 'blocked');
	path[10].elevationM = null;
	assert.equal(terrainSight(path, 1000, 1000).status, 'unknown');
	assert.equal(
		terrainSight(
			path.map((p) => ({ ...p, elevationM: 1000 })),
			1000,
			1000,
		).status,
		'unknown',
	);
});
test('geometric curvature can block a long horizontal line without refraction', () => {
	assert.ok(rayHeight(100, 100, 50000, 100000) < 0);
	const path = directPath(camera, destination(camera, 90, 100000)).map((p) => ({
		...p,
		elevationM: 0,
	}));
	assert.equal(terrainSight(path, 100, 100).status, 'blocked');
});
test('mountain partitions preserve missing terrain and can face away from observer', () => {
	const grid = mountainGrid(peak);
	assert.equal(grid.length, 81);
	assert.ok(
		mountainSectors(grid, camera, 100).every((s) => s.status === 'unknown'),
	);
	const filled = grid.map((p) => ({ ...p, elevationM: 2000 - p.eastM }));
	const sectors = mountainSectors(filled, camera, 100);
	assert.equal(sectors.length, 9);
	assert.ok(sectors.some((s) => s.facing === false));
});
test('time bracket takes conservative two-side cloud and RH; never fills gaps', () => {
	const value = cloudAtRay(profile, 2800000, 1500);
	assert.equal(value.cloudPct, 30);
	assert.equal(value.humidityPct, 95);
	assert.equal(value.status, 'blocked');
	assert.equal(timeBracket(profile, 0).ok, false);
	assert.equal(
		timeBracket({ frames: [frame(1), frame(14400001)] }, 7200001).ok,
		false,
	);
});
test('zero cloud is distinct from missing; RH cloud inference is separate', () => {
	assert.equal(cloudAtRay(profile, 1000000, 1500).status, 'clear');
	assert.equal(
		cloudAtRay({ frames: [frame(1, null, 95)] }, 1, 1500).status,
		'possible',
	);
	assert.equal(
		cloudAtRay({ frames: [frame(1, null, 50)] }, 1, 1500).status,
		'unknown',
	);
	assert.equal(cloudAtRay(profile, 1000000, 3000).status, 'unknown');
	const gap = frame(1);
	gap.levels[1].pressureLevelIndex = 3;
	assert.equal(cloudAtRay({ frames: [gap] }, 1, 1500).status, 'unknown');
});
test('cloud below, above, and intersection are distinguishable in evidence', () => {
	const p = { frames: [frame(1, 50, 80)] };
	assert.ok(
		cloudAtRay(p, 1, 1500).relations.some((v) => v.relation === 'above'),
	);
	assert.ok(
		cloudAtRay(p, 1, 1500).relations.some((v) => v.relation === 'below'),
	);
	assert.ok(
		cloudAtRay(p, 1, 1000).relations.some((v) => v.relation === 'intersects'),
	);
});
test('runner peak correction affects only summit, unavailable weather remains unknown', async () => {
	const runner = createObservationRunner({
		elevation: async () => 1000,
		weather: async () => ({ frames: [] }),
	});
	const r = await runner.analyze({
		camera,
		peak: { ...peak, actualM: 5000 },
		eyeM: 1.6,
		radiusM: 2000,
		model: 'ecmwf',
		date: '2026-09-30',
		timestampMs: 1,
	});
	assert.equal(r.grid[40].elevationM, 5000);
	assert.equal(r.grid[39].elevationM, 1000);
	assert.equal(r.cloud.status, 'unknown');
	assert.ok(r.sectors.every((s) => s.cloud?.status !== 'clear'));
});
test('cancellation prevents old responses publishing and retains finished evidence', async () => {
	let releases = [],
		updates = [];
	const runner = createObservationRunner({
		elevation: () => new Promise((resolve) => releases.push(resolve)),
		weather: async () => ({ frames: [] }),
		onProgress: (r) => updates.push(r),
	});
	const task = runner.analyze({
		camera,
		peak,
		eyeM: 1.6,
		radiusM: 2000,
		model: 'ecmwf',
		date: '2026-09-30',
		timestampMs: 1,
	});
	await Promise.resolve();
	runner.cancel();
	const count = updates.length;
	releases.forEach((resolve) => resolve(1000));
	const r = await task;
	assert.equal(r.stage, 'cancelled');
	assert.equal(updates.length, count);
	assert.equal(r.camera.elevationM, undefined);
});
test('new model run refuses old responses even when the provider ignores abort', async () => {
	let slow = true,
		releases = [],
		models = [];
	const runner = createObservationRunner({
		elevation: () =>
			slow
				? new Promise((resolve) => releases.push(resolve))
				: Promise.resolve(1000),
		weather: async () => ({ frames: [] }),
		onProgress: (r) => models.push(r.config.model),
	});
	const first = runner.analyze({
		camera,
		peak,
		eyeM: 1.6,
		radiusM: 2000,
		model: 'ecmwf',
		date: '2026-09-30',
		timestampMs: 1,
	});
	await Promise.resolve();
	slow = false;
	const second = await runner.analyze({
		camera,
		peak,
		eyeM: 1.6,
		radiusM: 2000,
		model: 'icon',
		date: '2026-10-01',
		timestampMs: 2,
	});
	const count = models.length;
	releases.forEach((resolve) => resolve(5000));
	await first;
	assert.equal(second.config.model, 'icon');
	assert.equal(second.camera.elevationM, 1000);
	assert.equal(models.length, count);
	assert.equal(models.at(-1), 'icon');
});
test('cancelling mid-terrain retains the already read direct-path samples as unknown evidence', async () => {
	const runner = createObservationRunner({
		elevation: async () => 1000,
		weather: async () => ({ frames: [] }),
		onProgress: (r) => {
			if (r.completed === 84) runner.cancel();
		},
	});
	const r = await runner.analyze({
		camera,
		peak,
		eyeM: 1.6,
		radiusM: 2000,
		model: 'ecmwf',
		date: '2026-09-30',
		timestampMs: 1,
	});
	assert.equal(r.stage, 'cancelled');
	assert.equal(r.sight.status, 'unknown');
	assert.ok(r.sight.path.some((p) => Number.isFinite(p.elevationM)));
	assert.ok(r.sight.path.some((p) => p.elevationM === null));
});
