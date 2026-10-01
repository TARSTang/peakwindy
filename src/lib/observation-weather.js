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

export function fogAtGround(profile, timestampMs, remainingDistanceM = null) {
	const bracket = timeBracket(profile, timestampMs);
	if (!bracket.ok) {
		return {
			status: 'unknown',
			reason: `雾／能见度资料不足：${bracket.reason}`,
			remainingDistanceM,
		};
	}
	const visibilityM = bracket.frames.every((frame) =>
		Number.isFinite(frame.surfaceVisibilityM),
	)
		? Math.min(...bracket.frames.map((frame) => frame.surfaceVisibilityM))
		: null;
	const warningCodes = [...new Set(bracket.frames
		.map((frame) => frame.surfaceWeatherWarningCode)
		.filter((code) => Number.isFinite(code)))];
	const fogWarnings = warningCodes.filter((code) => code === 45 || code === 48);
	const surfaceLevels = bracket.frames.map((frame) => frame.surfaceLevel);
	const humidityValues = surfaceLevels
		.map((level) => level?.relativeHumidityPct)
		.filter(Number.isFinite);
	const dewPointSpreads = surfaceLevels
		.filter((level) => Number.isFinite(level?.temperatureC) && Number.isFinite(level?.dewPointC))
		.map((level) => level.temperatureC - level.dewPointC);
	const saturationSignals = surfaceLevels.map((level) => {
		const hasHumidity = Number.isFinite(level?.relativeHumidityPct);
		const hasDewPointSpread = Number.isFinite(level?.temperatureC) && Number.isFinite(level?.dewPointC);
		if (!hasHumidity && !hasDewPointSpread) return null;
		return (hasHumidity && level.relativeHumidityPct >= 95)
			|| (hasDewPointSpread && level.temperatureC - level.dewPointC >= -1 && level.temperatureC - level.dewPointC <= 2);
	});
	const nearSaturated = saturationSignals.length > 0 && saturationSignals.every(Boolean);
	const rangeExceeded = Number.isFinite(remainingDistanceM)
		&& remainingDistanceM > 0
		&& visibilityM !== null
		&& visibilityM < remainingDistanceM;
	const rangeText = Number.isFinite(remainingDistanceM)
		? `，到目标剩余 ${Math.round(remainingDistanceM)} 米`
		: '';
	let status = 'unknown';
	let reason = 'Windy 未返回足够的地面水平能见度或近地层湿度数据，不能排除雾。';
	if (fogWarnings.length) {
		status = 'blocked';
		reason = `Windy 返回雾现象代码 ${fogWarnings.join('/')}，对应时段存在雾信号。`;
	} else if (visibilityM !== null && visibilityM <= 1_000) {
		status = rangeExceeded ? 'blocked' : 'possible';
		reason = `采样点地面水平能见度 ${Math.round(visibilityM)} 米${rangeText}；有雾或其他低能见度遮挡信号，模型不能确认成因。`;
	} else if (rangeExceeded) {
		status = 'possible';
		reason = `采样点地面水平能见度 ${Math.round(visibilityM)} 米${rangeText}；能见度小于目标余程，可能影响观山，成因不一定是雾。`;
	} else if (nearSaturated) {
		status = 'possible';
		const humidityText = humidityValues.length ? `近地层相对湿度最高 ${Math.round(Math.max(...humidityValues))}%` : '';
		const spreadText = dewPointSpreads.length ? `温度与露点差最小 ${Math.min(...dewPointSpreads).toFixed(1)}°C` : '';
		reason = `${[humidityText, spreadText].filter(Boolean).join('，')}；有近地雾／低云条件信号，但不能据此确认已起雾。${visibilityM === null ? '能见度未返回。' : `地面能见度 ${Math.round(visibilityM)} 米。`}`;
	} else if (visibilityM !== null) {
		status = 'clear';
		reason = `采样点地面水平能见度 ${Math.round(visibilityM)} 米${rangeText}；该点未见明显低能见度信号，但不代表整条高空视线透明。`;
	}
	return {
		status,
		reason,
		visibilityM,
		humidityPct: humidityValues.length ? Math.max(...humidityValues) : null,
		dewPointSpreadC: dewPointSpreads.length ? Math.min(...dewPointSpreads) : null,
		warningCodes,
		fogWarningCodes: fogWarnings,
		remainingDistanceM,
		range: bracket.range,
	};
}

export function summarizeFog(points) {
	const obstruction = points.find((point) => point.fog?.status === 'blocked')
		?? points.find((point) => point.fog?.status === 'possible');
	const status = obstruction
		? obstruction.fog.status
		: !points.length || points.some((point) => point.fog?.status !== 'clear')
			? 'unknown'
			: 'clear';
	return {
		status,
		obstruction,
		reason: obstruction?.fog.reason
			?? (status === 'clear'
				? '已返回能见度的采样点未见明显雾信号；采样间区域与高空透明度仍未知。'
				: 'Windy 未返回足够的近地面能见度或湿度资料，不能排除雾。'),
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
