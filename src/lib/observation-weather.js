import { interpolateAtHeight, levelsIncludingModelSurface } from './profile.js';

export function timeBracket(profile, timestampMs) {
	const frames = (profile?.frames ?? [])
		.filter((f) => Number.isFinite(f.timestampMs))
		.sort((a, b) => a.timestampMs - b.timestampMs);
	const exact = frames.find(
		(f) => Math.abs(f.timestampMs - timestampMs) < 1000,
	);
	if (exact)
		return {
			ok: true,
			frames: [exact],
			range: [exact.timestampMs, exact.timestampMs],
		};
	const before = frames.filter((f) => f.timestampMs < timestampMs).at(-1),
		after = frames.find((f) => f.timestampMs > timestampMs);
	if (!before || !after || after.timestampMs - before.timestampMs > 10800000)
		return {
			ok: false,
			reason: '缺少两侧有效时次或间隔超过 3 小时',
			frames: [],
		};
	return {
		ok: true,
		frames: [before, after],
		range: [before.timestampMs, after.timestampMs],
	};
}
export function cloudAtRay(profile, timestampMs, heightM, terrainM = null) {
	const bracket = timeBracket(profile, timestampMs);
	if (!bracket.ok || !Number.isFinite(heightM))
		return {
			status: 'unknown',
			reason: bracket.reason ?? '视线海拔缺测',
			heightM,
		};
	const values = bracket.frames.map((f) =>
		interpolateAtHeight(f, heightM, terrainM),
	);
	const field = (key) =>
		values.every((v) => v.ok && Number.isFinite(v[key]))
			? Math.max(...values.map((v) => v[key]))
			: null;
	const cloudPct = field('cloudPct'),
		humidityPct = field('humidityPct');
	const status =
		cloudPct !== null && cloudPct > 0
			? 'blocked'
			: humidityPct !== null && humidityPct >= 90
				? 'possible'
				: cloudPct === 0 && humidityPct !== null
					? 'clear'
					: 'unknown';
	const relations = bracket.frames.flatMap((f) =>
		levelsIncludingModelSurface(f)
			.filter(
				(l) =>
					Number.isFinite(l.heightM) &&
					Number.isFinite(l.cloudPct) &&
					l.cloudPct > 0,
			)
			.map((l) => ({
				heightM: l.heightM,
				cloudPct: l.cloudPct,
				relation:
					l.heightM > heightM + 50
						? 'above'
						: l.heightM < heightM - 50
							? 'below'
							: 'intersects',
			})),
	);
	const surfaceVisibilityM = bracket.frames.every((f) =>
		Number.isFinite(f.surfaceVisibilityM),
	)
		? Math.min(...bracket.frames.map((f) => f.surfaceVisibilityM))
		: null;
	return {
		status,
		cloudPct,
		humidityPct,
		surfaceVisibilityM,
		heightM,
		range: bracket.range,
		values,
		relations,
		reason:
			status === 'blocked'
				? '实际有效高度层在视线处返回云量信号'
				: status === 'possible'
					? '相对湿度 ≥90%，可能有云；与模式云量分开判断'
					: status === 'unknown'
						? '云量或湿度高度层缺测，不能确认透明度'
						: '采样处视线云量为零，实际透明度仍未知',
	};
}
export function summarizeCloud(points) {
	const obstruction = points.find((p) =>
		['blocked', 'possible'].includes(p.cloud?.status),
	);
	return {
		status: obstruction
			? 'blocked'
			: !points.length || points.some((p) => p.cloud?.status !== 'clear')
				? 'unknown'
				: 'clear',
		obstruction,
		reason:
			obstruction?.cloud.reason ?? '未采样空间、实际透明度及更高云层仍未知',
	};
}
