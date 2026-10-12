import test from 'node:test';
import assert from 'node:assert/strict';
import { createSightlinePlan, sightlineHeightAt, sightlineRefinementPoints, assessSightlineTerrain,
  assessSightlineCloudPoint, assessSightlineWeather, sightlineForecastTimes, buildSightlineGeometry } from '../src/lib/sightline.js';
import { runSightlineAnalysis } from '../src/lib/sightline-run.js';

const time = 1_790_000_000_000;
const start = { lat: 30, lon: 102, name: '机位' };
const end = { lat: 30, lon: 102.2, name: '雪山' };
const level = (heightM, cloudPct = 0, relativeHumidityPct = 50, pressureLevelIndex = 0) =>
  ({ heightM, cloudPct, relativeHumidityPct, pressureLevelIndex, temperatureC: 5, windSpeedMs: 3, windDirectionDeg: 90 });
const profile = (levels = [level(1000), level(3000, 0, 50, 1)], timestampMs = time) =>
  ({ ok: true, modelElevationM: 0, timestampsMs: [timestampMs], frames: [{ timestampMs, levels }] });
const sample = (levels, rayHeightM = 2000, extra = {}) =>
  ({ rayHeightM, terrainElevationM: 0, profile: profile(levels), ...extra });
const options = extra => ({ start, end, model: 'ecmwf', step: 3, eyeHeightM: 1.6,
  startGroundM: 2000, targetElevationM: 6000, fetchElevation: async () => 0,
  fetchProfile: async () => profile(), ...extra });

test('chord endpoints, observer offset and unequal heights are exact', () => {
  const plan = createSightlinePlan(start, end, 2000, 7508.9);
  assert.equal(sightlineHeightAt(plan, 0), 2001.6);
  assert.equal(sightlineHeightAt(plan, 1), 7508.9);
  assert.ok(sightlineHeightAt(plan, .5) > 4700 && sightlineHeightAt(plan, .5) < 4800);
  assert.ok(plan.elevationAngleDeg > 0);
  assert.ok(plan.bearingDeg > 89 && plan.bearingDeg < 91);
  assert.deepEqual(plan.terrainPoints[0].lat, start.lat);
  assert.deepEqual(plan.terrainPoints.at(-1).lon, end.lon);
});

test('equal endpoint ray includes spherical curvature without a refraction factor', () => {
  const plan = createSightlinePlan({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, 1000, 1000, 0);
  const expected = (6371008.8 + 1000) * Math.cos(plan.angle / 2) - 6371008.8;
  assert.ok(Math.abs(sightlineHeightAt(plan, .5) - expected) < 1e-7);
  assert.ok(sightlineHeightAt(plan, .5) < 1000);
  assert.equal(sightlineHeightAt(plan, NaN), null);
});

test('bounds and invalid elevations cannot create a favorable plan', () => {
  for (const ground of [null, NaN, -501, 10001]) assert.throws(() => createSightlinePlan(start, end, ground, 5000));
  assert.throws(() => createSightlinePlan(start, start, 1000, 1000));
  assert.throws(() => createSightlinePlan(start, { lat: 40, lon: 102 }, 1000, 1000));
  assert.throws(() => createSightlinePlan(start, end, 1000, 1000, -1));
});

test('long paths cap terrain and weather counts and report actual spacing', () => {
  const plan = createSightlinePlan({ lat: 0, lon: 0 }, { lat: 0, lon: 4 }, 1000, 6000);
  assert.equal(plan.terrainPoints.length, 201);
  assert.equal(plan.weatherPoints.length, 41);
  assert.equal(plan.terrainSpacingM, plan.distanceM / 200);
  assert.ok(plan.weatherSpacingM > 5000);
});

test('terrain distinguishes sampled clearance, ridge blockage, near grazing and missing data', () => {
  const clear = [{ endpoint: true, elevationM: 6000, rayHeightM: 6000 }, { elevationM: 100, rayHeightM: 1000 }];
  assert.equal(assessSightlineTerrain(clear).status, 'sampled-clear');
  assert.equal(assessSightlineTerrain([{ elevationM: 1100, rayHeightM: 1000 }]).status, 'blocked');
  assert.equal(assessSightlineTerrain([{ elevationM: 990, rayHeightM: 1000 }]).status, 'sensitive');
  assert.equal(assessSightlineTerrain([...clear, { elevationM: null, rayHeightM: 1000 }]).status, 'unknown');
  assert.equal(assessSightlineTerrain([]).status, 'unknown');
  assert.equal(assessSightlineTerrain([{ elevationM: 1200, rayHeightM: 1000 }, { elevationM: null }]).status, 'blocked');
});

test('near grazing refinement is bounded and avoids bridging missing ground', () => {
  const plan = createSightlinePlan(start, end, 0, 0, 0);
  const points = plan.terrainPoints.map(point => ({ ...point, elevationM: 0 }));
  const refined = sightlineRefinementPoints(plan, points);
  assert.ok(refined.length > 0 && refined.length <= 48);
  assert.ok(refined.every(point => point.fraction > 0 && point.fraction < 1));
  assert.equal(sightlineRefinementPoints(plan, points.map(point => ({ ...point, elevationM: null }))).length, 0);
});

test('cloud intersection has raw or adjacent layer evidence and zero is preserved', () => {
  const cloudy = assessSightlineCloudPoint(sample([level(1000, 20), level(3000, 80, 50, 1)]), time);
  assert.equal(cloudy.status, 'cloud-signal');
  assert.equal(cloudy.weather.cloudPct, 50);
  assert.equal(cloudy.relation, 'intersects');
  assert.equal(assessSightlineCloudPoint(sample([level(1000), level(3000, 0, 50, 1)]), time).status, 'sampled-clear');
});

test('cloud bands above and below a zero-cloud ray remain separate', () => {
  const levels = [level(1000, 80), level(2000, 0, 50, 1), level(3000, 0, 50, 2), level(4000, 0, 50, 3)];
  assert.equal(assessSightlineCloudPoint(sample(levels, 3000), time).relation, 'below');
  const above = [level(1000), level(2000, 0, 50, 1), level(3000, 0, 50, 2), level(4000, 80, 50, 3)];
  assert.equal(assessSightlineCloudPoint(sample(above, 2000), time).relation, 'above');
});

test('high humidity conflicts with zero cloud and is never treated as direct cloud', () => {
  const result = assessSightlineCloudPoint(sample([level(1000, 0, 95), level(3000, 0, 96, 1)]), time);
  assert.equal(result.status, 'humidity-signal');
  assert.equal(result.weather.cloudPct, 0);
  assert.match(result.reason, /不一致/);
});

test('missing vertical layers, times and underground rays do not become clear', () => {
  const missing = sample([level(1000, null), level(3000, null, 50, 1)]);
  assert.equal(assessSightlineCloudPoint(missing, time).status, 'unknown');
  assert.equal(assessSightlineCloudPoint(sample([level(1000), level(3000, 0, 50, 1)]), time + 3600000).status, 'unknown');
  const underground = sample([level(1000, 80, 95), level(3000, 80, 95, 1)], 2000, { terrainElevationM: 2500 });
  assert.equal(assessSightlineCloudPoint(underground, time).status, 'unknown');
  assert.equal(assessSightlineCloudPoint(sample([level(1000), level(3000, 0, 50, 2)]), time).status, 'unknown');
});

test('isolated cloud band estimate is labeled separately from unavailable ray cloud', () => {
  const result = assessSightlineCloudPoint(sample([level(2000, 80)], 2100), time);
  assert.equal(result.weather.cloudPct, null);
  assert.equal(result.status, 'cloud-band-signal');
  assert.equal(result.relation, 'estimated-intersection');
});

test('partial weather coverage preserves unknowns and never mixes different times', () => {
  const a = sample([level(1000), level(3000, 0, 50, 1)]);
  const b = { ...a, profile: profile(a.profile.frames[0].levels, time + 10800000) };
  assert.deepEqual(sightlineForecastTimes([a, b]), [time, time + 10800000]);
  const result = assessSightlineWeather([a, b], time);
  assert.equal(result.status, 'unknown');
  assert.equal(result.directCount, 1);
  assert.equal(result.unknownCount, 1);
});

test('zero cloud without either terrain source stays unknown', () => {
  const point = sample([level(1000), level(3000, 0, 50, 1)], 2000, { terrainElevationM: null });
  point.profile.modelElevationM = null;
  assert.equal(assessSightlineCloudPoint(point, time).status, 'unknown');
});

test('plot breaks terrain across missing samples and keeps narrow weather columns', () => {
  const plan = createSightlinePlan(start, end, 2000, 6000);
  const terrain = plan.terrainPoints.map((point, index) => ({ ...point, elevationM: index === 2 ? null : 1000 }));
  const weather = plan.weatherPoints.map(point => ({ ...point, profile: profile() }));
  const geometry = buildSightlineGeometry(plan, terrain, weather, time, 390);
  assert.equal(geometry.distanceTicks.length, 2);
  assert.equal((geometry.terrainPath.match(/M/g) || []).length, 2);
  assert.equal((geometry.rayPath.match(/M/g) || []).length, 1);
  assert.ok(geometry.cells.every(cell => cell.width < 36));
  assert.ok(!geometry.rayPath.includes('NaN'));
  const tall = buildSightlineGeometry(plan, [{ ...plan.terrainPoints[1], elevationM: 9700 }], weather, time, 1000, 300);
  assert.ok(tall.maxHeightM > 9700);
  assert.equal(tall.height, 300);
});

test('long low ray is visible below MSL and corrected summit does not raise interior ground', async () => {
  const plan = createSightlinePlan({ lat: 0, lon: 0 }, { lat: 0, lon: 4 }, 0, 0, 0);
  const geometry = buildSightlineGeometry(plan, [], plan.weatherPoints, time);
  assert.ok(geometry.minHeightM < 0);
  const state = await runSightlineAnalysis(options({ targetElevationM: 7508.9 }), () => {}, new AbortController().signal);
  assert.equal(state.terrain.at(-1).elevationM, 7508.9);
  assert.ok(state.terrain.filter(point => !point.endpoint).every(point => point.elevationM === 0));
});

test('orchestration caps concurrent work at three and reuses corrected endpoints', async () => {
  let active = 0, maximum = 0, endpointCalls = 0;
  const fetchElevation = async point => {
    if (point.lat === start.lat && (point.lon === start.lon || point.lon === end.lon)) endpointCalls++;
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--; return 0;
  };
  const state = await runSightlineAnalysis(options({ fetchElevation }), () => {}, new AbortController().signal);
  assert.equal(state.phase, 'complete');
  assert.equal(maximum, 3);
  assert.equal(endpointCalls, 0);
  assert.ok(state.weather.every(point => point.profile?.ok));
});

test('cancellation retains completed terrain and planned unknown weather without accepting late results', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const state = await runSightlineAnalysis(options(), snapshot => {
    if (!cancelled && snapshot.phase === 'terrain' && snapshot.completed >= 4) { cancelled = true; controller.abort(); }
  }, controller.signal);
  assert.equal(state.cancelled, true);
  assert.equal(state.phase, 'stopped');
  assert.ok(state.terrain.some(point => Number.isFinite(point.elevationM)));
  assert.ok(state.terrain.some(point => point.elevationM === null));
  assert.equal(assessSightlineWeather(state.weather, time).status, 'unknown');
});

test('rate limiting stops queued weather while completed evidence remains', async () => {
  let requests = 0;
  const state = await runSightlineAnalysis(options({ fetchProfile: async () => {
    requests++; throw new Error('429 Too many requests');
  } }), () => {}, new AbortController().signal);
  assert.equal(state.rateLimited, true);
  assert.equal(state.phase, 'stopped');
  assert.ok(requests <= 3);
  assert.equal(assessSightlineWeather(state.weather, time).status, 'unknown');
});

test('explicit wrong model and failed profiles remain unknown', async () => {
  const wrong = { ...profile(), servedModelSource: 'response', servedModel: 'icon' };
  const state = await runSightlineAnalysis(options({ fetchProfile: async () => wrong }), () => {}, new AbortController().signal);
  assert.ok(state.weather.every(point => point.profile === null));
  assert.match(state.weather[0].error, /模式/);
  assert.equal(assessSightlineWeather(state.weather, time).status, 'unknown');
  const failed = await runSightlineAnalysis(options({ fetchProfile: async () => ({ ok: false, error: '缺测' }) }), () => {}, new AbortController().signal);
  assert.equal(assessSightlineWeather(failed.weather, time).status, 'unknown');
});
