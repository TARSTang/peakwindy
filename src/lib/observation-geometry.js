import {
	distanceMeters,
	interpolateGreatCircle,
	isValidCoordinate,
} from './route.js';

export const EARTH_RADIUS_M = 6371008.8;
export const rad = (a) => (a * Math.PI) / 180;
export const deg = (a) => (a * 180) / Math.PI;
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export function bearing(a, b) {
	const p = rad(a.lat),
		q = rad(b.lat),
		d = rad(b.lon - a.lon);
	return (
		(deg(
			Math.atan2(
				Math.sin(d) * Math.cos(q),
				Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(d),
			),
		) +
			360) %
		360
	);
}
export function destination(p, azimuth, distanceM) {
	const d = distanceM / EARTH_RADIUS_M,
		a = rad(azimuth),
		lat = rad(p.lat),
		lon = rad(p.lon);
	const y = Math.asin(
		Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(a),
	);
	const x =
		lon +
		Math.atan2(
			Math.sin(a) * Math.sin(d) * Math.cos(lat),
			Math.cos(d) - Math.sin(lat) * Math.sin(y),
		);
	return { lat: deg(y), lon: ((deg(x) + 540) % 360) - 180 };
}
export function directPath(a, b, spacingM = 250, maxPoints = 81) {
	if (!isValidCoordinate(a) || !isValidCoordinate(b))
		throw new Error('坐标无效');
	const distanceM = distanceMeters(a, b);
	if (distanceM < 1 || distanceM > 1000000)
		throw new Error('机位与山峰距离须为 1 米至 1000 千米');
	const count = Math.min(
		maxPoints - 1,
		Math.max(1, Math.ceil(distanceM / spacingM)),
	);
	return Array.from({ length: count + 1 }, (_, i) => ({
		...interpolateGreatCircle(a, b, i / count),
		distanceM: (distanceM * i) / count,
		elevationM: null,
	}));
}
// Straight chord above a spherical Earth; no assumed atmospheric refraction.
export function rayHeight(startM, endM, distanceM, totalM) {
	return (
		startM +
		((endM - startM) * distanceM) / totalM -
		(distanceM * (totalM - distanceM)) / (2 * EARTH_RADIUS_M)
	);
}
export function terrainSight(path, startM, endM) {
	if (!Number.isFinite(startM) || !Number.isFinite(endM) || path.length < 2)
		return { status: 'unknown', reason: '端点海拔缺测', path };
	const total = path.at(-1).distanceM;
	const evidence = path.map((p) => ({
		...p,
		rayM: rayHeight(startM, endM, p.distanceM, total),
	}));
	const inside = evidence.slice(1, -1),
		known = inside.filter((p) => Number.isFinite(p.elevationM));
	const obstruction = known.reduce(
		(best, p) =>
			!best || p.rayM - p.elevationM < best.rayM - best.elevationM ? p : best,
		null,
	);
	const clearanceM = obstruction
		? obstruction.rayM - obstruction.elevationM
		: null;
	const missing = known.length !== inside.length || inside.length === 0;
	const status =
		clearanceM !== null && clearanceM < -30
			? 'blocked'
			: missing || clearanceM === null || clearanceM <= 30
				? 'unknown'
				: 'clear';
	return {
		status,
		reason:
			status === 'blocked'
				? '采样地形高于直达视线'
				: missing
					? '通视路径地形缺测或无内部采样'
					: status === 'unknown'
						? '近掠地形，对地形误差与折射敏感'
						: '采样路径未发现地形遮挡，点间地形仍未知',
		clearanceM,
		obstruction,
		path: evidence,
		spacingM: total / (path.length - 1),
	};
}
export function mountainGrid(peak, radiusM = 2000) {
	return Array.from({ length: 81 }, (_, i) => {
		const row = Math.floor(i / 9),
			col = i % 9,
			eastM = ((col - 4) * radiusM) / 4,
			northM = ((4 - row) * radiusM) / 4;
		return {
			...destination(
				peak,
				deg(Math.atan2(eastM, northM)),
				Math.hypot(eastM, northM),
			),
			row,
			col,
			eastM,
			northM,
			elevationM: null,
			inRange: Math.hypot(eastM, northM) <= radiusM,
		};
	});
}
export function mountainSectors(grid, viewer, viewerM) {
	const sectors = [];
	for (let sy = 0; sy < 3; sy++)
		for (let sx = 0; sx < 3; sx++) {
			const cells = grid.filter(
				(p) =>
					p.inRange &&
					Math.floor(p.row / 3) === sy &&
					Math.floor(p.col / 3) === sx,
			);
			const candidates = cells.filter((p) => Number.isFinite(p.elevationM));
			const interior = candidates.filter(
				(p) => p.row > 0 && p.row < 8 && p.col > 0 && p.col < 8,
			);
			const representative = (interior.length ? interior : candidates).sort(
				(a, b) => b.elevationM - a.elevationM,
			)[0];
			const id = sy * 3 + sx;
			if (!representative) {
				sectors.push({
					id,
					name: `山体分区 ${id + 1}`,
					status: 'unknown',
					reason: '分区地形缺测',
					cells,
				});
				continue;
			}
			const p = representative,
				at = (r, c) => grid.find((v) => v.row === r && v.col === c);
			const l = at(p.row, p.col - 1),
				r = at(p.row, p.col + 1),
				n = at(p.row - 1, p.col),
				s = at(p.row + 1, p.col);
			const validNormal = [l, r, n, s].every((v) =>
				Number.isFinite(v?.elevationM),
			);
			let normal = null;
			if (validNormal) {
				const v = [
					-(r.elevationM - l.elevationM) / (r.eastM - l.eastM),
					-(n.elevationM - s.elevationM) / (n.northM - s.northM),
					1,
				];
				const length = Math.hypot(...v);
				normal = v.map((x) => x / length);
			}
			const d = distanceMeters(p, viewer),
				az = rad(bearing(p, viewer));
			const facing =
				normal && Number.isFinite(viewerM)
					? dot(normal, [
							Math.sin(az) * d,
							Math.cos(az) * d,
							viewerM - p.elevationM - (d * d) / (2 * EARTH_RADIUS_M),
						]) > 0
					: null;
			sectors.push({
				id,
				name: `山体分区 ${id + 1}`,
				representative: p,
				cells,
				normal,
				facing,
				status: facing === false ? 'blocked' : 'unknown',
				reason: facing === false ? '粗略坡面背向机位' : '通视待检查',
			});
		}
	return sectors;
}
