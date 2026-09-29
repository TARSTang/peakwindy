import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildAnalysisPoints,
	buildRoute,
	distanceMeters,
	interpolateGreatCircle,
	isValidCoordinate,
	normalizeRoutePointNames,
	renameRoutePointName,
	samplePolyline,
	terrainChartGeometry,
} from '../src/lib/route.js';

test('validates coordinate range and calculates a useful route distance', () => {
	assert.equal(isValidCoordinate({ lat: 27.98, lon: 86.92 }), true);
	assert.equal(isValidCoordinate({ lat: 91, lon: 0 }), false);
	assert.ok(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) > 111_000);
});

test('great-circle interpolation follows the short path across the date line', () => {
	const middle = interpolateGreatCircle({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }, 0.5);
	assert.ok(Math.abs(Math.abs(middle.lon) - 180) < 0.01);
	assert.ok(Math.abs(middle.lat) < 0.01);
});

test('preserves route order and keeps endpoints in terrain samples', () => {
	const route = buildRoute([
		{ lat: 0, lon: 0, name: 'A' },
		{ lat: 0, lon: 0.01, name: 'B' },
		{ lat: 0.01, lon: 0.01, name: 'C' },
	]);
	assert.deepEqual(route.map(point => point.name), ['A', 'B', 'C']);
	const samples = samplePolyline(route, 250);
	assert.ok(samples.length > 2);
	assert.equal(samples[0].distanceM, 0);
	assert.ok(Math.abs(samples.at(-1).distanceM - route.at(-1).distanceM) < 0.001);
});

test('terrain samples include every user waypoint at its exact coordinate', () => {
	const route = [
		{ lat: 0, lon: 0, name: '起点' },
		{ lat: 0, lon: 0.0037, name: '转折点' },
		{ lat: 0.005, lon: 0.006, name: '终点' },
	];
	const built = buildRoute(route);
	const samples = samplePolyline(route, 250);
	const waypoint = built[1];
	const matches = samples.filter(point => Math.abs(point.lat - waypoint.lat) < 1e-10 && Math.abs(point.lon - waypoint.lon) < 1e-10);

	assert.equal(matches.length, 1);
	assert.equal(matches[0].distanceM, waypoint.distanceM);
	assert.ok(samples.every((point, index) => index === 0 || point.distanceM > samples[index - 1].distanceM));
	assert.ok(samples.slice(1).every((point, index) => point.distanceM - samples[index].distanceM <= 250.01));
});

test('route point names follow route order while preserving custom names', () => {
	const points = normalizeRoutePointNames([
		{ id: 'a', lat: 0, lon: 0 },
		{ id: 'b', lat: 0, lon: 1 },
		{ id: 'c', lat: 0, lon: 2 },
		{ id: 'd', lat: 0, lon: 3 },
	]);
	assert.deepEqual(points.map(point => point.name), ['起点', '转折点 1', '转折点 2', '终点']);

	const named = renameRoutePointName(points, 'b', '  一号营地  ');
	assert.equal(named[1].name, '一号营地');
	assert.equal(named[1].nameSource, 'custom');
	const shortened = normalizeRoutePointNames(named.slice(0, 3));
	assert.deepEqual(shortened.map(point => point.name), ['起点', '一号营地', '终点']);
	assert.deepEqual(shortened.map(point => point.id), ['a', 'b', 'c']);

	const reset = renameRoutePointName(shortened, 'b', '   ');
	assert.equal(reset[1].name, '转折点 1');
	assert.equal(reset[1].nameSource, 'automatic');
});

test('analysis samples include both endpoints and retain route waypoints', () => {
	const route = [
		{ lat: 0, lon: 0, name: '起点' },
		{ lat: 0.005, lon: 0.006, name: '转折点' },
		{ lat: 0.01, lon: 0.01, name: '终点' },
	];
	const points = buildAnalysisPoints(route, 5);
	assert.equal(points[0].name, '起点');
	assert.ok(points.some(point => point.name === '转折点'));
	assert.ok(points.some(point => point.name === '终点'));
	assert.throws(() => buildAnalysisPoints(route, 1), /At least two/);
});

test('an explicit waypoint takes priority when an automatic sample lands at the same position', () => {
	const route = [
		{ lat: 0, lon: 0, name: '起点' },
		{ lat: 0, lon: 0.01, name: '用户转折点' },
		{ lat: 0, lon: 0.02, name: '终点' },
	];
	const points = buildAnalysisPoints(route, 3);
	assert.deepEqual(points.map(point => point.name), ['起点', '用户转折点', '终点']);
	assert.equal(points.length, 3);
});

test('terrain profile leaves a gap when elevation data is missing', () => {
	const geometry = terrainChartGeometry([
		{ distanceM: 0, elevationM: 100 },
		{ distanceM: 250, elevationM: null },
		{ distanceM: 500, elevationM: 300 },
	]);
	assert.equal(geometry.line, '');
	assert.equal(geometry.area, '');
	const geometryWithTwoRuns = terrainChartGeometry([
		{ distanceM: 0, elevationM: 100 },
		{ distanceM: 100, elevationM: 200 },
		{ distanceM: 200, elevationM: null },
		{ distanceM: 300, elevationM: 300 },
		{ distanceM: 400, elevationM: 250 },
	]);
	assert.equal((geometryWithTwoRuns.line.match(/M/g) || []).length, 2);
	assert.equal((geometryWithTwoRuns.area.match(/Z/g) || []).length, 2);
	assert.equal(terrainChartGeometry([{ distanceM: 0, elevationM: 1 }]).line, '');
});
