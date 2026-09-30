import { getPosition } from 'suncalc';
import {
	rad,
	deg,
	dot,
	EARTH_RADIUS_M,
	destination,
	bearing,
} from './observation-geometry.js';
import { distanceMeters } from './route.js';

// SunCalc 2 returns north-clockwise degrees and apparent (refracted) altitude.
export function solarPosition(timestampMs, point) {
	const p = getPosition(new Date(timestampMs), point.lat, point.lon);
	const h = p.altitude;
	// Invert v2's Meeus refraction model; it clamps geometric altitude at zero.
	// Retain both conventions: apparent altitude for display, geometry for rays.
	const refraction = (altitude) =>
		deg(
			0.0002967 /
				Math.tan(
					rad(Math.max(0, altitude)) +
						0.00312536 / (rad(Math.max(0, altitude)) + 0.08901179),
				),
		);
	let geometric = h - refraction(h);
	for (let i = 0; i < 12; i++) geometric = h - refraction(geometric);
	return {
		azimuthDeg: p.azimuth,
		apparentAltitudeDeg: h,
		geometricAltitudeDeg: geometric,
	};
}
export function beijingDayStart(date) {
	const stamp = Date.parse(`${date}T00:00:00+08:00`);
	if (!Number.isFinite(stamp)) throw new Error('日期无效');
	return stamp;
}
export function coarseHorizon(point, grid, azimuthDeg) {
	let horizon = -90,
		sampled = false;
	const spacing =
		grid.length > 1 ? Math.abs(grid[1].eastM - grid[0].eastM) : 500;
	for (const cell of grid) {
		const d = distanceMeters(point, cell);
		if (!Number.isFinite(cell.elevationM) || d < spacing / 2) continue;
		const delta = Math.abs(
			((bearing(point, cell) - azimuthDeg + 540) % 360) - 180,
		);
		// Cells only constrain their own angular footprint; unsampled azimuths stay unknown.
		if (delta > deg(Math.atan2(spacing / 2, d))) continue;
		sampled = true;
		horizon = Math.max(
			horizon,
			deg(
				Math.atan2(
					cell.elevationM - point.elevationM - (d * d) / (2 * EARTH_RADIUS_M),
					d,
				),
			),
		);
	}
	return { angleDeg: sampled ? horizon : null, known: sampled };
}
export function solarWindows(date, peak, sectors, grid = []) {
	const start = beijingDayStart(date),
		windows = [];
	const height = Math.max(0, peak.elevationM ?? 0);
	const dip = deg(Math.acos(EARTH_RADIUS_M / (EARTH_RADIUS_M + height)));
	let active = null;
	for (let i = 0; i < 1440; i++) {
		const timestampMs = start + i * 60000,
			sun = solarPosition(timestampMs, peak);
		const next = solarPosition(timestampMs + 60000, peak);
		const kind =
			next.apparentAltitudeDeg >= sun.apparentAltitudeDeg
				? 'morning'
				: 'evening';
		const v = [
			Math.sin(rad(sun.azimuthDeg)) * Math.cos(rad(sun.geometricAltitudeDeg)),
			Math.cos(rad(sun.azimuthDeg)) * Math.cos(rad(sun.geometricAltitudeDeg)),
			Math.sin(rad(sun.geometricAltitudeDeg)),
		];
		const lit = sectors
			.filter((s) => {
				if (
					s.sight?.status !== 'clear' ||
					s.facing !== true ||
					!s.normal ||
					dot(s.normal, v) <= 0
				)
					return false;
				const point = s.representative ?? peak,
					horizon = coarseHorizon(point, grid, sun.azimuthDeg);
				return (
					!horizon.known || sun.apparentAltitudeDeg + 0.2666 >= horizon.angleDeg
				);
			})
			.map((s) => s.id);
		const candidate =
			sun.apparentAltitudeDeg <= 8 &&
			sun.geometricAltitudeDeg >= -dip - 0.2666 &&
			lit.length > 0;
		if (candidate) {
			if (!active || active.kind !== kind) {
				active = {
					id: `${kind}-${timestampMs}`,
					kind,
					startMs: timestampMs,
					endMs: timestampMs,
					sectorIds: lit,
					status: 'pending',
					reason: '可见山面具备低角度受光条件；太阳光路待检查',
				};
				windows.push(active);
			}
			active.endMs = timestampMs;
			active.sectorIds = [...new Set([...active.sectorIds, ...lit])];
		} else active = null;
	}
	return windows;
}
export function solarRayHeight(peakM, distanceM, geometricAltitudeDeg) {
	return (
		peakM +
		distanceM * Math.tan(rad(geometricAltitudeDeg)) +
		(distanceM * distanceM) / (2 * EARTH_RADIUS_M)
	);
}
export function solarPath(point, timestampMs) {
	const sun = solarPosition(timestampMs, point);
	const distances = [
		0, 250, 500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000,
		65000, 90000, 125000, 175000, 250000,
	];
	return {
		sun,
		points: distances.map((distanceM) => ({
			...destination(point, sun.azimuthDeg, distanceM),
			distanceM,
			rayM: solarRayHeight(
				point.elevationM,
				distanceM,
				sun.geometricAltitudeDeg,
			),
			elevationM: null,
		})),
	};
}
