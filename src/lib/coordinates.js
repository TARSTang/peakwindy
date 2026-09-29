import { isValidCoordinate } from './route.js';

const PI = Math.PI;
const AXIS = 6_378_245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;
const GCJ_MAINLAND_BOUNDS = { minLon: 72.004, maxLon: 137.8347, minLat: 0.8293, maxLat: 55.8271 };
const NUMBER = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';

function transformLatitude(x, y) {
	let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
	result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
	result += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
	result += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
	return result;
}

function transformLongitude(x, y) {
	let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
	result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
	result += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
	result += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
	return result;
}

function withinGcjCoverage({ lon, lat }) {
	return lon >= GCJ_MAINLAND_BOUNDS.minLon && lon <= GCJ_MAINLAND_BOUNDS.maxLon
		&& lat >= GCJ_MAINLAND_BOUNDS.minLat && lat <= GCJ_MAINLAND_BOUNDS.maxLat;
}

function wgs84ToGcj02({ lon, lat }) {
	const x = lon - 105;
	const y = lat - 35;
	let deltaLat = transformLatitude(x, y);
	let deltaLon = transformLongitude(x, y);
	const radians = lat / 180 * PI;
	let magic = Math.sin(radians);
	magic = 1 - ECCENTRICITY_SQUARED * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	deltaLat = deltaLat * 180 / ((AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrtMagic) * PI);
	deltaLon = deltaLon * 180 / (AXIS / sqrtMagic * Math.cos(radians) * PI);
	return { lon: lon + deltaLon, lat: lat + deltaLat };
}

export function parseOviCoordinate(value) {
	const compact = String(value ?? '').trim().replace(/\s+/g, '');
	const match = compact.match(new RegExp(`^([gG])?${NUMBER}[,，]${NUMBER}$`));
	if (!match) return { ok: false, error: '请输入奥维格式：g经度,纬度，例如 g102.07896084,29.72998398。' };
	const hasGcjPrefix = Boolean(match[1]);
	const lon = Number(match[2]);
	const lat = Number(match[3]);
	if (!isValidCoordinate({ lat, lon })) {
		return { ok: false, error: '坐标超出范围：经度应为−180至180，纬度应为−90至90。' };
	}
	return { ok: true, lon, lat, coordinateSystem: hasGcjPrefix ? 'GCJ-02' : 'WGS-84' };
}

export function gcj02ToWgs84(coordinate) {
	if (!isValidCoordinate(coordinate) || !withinGcjCoverage(coordinate)) return null;
	let candidate = { ...coordinate };
	for (let iteration = 0; iteration < 8; iteration += 1) {
		const projected = wgs84ToGcj02(candidate);
		const lonError = coordinate.lon - projected.lon;
		const latError = coordinate.lat - projected.lat;
		candidate = { lon: candidate.lon + lonError, lat: candidate.lat + latError };
		if (Math.max(Math.abs(lonError), Math.abs(latError)) < 1e-10) break;
	}
	return candidate;
}

export function resolveOviCoordinate(value) {
	const parsed = parseOviCoordinate(value);
	if (!parsed.ok) return parsed;
	if (parsed.coordinateSystem === 'GCJ-02') {
		const converted = gcj02ToWgs84(parsed);
		if (!converted) return { ok: false, error: 'g 坐标不在支持的中国大陆范围内，未进行转换。' };
		return { ok: true, ...converted, coordinateSystem: parsed.coordinateSystem, source: '奥维 GCJ-02，已近似转换为 Windy 坐标' };
	}
	return {
		ok: true,
		lon: parsed.lon,
		lat: parsed.lat,
		coordinateSystem: parsed.coordinateSystem,
		source: '奥维无 g 坐标，按原值传给 Windy',
	};
}
