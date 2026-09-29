const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = degrees => degrees * Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function isValidCoordinate(point) {
	return Number.isFinite(point?.lat)
		&& Number.isFinite(point?.lon)
		&& point.lat >= -90 && point.lat <= 90
		&& point.lon >= -180 && point.lon <= 180;
}

function defaultRoutePointName(index, count) {
	if (index === 0) return '起点';
	if (index === count - 1) return '终点';
	return `转折点 ${index}`;
}

export function normalizeRoutePointNames(points) {
	if (!Array.isArray(points)) throw new TypeError('Route points must be an array');
	return points.map((point, index) => {
		const customName = point?.nameSource === 'custom' && typeof point.name === 'string'
			? point.name.replace(/\s+/gu, ' ').trim().slice(0, 32)
			: '';
		return {
			...point,
			name: customName || defaultRoutePointName(index, points.length),
			nameSource: customName ? 'custom' : 'automatic',
		};
	});
}

export function renameRoutePointName(points, id, value) {
	const name = String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, 32);
	return normalizeRoutePointNames(points.map(point => point?.id === id
		? { ...point, name, nameSource: name ? 'custom' : 'automatic' }
		: point));
}

export function distanceMeters(a, b) {
	if (!isValidCoordinate(a) || !isValidCoordinate(b)) return NaN;
	const lat1 = toRadians(a.lat);
	const lat2 = toRadians(b.lat);
	const deltaLat = lat2 - lat1;
	const deltaLon = toRadians(b.lon - a.lon);
	const h = Math.sin(deltaLat / 2) ** 2
		+ Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}

export function interpolateGreatCircle(a, b, fraction) {
	if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;
	const f = clamp(fraction, 0, 1);
	const lat1 = toRadians(a.lat);
	const lon1 = toRadians(a.lon);
	const lat2 = toRadians(b.lat);
	const lon2 = toRadians(b.lon);
	const delta = distanceMeters(a, b) / EARTH_RADIUS_M;
	if (!Number.isFinite(delta) || delta < 1e-12) {
		return { lat: a.lat, lon: a.lon };
	}
	const sinDelta = Math.sin(delta);
	const weightA = Math.sin((1 - f) * delta) / sinDelta;
	const weightB = Math.sin(f * delta) / sinDelta;
	const x = weightA * Math.cos(lat1) * Math.cos(lon1) + weightB * Math.cos(lat2) * Math.cos(lon2);
	const y = weightA * Math.cos(lat1) * Math.sin(lon1) + weightB * Math.cos(lat2) * Math.sin(lon2);
	const z = weightA * Math.sin(lat1) + weightB * Math.sin(lat2);
	return {
		lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
		lon: Math.atan2(y, x) * 180 / Math.PI,
	};
}

export function buildRoute(route) {
	if (!Array.isArray(route)) throw new TypeError('Route must be an array');
	const points = route.filter(isValidCoordinate).map((point, index) => ({
		lat: point.lat,
		lon: point.lon,
		name: point.name || `点 ${index + 1}`,
	}));
	let distance = 0;
	return points.map((point, index) => {
		if (index > 0) distance += distanceMeters(points[index - 1], point);
		return { ...point, order: index + 1, distanceM: distance };
	});
}

function pointAtDistance(route, distanceM) {
	if (!route.length) return null;
	if (distanceM <= 0) return { ...route[0], distanceM: 0 };
	const total = route.at(-1).distanceM;
	if (distanceM >= total) return { ...route.at(-1), distanceM: total };
	for (let index = 1; index < route.length; index += 1) {
		const left = route[index - 1];
		const right = route[index];
		if (distanceM <= right.distanceM) {
			const span = right.distanceM - left.distanceM;
			const coordinate = interpolateGreatCircle(left, right, span ? (distanceM - left.distanceM) / span : 0);
			return { ...coordinate, distanceM };
		}
	}
	return null;
}

export function samplePolyline(route, spacingM = 250) {
	if (!Number.isFinite(spacingM) || spacingM <= 0) throw new RangeError('Spacing must be positive');
	const built = buildRoute(route);
	if (built.length < 2) return built.map(point => ({ ...point, distanceM: 0 }));
	const total = built.at(-1).distanceM;
	const intervals = Math.max(1, Math.ceil(total / spacingM));
	const samplesByDistance = new Map();
	for (const point of Array.from({ length: intervals + 1 }, (_, index) => pointAtDistance(built, total * index / intervals)).filter(Boolean)) {
		samplesByDistance.set(point.distanceM.toFixed(2), point);
	}
	// Keep user-drawn turns as exact terrain query points even when they do not
	// land on the regular distance grid.
	for (const waypoint of built) samplesByDistance.set(waypoint.distanceM.toFixed(2), waypoint);
	return [...samplesByDistance.values()].sort((a, b) => a.distanceM - b.distanceM);
}

export function buildAnalysisPoints(route, count = 5, dedupeMeters = 1) {
	if (!Number.isInteger(count) || count < 2) throw new RangeError('At least two analysis points are required');
	const built = buildRoute(route);
	if (built.length < 2) return built;
	const total = built.at(-1).distanceM;
	const automatic = Array.from({ length: count }, (_, index) => pointAtDistance(built, total * index / (count - 1)));
	const waypoints = built.map(point => ({ ...point, isWaypoint: true }));
	const generated = automatic.filter(point => point && !waypoints.some(waypoint => distanceMeters(point, waypoint) <= dedupeMeters));
	return [...waypoints, ...generated]
		.sort((a, b) => a.distanceM - b.distanceM || Number(b.isWaypoint) - Number(a.isWaypoint))
		.map(({ isWaypoint, ...point }) => point);
}

export function terrainChartGeometry(samples, width = 640, height = 190) {
	const valid = samples.filter(point => Number.isFinite(point.distanceM));
	if (valid.length < 2) return { line: '', area: '', minElevationM: null, maxElevationM: null };
	const elevated = valid.filter(point => Number.isFinite(point.elevationM));
	if (elevated.length < 2) return { line: '', area: '', minElevationM: null, maxElevationM: null };
	const distances = valid.map(point => point.distanceM);
	const elevations = elevated.map(point => point.elevationM);
	const minDistance = Math.min(...distances);
	const maxDistance = Math.max(...distances);
	const minElevationM = Math.min(...elevations);
	const maxElevationM = Math.max(...elevations);
	const verticalSpan = Math.max(100, maxElevationM - minElevationM);
	const padX = 10;
	const padY = 14;
	const x = distance => padX + (distance - minDistance) / Math.max(1, maxDistance - minDistance) * (width - padX * 2);
	const y = elevation => height - padY - (elevation - minElevationM) / verticalSpan * (height - padY * 2);
	const baseline = height - padY;
	const segments = [];
	let segment = [];
	for (const point of valid) {
		if (Number.isFinite(point.elevationM)) segment.push(point);
		else if (segment.length) {
			segments.push(segment);
			segment = [];
		}
	}
	if (segment.length) segments.push(segment);
	const drawable = segments.filter(points => points.length >= 2);
	const line = drawable.map(points => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.distanceM).toFixed(1)},${y(point.elevationM).toFixed(1)}`).join(' ')).join(' ');
	const area = drawable.map(points => {
		const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.distanceM).toFixed(1)},${y(point.elevationM).toFixed(1)}`).join(' ');
		const firstX = x(points[0].distanceM).toFixed(1);
		const lastX = x(points.at(-1).distanceM).toFixed(1);
		return `${path} L${lastX},${baseline} L${firstX},${baseline} Z`;
	}).join(' ');
	return { line, area, minElevationM, maxElevationM };
}
