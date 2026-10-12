import { distanceMeters, interpolateGreatCircle, isValidCoordinate } from './route.js';
import { buildCrossSectionGeometry, directCloudLayerBands, frameAtTimestamp, humidityCloudBands, interpolateAtHeight } from './profile.js';

const EARTH_RADIUS_M = 6_371_008.8;
const rad = value => value * Math.PI / 180;
const finiteHeight = value => Number.isFinite(value) && value >= -500 && value <= 10_000;

export function createSightlinePlan(start, end, startGroundM, targetElevationM, eyeHeightM = 1.6) {
	if (!isValidCoordinate(start) || !isValidCoordinate(end)) throw new Error('两端坐标无效');
	if (!finiteHeight(startGroundM) || !finiteHeight(targetElevationM)) throw new Error('两端海拔资料不足或超出 −500～10000 米范围，请校正海拔');
	if (!Number.isFinite(eyeHeightM) || eyeHeightM < 0 || eyeHeightM > 100) throw new Error('视点离地高度须在 0～100 米范围');
	const distanceM = distanceMeters(start, end);
	if (distanceM < 10 || distanceM > 500_000) throw new Error('两点视线支持 10 米～500 千米距离，请检查坐标和两端顺序');
	const observerElevationM = startGroundM + eyeHeightM;
	const angle = distanceM / EARTH_RADIUS_M;
	const lat1 = rad(start.lat), lat2 = rad(end.lat), deltaLon = rad(end.lon - start.lon);
	const bearingDeg = (Math.atan2(Math.sin(deltaLon) * Math.cos(lat2),
		Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)) * 180 / Math.PI + 360) % 360;
	const observerRadius = EARTH_RADIUS_M + observerElevationM;
	const targetRadius = EARTH_RADIUS_M + targetElevationM;
	const elevationAngleDeg = Math.atan2(targetRadius * Math.cos(angle) - observerRadius, targetRadius * Math.sin(angle)) * 180 / Math.PI;
	const terrainIntervals = Math.min(200, Math.max(2, Math.ceil(distanceM / 500)));
	const weatherIntervals = Math.min(40, Math.max(1, Math.ceil(distanceM / 5_000)));
	const plan = { start: { ...start }, end: { ...end }, startGroundM, targetElevationM, observerElevationM,
		eyeHeightM, distanceM, angle, bearingDeg, elevationAngleDeg,
		terrainSpacingM: distanceM / terrainIntervals, weatherSpacingM: distanceM / weatherIntervals };
	return { ...plan, terrainPoints: sampleSightline(plan, terrainIntervals), weatherPoints: sampleSightline(plan, weatherIntervals) };
}

// Straight chord between two elevated endpoints on a spherical Earth. The
// radius at each great-circle position is its intersection with that chord.
// This is geometric curvature, with no assumed atmospheric refraction.
export function sightlineHeightAt(plan, fraction) {
	if (!plan || !Number.isFinite(fraction)) return null;
	const t = Math.max(0, Math.min(1, fraction));
	if (t === 0) return plan.observerElevationM;
	if (t === 1) return plan.targetElevationM;
	const a = EARTH_RADIUS_M + plan.observerElevationM;
	const b = EARTH_RADIUS_M + plan.targetElevationM;
	const theta = plan.distanceM / EARTH_RADIUS_M;
	return a * b * Math.sin(theta) / (b * Math.sin(theta * (1 - t)) + a * Math.sin(theta * t)) - EARTH_RADIUS_M;
}

export function sightlinePointAt(plan, fraction) {
	return { ...interpolateGreatCircle(plan.start, plan.end, fraction), fraction, distanceM: plan.distanceM * fraction,
		rayHeightM: sightlineHeightAt(plan, fraction), endpoint: fraction === 0 || fraction === 1 };
}

function sampleSightline(plan, intervals) {
	return Array.from({ length: intervals + 1 }, (_, index) => sightlinePointAt(plan, index / intervals));
}

export function assessSightlineTerrain(points, sensitivityM = 30) {
	const interior = (points ?? []).filter(point => !point.endpoint);
	const valid = interior.filter(point => Number.isFinite(point.elevationM) && Number.isFinite(point.rayHeightM))
		.map(point => ({ ...point, clearanceM: point.rayHeightM - point.elevationM }));
	const blockers = valid.filter(point => point.clearanceM < -sensitivityM).sort((a, b) => a.clearanceM - b.clearanceM);
	const sensitive = valid.filter(point => Math.abs(point.clearanceM) <= sensitivityM);
	const missingCount = interior.length - valid.length;
	return { status: blockers.length ? 'blocked' : missingCount || !valid.length ? 'unknown' : sensitive.length ? 'sensitive' : 'sampled-clear',
		blockers, sensitive, missingCount, validCount: valid.length, totalCount: interior.length,
		minimum: valid.reduce((worst, point) => !worst || point.clearanceM < worst.clearanceM ? point : worst, null),
		sensitivityM };
}

export function sightlineRefinementPoints(plan, terrainPoints, maxIntervals = 12) {
	const ordered = [...terrainPoints].sort((a, b) => a.distanceM - b.distanceM);
	const candidates = [];
	for (let index = 1; index < ordered.length; index++) {
		const a = ordered[index - 1], b = ordered[index];
		if (!Number.isFinite(a.elevationM) || !Number.isFinite(b.elevationM) || b.distanceM - a.distanceM <= 125) continue;
		const clearance = Math.min(a.rayHeightM - a.elevationM, b.rayHeightM - b.elevationM);
		if (clearance <= 150) candidates.push({ a, b, clearance });
	}
	return candidates.sort((a, b) => a.clearance - b.clearance).slice(0, maxIntervals)
		.flatMap(({ a, b }) => [0.2, 0.4, 0.6, 0.8].map(t => sightlinePointAt(plan, a.fraction + (b.fraction - a.fraction) * t)));
}

export function sightlineForecastTimes(samples) {
	return [...new Set((samples ?? []).filter(sample => sample.profile?.ok)
		.flatMap(sample => sample.profile.timestampsMs ?? []).filter(Number.isFinite))].sort((a, b) => a - b);
}

export function assessSightlineCloudPoint(sample, timestampMs) {
	const frame = sample.profile?.ok ? frameAtTimestamp(sample.profile.frames, timestampMs) : null;
	const terrainM = Number.isFinite(sample.terrainElevationM) ? sample.terrainElevationM
		: Number.isFinite(sample.profile?.modelElevationM) ? sample.profile.modelElevationM : null;
	const weather = interpolateAtHeight(frame, sample.rayHeightM, terrainM);
	const bands = directCloudLayerBands(frame, terrainM);
	const inEstimatedCloudBand = bands.some(band => band.lowHeightM <= sample.rayHeightM && band.highHeightM >= sample.rayHeightM);
	const humidityBands = humidityCloudBands(frame, terrainM, 12_000);
	const inHumidityBand = humidityBands.some(band => band.lowHeightM <= sample.rayHeightM && band.highHeightM >= sample.rayHeightM);
	const humid = Number.isFinite(weather.humidityPct) && weather.humidityPct >= 90;
	const direct = Number.isFinite(weather.cloudPct);
	let status = 'unknown', relation = 'unknown', reason = sample.error || '视线高度缺少相邻有效云量层；未采样路段不能判为无云';
	if (!frame) reason = sample.error || '该点没有当前时次的预报';
	else if (weather.reason === 'below-terrain') reason = '视线位于地形以下，不能使用地下模式层判断云';
	else if (direct && weather.cloudPct > 0) {
		status = 'cloud-signal'; relation = 'intersects'; reason = `视线高度的模式云量 ${Math.round(weather.cloudPct)}%，存在穿云信号，不代表遮挡概率`;
	} else if (frame && weather.reason !== 'below-terrain' && !direct && inEstimatedCloudBand) {
		status = 'cloud-band-signal'; relation = 'estimated-intersection';
		reason = '视线可能与模式云带相交；云带边界是层间估算，视线高度云量仍缺测';
	} else if (frame && weather.reason !== 'below-terrain' && (humid || inHumidityBand)) {
		status = 'humidity-signal'; relation = 'possible-intersection';
		reason = direct ? '视线云量为 0%，但高湿信号存在；资料信号不一致' : '视线附近存在高湿可能云区；不是直接云层观测';
	} else if (direct && weather.cloudPct === 0) {
		if (terrainM === null) reason = '视线层云量为 0%，但地形缺测，无法确认是否为地形以上的有效层';
		else { status = 'sampled-clear'; relation = 'no-signal'; reason = '当前采样点的视线层云量为 0%；不保证点间或实况无云'; }
	}
	if (relation === 'no-signal' && bands.length) {
		if (bands.every(band => band.highHeightM < sample.rayHeightM)) relation = 'below';
		else if (bands.every(band => band.lowHeightM > sample.rayHeightM)) relation = 'above';
		else relation = 'separate-bands';
	}
	return { ...sample, status, relation, reason, weather, frame, terrainM, bands, humidityBands };
}

export function assessSightlineWeather(samples, timestampMs) {
	const points = (samples ?? []).map(sample => assessSightlineCloudPoint(sample, timestampMs));
	const directCount = points.filter(point => Number.isFinite(point.weather.cloudPct)).length;
	const cloudSignals = points.filter(point => point.status === 'cloud-signal' || point.status === 'cloud-band-signal');
	const humiditySignals = points.filter(point => point.status === 'humidity-signal');
	const unknownCount = points.filter(point => point.status === 'unknown').length;
	return { points, directCount, cloudSignals, humiditySignals, unknownCount, totalCount: points.length,
		status: cloudSignals.length ? 'cloud-signal' : humiditySignals.length ? 'humidity-signal'
			: unknownCount || !points.length ? 'unknown' : 'sampled-clear' };
}

export function buildSightlineGeometry(plan, terrain, weather, timestampMs, width = 1000, height = 520) {
	if (!plan) return null;
	const rayPoints = sampleSightline(plan, 80);
	const minHeightM = Math.floor(Math.min(0, ...rayPoints.map(point => point.rayHeightM)) / 1000) * 1000;
	const maxHeightM = Math.ceil(Math.max(9000, plan.observerElevationM + 500, plan.targetElevationM + 500,
		...terrain.filter(point => Number.isFinite(point.elevationM)).map(point => point.elevationM + 200)) / 1000) * 1000;
	const base = buildCrossSectionGeometry(weather, timestampMs, 'cloud', maxHeightM, Math.max(360, width), height, 'samples');
	const y = value => base.plot.bottom - (value - minHeightM) / (maxHeightM - minHeightM) * (base.plot.bottom - base.plot.top);
	const path = points => points.map((point, index) => `${index ? 'L' : 'M'}${base.x(point.distanceM).toFixed(2)},${y(point.elevationM ?? point.rayHeightM).toFixed(2)}`).join(' ');
	const terrainSegments = [];
	let segment = [];
	for (const point of [...terrain].sort((a, b) => a.distanceM - b.distanceM)) {
		if (Number.isFinite(point.elevationM)) segment.push(point);
		else if (segment.length) { terrainSegments.push(segment); segment = []; }
	}
	if (segment.length) terrainSegments.push(segment);
	return { ...base, y, minHeightM, maxHeightM, rayPath: path(rayPoints),
		terrainPath: terrainSegments.filter(points => points.length > 1).map(path).join(' '),
		terrainArea: terrainSegments.filter(points => points.length > 1).map(points => `${path(points)} L${base.x(points.at(-1).distanceM)},${base.plot.bottom} L${base.x(points[0].distanceM)},${base.plot.bottom} Z`).join(' '),
		cells: base.cells.map(cell => Number.isFinite(cell.highHeightM) ? { ...cell, y: y(cell.highHeightM), height: y(cell.lowHeightM) - y(cell.highHeightM) } : { ...cell, y: base.plot.top, height: base.plot.bottom - base.plot.top }),
		possibleCloudBands: base.possibleCloudBands.map(band => ({ ...band, y: y(Math.min(maxHeightM, band.band.highHeightM)), height: y(Math.max(minHeightM, band.band.lowHeightM)) - y(Math.min(maxHeightM, band.band.highHeightM)) })),
		altitudeTicks: Array.from({ length: 5 }, (_, index) => minHeightM + (maxHeightM - minHeightM) * index / 4),
		distanceTicks: width < 600 ? [0, plan.distanceM] : [0, plan.distanceM / 4, plan.distanceM / 2, plan.distanceM * 0.75, plan.distanceM] };
}
