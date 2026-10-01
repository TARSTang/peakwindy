function timeBracket(profile, timestampMs) {
	const frames = (profile?.frames ?? [])
		.filter(frame => Number.isFinite(frame.timestampMs))
		.sort((a, b) => a.timestampMs - b.timestampMs);
	const exact = frames.find(frame => Math.abs(frame.timestampMs - timestampMs) < 1000);
	if (exact) return { ok: true, frames: [exact] };
	const before = frames.filter(frame => frame.timestampMs < timestampMs).at(-1);
	const after = frames.find(frame => frame.timestampMs > timestampMs);
	if (!before || !after || after.timestampMs - before.timestampMs > 3 * 60 * 60 * 1000) {
		return { ok: false, reason: '缺少两侧有效时次或间隔超过 3 小时' };
	}
	return { ok: true, frames: [before, after] };
}

export function assessGroundFog(profile, timestampMs) {
	const bracket = timeBracket(profile, timestampMs);
	if (!bracket.ok) {
		return {
			status: 'unknown',
			reason: `雾／能见度资料不足：${bracket.reason}`,
			visibilityM: null,
			humidityPct: null,
			dewPointSpreadC: null,
		};
	}

	const visibilityValues = bracket.frames.map(frame => frame.surfaceVisibilityM);
	const visibilityM = visibilityValues.every(Number.isFinite) ? Math.min(...visibilityValues) : null;
	const warningCodes = [...new Set(bracket.frames
		.map(frame => frame.surfaceWeatherWarningCode)
		.filter(Number.isFinite))];
	const fogWarningCodes = warningCodes.filter(code => code === 45 || code === 48);
	const surfaceLevels = bracket.frames.map(frame => frame.surfaceLevel);
	const humidityValues = surfaceLevels
		.map(level => level?.relativeHumidityPct)
		.filter(Number.isFinite);
	const dewPointSpreads = surfaceLevels
		.filter(level => Number.isFinite(level?.temperatureC) && Number.isFinite(level?.dewPointC))
		.map(level => level.temperatureC - level.dewPointC);
	const saturationSignals = surfaceLevels.map(level => {
		const hasHumidity = Number.isFinite(level?.relativeHumidityPct);
		const hasDewPointSpread = Number.isFinite(level?.temperatureC) && Number.isFinite(level?.dewPointC);
		if (!hasHumidity && !hasDewPointSpread) return null;
		return (hasHumidity && level.relativeHumidityPct >= 95)
			|| (hasDewPointSpread && level.temperatureC - level.dewPointC >= -1 && level.temperatureC - level.dewPointC <= 2);
	});
	const nearSaturated = saturationSignals.length > 0 && saturationSignals.every(Boolean);

	let status = 'unknown';
	let reason = 'Windy 未返回足够的地面能见度或近地层温湿数据，不能排除雾。';
	if (fogWarningCodes.length) {
		status = 'blocked';
		reason = `Windy 返回雾现象代码 ${fogWarningCodes.join('/')}，对应时段存在地面雾信号。`;
	} else if (visibilityM !== null && visibilityM <= 1_000) {
		status = 'possible';
		reason = `地面水平能见度 ${Math.round(visibilityM)} 米；存在雾或其他低能见度信号，模型不能确认成因。`;
	} else if (nearSaturated) {
		status = 'possible';
		const humidityText = humidityValues.length ? `近地层相对湿度最高 ${Math.round(Math.max(...humidityValues))}%` : '';
		const spreadText = dewPointSpreads.length ? `温度与露点差最小 ${Math.min(...dewPointSpreads).toFixed(1)}°C` : '';
		reason = `${[humidityText, spreadText].filter(Boolean).join('，')}；有近地雾／低云条件信号，但不能据此确认已起雾。${visibilityM === null ? '能见度未返回。' : `地面能见度 ${Math.round(visibilityM)} 米。`}`;
	} else if (visibilityM !== null) {
		status = 'clear';
		reason = `地面水平能见度 ${Math.round(visibilityM)} 米；该点未见明显低能见度信号，不代表高空透明度。`;
	}

	return {
		status,
		reason,
		visibilityM,
		humidityPct: humidityValues.length ? Math.max(...humidityValues) : null,
		dewPointSpreadC: dewPointSpreads.length ? Math.min(...dewPointSpreads) : null,
		fogWarningCodes,
	};
}

export function groundFogStatusLabel(status) {
	if (status === 'blocked') return '雾现象信号';
	if (status === 'possible') return '可能有雾／低能见度';
	if (status === 'clear') return '未见明显低能见度';
	return '资料不足';
}
