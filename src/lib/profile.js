import { heightToDisplay, heightUnit } from './units.js';

const LEVEL_FIELD = /^(?:gh|cloud|temp|wind|windDir|rh|dewPoint)-(\d+)h$/i;
const PROFILE_VALUE_FIELDS = ['temperatureC', 'dewPointC', 'relativeHumidityPct', 'windSpeedMs', 'windDirectionDeg', 'cloudPct'];
const LEGACY_PROFILE_SOURCE_LABEL = 'Windy 旧版兼容逐层接口（官方标记弃用）';

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value, { min = -Infinity, max = Infinity } = {}) {
	if (value === null || value === undefined || value === '') return null;
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function hasAnyProfileValue(level) {
	return PROFILE_VALUE_FIELDS.some(field => Number.isFinite(level?.[field]));
}

function valueAt(source, key, index, limits) {
	const values = source?.[key];
	return Array.isArray(values) ? finiteOrNull(values[index], limits) : null;
}

function responseArrayDiagnostics(source, includeLegacyFields = false) {
	if (!isRecord(source)) return [];
	return Object.entries(source)
		.filter(([key, values]) => Array.isArray(values) && (
			/^(?:ts|hours)$/i.test(key)
		|| /^(?:gh|cloud|cloudBase|temp|wind|windDir|rh|dewPoint|windGust|gust|visibility|weatherWarnings|temperature|feelTemperature|pressure|lclouds|mclouds|hclouds|precipAmount|precipSnowAmount)(?:-(?:\d+h|surface))?$/i.test(key)
		|| (includeLegacyFields && /^(?:dewpoint|wind_u|wind_v)(?:-(?:\d+h|surface))?$/i.test(key))
		))
		.map(([key, values]) => ({
			key,
			length: values.length,
			validCount: /^(?:ts|hours)$/i.test(key)
				? values.reduce((count, value) => count + Number(timestampToMilliseconds(value) !== null), 0)
				: values.reduce((count, value) => count + Number(finiteOrNull(value) !== null), 0),
			validAtTime: values.map(value => finiteOrNull(value) !== null),
		}));
}

function profileBody(payload) {
	if (!isRecord(payload)) return null;
	const nested = payload.data;
	if (isRecord(nested) && (isRecord(nested.data) || nested.meteogram || nested.airgram || nested.sounding)) return nested;
	return payload;
}

export function timestampToMilliseconds(value) {
	const timestamp = finiteOrNull(value, { min: 0 });
	if (timestamp === null) return null;
	if (timestamp >= 100_000_000_000) return timestamp;
	if (timestamp >= 100_000_000) return timestamp * 1000;
	return null;
}

function sourceIndexAtTimestamp(source, timestampMs, fallbackIndex) {
	if (!Array.isArray(source?.ts)) return fallbackIndex;
	let bestIndex = -1;
	let bestDifference = Infinity;
	for (let index = 0; index < source.ts.length; index += 1) {
		const sourceTimestampMs = timestampToMilliseconds(source.ts[index]);
		if (sourceTimestampMs === null) continue;
		const difference = Math.abs(sourceTimestampMs - timestampMs);
		if (difference < bestDifference) {
			bestDifference = difference;
			bestIndex = index;
		}
	}
	return bestDifference <= 1_000 ? bestIndex : null;
}

export function parseWindyProfile(payload) {
	const body = profileBody(payload);
	if (!body) return { ok: false, error: 'Windy 响应为空', frames: [], timestampsMs: [], modelElevationM: null };

	const data = isRecord(body.data) ? body.data : {};
	const header = isRecord(body.header) ? body.header : {};
	const meteogram = isRecord(body.meteogram) ? body.meteogram : {};
	const airgram = isRecord(body.airgram) ? body.airgram : {};
	const sounding = isRecord(body.sounding) ? body.sounding : {};
	const responseGroups = {
		data: isRecord(body.data),
		header: isRecord(body.header),
		celestial: isRecord(body.celestial),
		summary: Array.isArray(body.summary) || isRecord(body.summary),
		meteogram: isRecord(body.meteogram),
		airgram: isRecord(body.airgram),
		sounding: isRecord(body.sounding),
	};
	const responseArrays = {
		data: responseArrayDiagnostics(data),
		header: responseArrayDiagnostics(header),
		meteogram: responseArrayDiagnostics(meteogram),
		airgram: responseArrayDiagnostics(airgram),
		sounding: responseArrayDiagnostics(sounding),
	};
	const modelElevationM = finiteOrNull(header.modelElevation, { min: -1_000, max: 10_000 })
		?? finiteOrNull(header.elevation, { min: -1_000, max: 10_000 });
	const rawTimes = data.ts ?? header.ts ?? sounding.ts ?? airgram.ts ?? meteogram.ts;
	const normalizedTimes = Array.isArray(rawTimes) ? rawTimes.map(timestampToMilliseconds) : [];
	const timeIndexes = Array.from({ length: normalizedTimes.length }, (_, index) => index)
		.filter(index => normalizedTimes[index] !== null);
	const timestampsMs = timeIndexes.map(index => normalizedTimes[index]);
	if (!timestampsMs.length) return {
		ok: false,
		error: '未找到可识别的预报时刻',
		dataSource: 'windy-point-forecast-v3',
		servedModel: typeof header.model === 'string' && header.model.trim() ? header.model.trim() : null,
		servedModelSource: header.model ? 'response' : 'unknown',
		frames: [],
		timestampsMs: [],
		modelElevationM,
		availableLevelNames: Array.isArray(header.availableLevels) ? header.availableLevels.map(String) : [],
		responseGroups,
		responseArrays,
	};
	const sourceLabels = {
		data: '地面预报字段',
		header: '高度层字段',
		meteogram: '云量和高度字段',
		airgram: '温度和风字段',
		sounding: '垂直探空字段',
	};

	const availablePressureLevels = Array.isArray(header.availableLevels)
		? header.availableLevels.map(level => String(level).match(/^(\d+)h$/i)?.[1]).filter(Boolean).map(Number)
		: [];
	const pressureLevelsFromFields = [header, meteogram, airgram, sounding].flatMap(source => Object.keys(source))
		.map(key => ({ key, match: key.match(LEVEL_FIELD) }))
		.filter(item => item.match)
		.map(item => Number(item.match[1]));
	const pressureLevels = [...new Set([...availablePressureLevels, ...pressureLevelsFromFields])]
		.filter(level => Number.isFinite(level) && level > 0)
		.filter((level, index, all) => all.indexOf(level) === index)
		.sort((a, b) => b - a);
	const frames = timeIndexes.map((timeIndex, index) => {
		const timestampMs = timestampsMs[index];
		const sourceGroups = { data, header, meteogram, airgram, sounding };
		const sourceTimeIndexes = Object.fromEntries(Object.entries(sourceGroups)
			.map(([source, value]) => [source, sourceIndexAtTimestamp(value, timestampMs, timeIndex)]));
		const unmatchedSources = Object.entries(sourceTimeIndexes)
			.filter(([source, sourceIndex]) => sourceIndex === null
				&& Array.isArray(sourceGroups[source].ts)
				&& Object.keys(sourceGroups[source]).some(key => key !== 'ts' && Array.isArray(sourceGroups[source][key])))
			.map(([source]) => sourceLabels[source] ?? source);
		const timeAlignmentNotice = unmatchedSources.length
			? `Windy 的${unmatchedSources.join('、')}未包含当前预报时次；这些字段按缺测处理，没有借用其他时次的数据。`
			: '';
		const atSourceTime = (source, value, key, limits) => {
			const sourceIndex = sourceTimeIndexes[source];
			return sourceIndex === null ? null : valueAt(value, key, sourceIndex, limits);
		};
		const cloudBaseM = atSourceTime('header', header, 'cloudBase', { min: -500, max: 20_000 })
			?? atSourceTime('meteogram', meteogram, 'cloudBase', { min: -500, max: 20_000 })
			?? atSourceTime('sounding', sounding, 'cloudBase', { min: -500, max: 20_000 });
		const levels = pressureLevels.map((pressureHPa, pressureLevelIndex) => {
			const suffix = `${pressureHPa}h`;
			// Windy v3 types allow geopotential heights on `header`, `meteogram`,
			// and `sounding`; inspect all returned blocks instead of assuming one.
			const heightM = atSourceTime('header', header, `gh-${suffix}`, { min: -1_000, max: 60_000 })
				?? atSourceTime('meteogram', meteogram, `gh-${suffix}`, { min: -1_000, max: 60_000 })
				?? atSourceTime('sounding', sounding, `gh-${suffix}`, { min: -1_000, max: 60_000 });
			const temperatureK = atSourceTime('sounding', sounding, `temp-${suffix}`, { min: 150, max: 330 })
				?? atSourceTime('airgram', airgram, `temp-${suffix}`, { min: 150, max: 330 });
			const dewPointK = atSourceTime('sounding', sounding, `dewPoint-${suffix}`, { min: 150, max: 330 })
				?? atSourceTime('airgram', airgram, `dewPoint-${suffix}`, { min: 150, max: 330 });
			const windSpeedMs = atSourceTime('sounding', sounding, `wind-${suffix}`, { min: 0, max: 150 })
				?? atSourceTime('airgram', airgram, `wind-${suffix}`, { min: 0, max: 150 });
			const windDirectionDeg = atSourceTime('sounding', sounding, `windDir-${suffix}`, { min: 0, max: 360 })
				?? atSourceTime('airgram', airgram, `windDir-${suffix}`, { min: 0, max: 360 });
			const relativeHumidityPct = atSourceTime('sounding', sounding, `rh-${suffix}`, { min: 0, max: 100 });
			const cloudPct = atSourceTime('header', header, `cloud-${suffix}`, { min: 0, max: 100 })
				?? atSourceTime('meteogram', meteogram, `cloud-${suffix}`, { min: 0, max: 100 })
				?? atSourceTime('sounding', sounding, `cloud-${suffix}`, { min: 0, max: 100 });
			return {
				pressureHPa,
				pressureLevelIndex,
				source: 'pressure-level',
				heightM,
				temperatureC: temperatureK === null ? null : temperatureK - 273.15,
				dewPointC: dewPointK === null ? null : dewPointK - 273.15,
				relativeHumidityPct,
				windSpeedMs,
				windDirectionDeg: windDirectionDeg === 360 ? 0 : windDirectionDeg,
				cloudPct,
			};
		}).filter(level => level.heightM !== null);
		// The main Windy series are near-surface model values. Anchor them at the
		// model grid elevation only; never pretend they represent sea level or the
		// sharper terrain value returned by Windy's elevation service.
		const surfaceTemperatureK = atSourceTime('data', data, 'temperature', { min: 150, max: 330 })
			?? atSourceTime('airgram', airgram, 'temp-surface', { min: 150, max: 330 })
			?? atSourceTime('sounding', sounding, 'temp-surface', { min: 150, max: 330 });
		const surfaceDewPointK = atSourceTime('meteogram', meteogram, 'dewPoint', { min: 150, max: 330 })
			?? atSourceTime('sounding', sounding, 'dewPoint-surface', { min: 150, max: 330 });
		const surfaceWindSpeedMs = atSourceTime('data', data, 'wind', { min: 0, max: 150 })
			?? atSourceTime('airgram', airgram, 'wind-surface', { min: 0, max: 150 })
			?? atSourceTime('sounding', sounding, 'wind-surface', { min: 0, max: 150 });
		const surfaceWindDirectionDeg = atSourceTime('data', data, 'windDir', { min: 0, max: 360 })
			?? atSourceTime('airgram', airgram, 'windDir-surface', { min: 0, max: 360 })
			?? atSourceTime('sounding', sounding, 'windDir-surface', { min: 0, max: 360 });
		const surfaceRelativeHumidityPct = atSourceTime('sounding', sounding, 'rh-surface', { min: 0, max: 100 });
		const surfaceCloudPct = atSourceTime('meteogram', meteogram, 'cloud-surface', { min: 0, max: 100 })
			?? atSourceTime('sounding', sounding, 'cloud-surface', { min: 0, max: 100 });
		const surfaceLevel = Number.isFinite(modelElevationM) ? {
			pressureHPa: null,
			pressureLevelIndex: null,
			source: 'model-surface',
			heightM: modelElevationM,
			temperatureC: surfaceTemperatureK === null ? null : surfaceTemperatureK - 273.15,
			dewPointC: surfaceDewPointK === null ? null : surfaceDewPointK - 273.15,
			relativeHumidityPct: surfaceRelativeHumidityPct,
			windSpeedMs: surfaceWindSpeedMs,
			windDirectionDeg: surfaceWindDirectionDeg === 360 ? 0 : surfaceWindDirectionDeg,
			cloudPct: surfaceCloudPct,
		} : null;
		levels.sort((a, b) => a.heightM - b.heightM);
		return {
			timestampMs,
			sourceTimeIndex: timeIndex,
			sourceTimeIndexes,
			timeAlignmentNotice,
			cloudBaseM,
			surfaceLevel: surfaceLevel && ['temperatureC', 'dewPointC', 'relativeHumidityPct', 'windSpeedMs', 'windDirectionDeg', 'cloudPct'].some(field => Number.isFinite(surfaceLevel[field])) ? surfaceLevel : null,
			surfaceVisibilityM: atSourceTime('data', data, 'visibility', { min: 0, max: 200_000 })
				?? atSourceTime('data', data, 'visibility-surface', { min: 0, max: 200_000 }),
			surfaceWeatherWarningCode: atSourceTime('data', data, 'weatherWarnings', { min: 0, max: 200 })
				?? atSourceTime('data', data, 'weatherwarnings', { min: 0, max: 200 })
				?? atSourceTime('data', data, 'weatherwarnings-surface', { min: 0, max: 200 }),
			surfaceWindGustMs: atSourceTime('data', data, 'windGust', { min: 0, max: 150 }),
			lowCloudPct: atSourceTime('data', data, 'lclouds', { min: 0, max: 100 }),
			mediumCloudPct: atSourceTime('data', data, 'mclouds', { min: 0, max: 100 }),
			highCloudPct: atSourceTime('data', data, 'hclouds', { min: 0, max: 100 }),
			precipAmountMm: atSourceTime('data', data, 'precipAmount', { min: 0, max: 2_000 }),
			precipSnowAmountMm: atSourceTime('data', data, 'precipSnowAmount', { min: 0, max: 2_000 }),
			levels,
		};
	});

	const servedModel = typeof header.model === 'string' && header.model.trim() ? header.model.trim() : null;
	const updateTime = typeof header.update === 'string' && header.update.trim() ? header.update.trim() : null;
	const referenceTime = typeof header.refTime === 'string' && header.refTime.trim() ? header.refTime.trim() : null;
	const hasVerticalLayers = frames.some(frame => frame.levels.some(hasAnyProfileValue));
	const hasSurfaceData = frames.some(frame => frame.surfaceLevel !== null);
	const hasUsableData = hasVerticalLayers || hasSurfaceData;
	return {
		ok: hasUsableData,
		error: hasUsableData ? '' : '响应中没有有效的位势高度层或近地面天气值',
		dataSource: 'windy-point-forecast-v3',
		servedModelSource: servedModel ? 'response' : 'unknown',
		hasVerticalLayers,
		hasSurfaceData,
		frames,
		timestampsMs,
		pressureLevels,
		modelElevationM,
		servedModel,
		updateTime,
		referenceTime,
		hasDirectCloud: frames.some(frame => frame.levels.some(level => level.cloudPct !== null)
			|| Number.isFinite(frame.surfaceLevel?.cloudPct)),
		availableLevelNames: Array.isArray(header.availableLevels) ? header.availableLevels.map(String) : [],
		responseGroups,
		responseArrays,
	};
}

export function profileProvenance(profile) {
	if (!profile) return { source: 'Windy 数据接口', model: '模式信息未读取' };
	const source = profile.dataSource === 'windy-legacy-meteogram'
		? LEGACY_PROFILE_SOURCE_LABEL
		: 'Windy 点预报接口';
	const modelName = typeof profile.servedModel === 'string' && profile.servedModel.trim()
		? profile.servedModel.trim().toUpperCase()
		: null;
	const model = profile.servedModelSource === 'request'
		? `请求模式 ${modelName ?? '未提供'}（Windy 响应未标注模式名）`
		: modelName
			? `Windy 响应返回 ${modelName}`
			: 'Windy 未返回模式名';
	return { source, model };
}

export function attachRequestedModel(profile, requestedModel) {
	if (!profile || typeof requestedModel !== 'string' || !requestedModel.trim()) return profile;
	if (profile.servedModelSource === 'response' && typeof profile.servedModel === 'string' && profile.servedModel.trim()) {
		return { ...profile, requestedModel };
	}
	return {
		...profile,
		servedModel: requestedModel,
		servedModelSource: 'request',
		requestedModel,
	};
}

export function profileMatchesRequestedModel(profile, requestedModel) {
	if (!profile || typeof requestedModel !== 'string' || !requestedModel.trim()) return false;
	if (profile.servedModelSource !== 'response' || typeof profile.servedModel !== 'string' || !profile.servedModel.trim()) return true;
	const canonical = value => {
		const model = value.toLowerCase();
		if (model.startsWith('ecmwf')) return 'ecmwf';
		if (model.startsWith('icon')) return 'icon';
		return model;
	};
	return canonical(profile.servedModel) === canonical(requestedModel);
}

/**
 * Windy still exposes the legacy forecast/meteogram v1.2 endpoint through its
 * official plugin SDK. It is used only as a fallback when v3 has no pressure
 * layers. Heights are accepted only from Windy's gh-* arrays; pressure alone
 * is never converted to an estimated altitude.
 */
export function parseWindyLegacyProfile(payload, requestedModel = null) {
	if (!isRecord(payload)) return { ok: false, error: `${LEGACY_PROFILE_SOURCE_LABEL}响应为空`, frames: [], timestampsMs: [], modelElevationM: null };
	const payloadStatus = finiteOrNull(payload.status);
	if (payloadStatus !== null && payloadStatus !== 200) {
		return { ok: false, error: `${LEGACY_PROFILE_SOURCE_LABEL}返回状态 ${payloadStatus}`, frames: [], timestampsMs: [], modelElevationM: null };
	}
	const body = profileBody(payload);
	if (!body) return { ok: false, error: `${LEGACY_PROFILE_SOURCE_LABEL}响应格式无法识别`, frames: [], timestampsMs: [], modelElevationM: null };
	const data = isRecord(body.data) ? body.data : {};
	const header = isRecord(body.header) ? body.header : {};
	const responseArrays = {
		data: responseArrayDiagnostics(data, true),
		header: responseArrayDiagnostics(header, true),
	};
	const dataByLowerKey = new Map(Object.entries(data).map(([key, value]) => [key.toLowerCase(), value]));
	const rawTimes = data.hours ?? data.ts;
	const timestampsMs = Array.isArray(rawTimes) ? rawTimes.map(timestampToMilliseconds) : [];
	const timeIndexes = timestampsMs.map((time, index) => time === null ? -1 : index).filter(index => index >= 0);
	const pressureLevels = [...dataByLowerKey.keys()]
		.map(key => key.match(/^gh-(\d+)h$/i)?.[1])
		.filter(Boolean)
		.map(Number)
		.filter(level => Number.isFinite(level) && level > 0)
		.filter((level, index, all) => all.indexOf(level) === index)
		.sort((a, b) => b - a);
	const modelElevationM = finiteOrNull(header.modelElevation, { min: -1_000, max: 10_000 });
	const headerModel = typeof header.model === 'string' && header.model.trim() ? header.model.trim() : null;
	const servedModel = headerModel ?? requestedModel;
	const servedModelSource = headerModel ? 'response' : requestedModel ? 'request' : 'unknown';
	if (!timeIndexes.length) return {
		ok: false,
		error: `${LEGACY_PROFILE_SOURCE_LABEL}没有可识别的预报时刻`,
		dataSource: 'windy-legacy-meteogram',
		servedModel,
		servedModelSource,
		requestedModel,
		frames: [],
		timestampsMs: [],
		modelElevationM,
		pressureLevels,
		availableLevelNames: pressureLevels.map(level => `${level}h`),
		responseArrays,
	};
	const legacyValueAt = (key, index, limits) => {
		const values = dataByLowerKey.get(key.toLowerCase());
		return Array.isArray(values) ? finiteOrNull(values[index], limits) : null;
	};
	const frames = timeIndexes.map((timeIndex, frameIndex) => {
		const levels = pressureLevels.map((pressureHPa, pressureLevelIndex) => {
			const suffix = `${pressureHPa}h`;
			const heightM = legacyValueAt(`gh-${suffix}`, timeIndex, { min: -1_000, max: 60_000 });
			if (heightM === null) return null;
			const temperatureK = legacyValueAt(`temp-${suffix}`, timeIndex, { min: 150, max: 330 });
			const dewPointK = legacyValueAt(`dewpoint-${suffix}`, timeIndex, { min: 150, max: 330 });
			const relativeHumidityPct = legacyValueAt(`rh-${suffix}`, timeIndex, { min: 0, max: 100 });
			const windU = legacyValueAt(`wind_u-${suffix}`, timeIndex, { min: -150, max: 150 });
			const windV = legacyValueAt(`wind_v-${suffix}`, timeIndex, { min: -150, max: 150 });
			const windSpeedMs = windU === null || windV === null ? null : Math.hypot(windU, windV);
			const windDirectionDeg = windSpeedMs === null || windSpeedMs < 0.05
				? null
				: (Math.atan2(-windU, -windV) * 180 / Math.PI + 360) % 360;
			return {
				pressureHPa,
				pressureLevelIndex,
				source: 'pressure-level-legacy',
				heightM,
				temperatureC: temperatureK === null ? null : temperatureK - 273.15,
				dewPointC: dewPointK === null ? null : dewPointK - 273.15,
				relativeHumidityPct,
				windSpeedMs,
				windDirectionDeg,
				cloudPct: legacyValueAt(`cloud-${suffix}`, timeIndex, { min: 0, max: 100 }),
			};
		}).filter(Boolean).sort((a, b) => a.heightM - b.heightM);
		const surfaceTemperatureK = legacyValueAt('temp-surface', timeIndex, { min: 150, max: 330 });
		const surfaceDewPointK = legacyValueAt('dewpoint-surface', timeIndex, { min: 150, max: 330 });
		const surfaceWindU = legacyValueAt('wind_u-surface', timeIndex, { min: -150, max: 150 });
		const surfaceWindV = legacyValueAt('wind_v-surface', timeIndex, { min: -150, max: 150 });
		const surfaceWindSpeedMs = surfaceWindU === null || surfaceWindV === null ? null : Math.hypot(surfaceWindU, surfaceWindV);
		const surfaceWindDirectionDeg = surfaceWindSpeedMs === null || surfaceWindSpeedMs < 0.05
			? null
			: (Math.atan2(-surfaceWindU, -surfaceWindV) * 180 / Math.PI + 360) % 360;
		const surfaceLevel = Number.isFinite(modelElevationM) ? {
			pressureHPa: null,
			pressureLevelIndex: null,
			source: 'model-surface',
			heightM: modelElevationM,
			temperatureC: surfaceTemperatureK === null ? null : surfaceTemperatureK - 273.15,
			dewPointC: surfaceDewPointK === null ? null : surfaceDewPointK - 273.15,
			relativeHumidityPct: legacyValueAt('rh-surface', timeIndex, { min: 0, max: 100 }),
			windSpeedMs: surfaceWindSpeedMs,
			windDirectionDeg: surfaceWindDirectionDeg,
			cloudPct: legacyValueAt('cloud-surface', timeIndex, { min: 0, max: 100 }),
		} : null;
		return {
			timestampMs: timestampsMs[timeIndex],
			cloudBaseM: legacyValueAt('cloudBase', timeIndex, { min: -500, max: 20_000 }),
			surfaceLevel: surfaceLevel && ['temperatureC', 'dewPointC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct'].some(field => Number.isFinite(surfaceLevel[field])) ? surfaceLevel : null,
			surfaceVisibilityM: legacyValueAt('visibility', timeIndex, { min: 0, max: 200_000 })
				?? legacyValueAt('visibility-surface', timeIndex, { min: 0, max: 200_000 }),
			surfaceWeatherWarningCode: legacyValueAt('weatherwarnings', timeIndex, { min: 0, max: 200 })
				?? legacyValueAt('weatherwarnings-surface', timeIndex, { min: 0, max: 200 }),
			surfaceWindGustMs: legacyValueAt('windGust', timeIndex, { min: 0, max: 150 }),
			lowCloudPct: legacyValueAt('lclouds', timeIndex, { min: 0, max: 100 }),
			mediumCloudPct: legacyValueAt('mclouds', timeIndex, { min: 0, max: 100 }),
			highCloudPct: legacyValueAt('hclouds', timeIndex, { min: 0, max: 100 }),
			precipAmountMm: legacyValueAt('precipAmount', timeIndex, { min: 0, max: 2_000 }),
			precipSnowAmountMm: legacyValueAt('precipSnowAmount', timeIndex, { min: 0, max: 2_000 }),
			levels,
			frameIndex,
		};
	});
	const timeString = value => {
		if (typeof value === 'string' && value.trim()) return value.trim();
		const milliseconds = timestampToMilliseconds(value);
		return milliseconds === null ? null : new Date(milliseconds).toISOString();
	};
	const hasVerticalLayers = frames.some(frame => frame.levels.some(hasAnyProfileValue));
	const hasSurfaceData = frames.some(frame => frame.surfaceLevel !== null);
	const hasUsableData = hasVerticalLayers || hasSurfaceData;
	return {
		ok: hasUsableData,
		error: hasUsableData ? '' : `${LEGACY_PROFILE_SOURCE_LABEL}没有可用的高度层或近地面值`,
		hasVerticalLayers,
		hasSurfaceData,
		frames,
		timestampsMs: timeIndexes.map(index => timestampsMs[index]),
		pressureLevels,
		modelElevationM,
		servedModel,
		servedModelSource,
		requestedModel,
		updateTime: timeString(header.update),
		referenceTime: timeString(header.refTime),
		hasDirectCloud: frames.some(frame => frame.levels.some(level => level.cloudPct !== null)
			|| Number.isFinite(frame.surfaceLevel?.cloudPct)),
		dataSource: 'windy-legacy-meteogram',
		availableLevelNames: pressureLevels.map(level => `${level}h`),
		responseArrays,
	};
}

export function closestTimeIndex(timestampsMs, targetMs) {
	if (!Array.isArray(timestampsMs) || !timestampsMs.length) return -1;
	if (!Number.isFinite(targetMs)) return 0;
	let bestIndex = 0;
	let bestDistance = Infinity;
	for (let index = 0; index < timestampsMs.length; index += 1) {
		const distance = Math.abs(timestampsMs[index] - targetMs);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestIndex = index;
		}
	}
	return bestIndex;
}

export function nearestForecastTimestamp(timestampsMs, targetMs) {
	const index = closestTimeIndex(timestampsMs, targetMs);
	return index < 0 ? null : timestampsMs[index];
}

export function forecastIntervalHours(timestampsMs, targetMs) {
	if (!Array.isArray(timestampsMs) || timestampsMs.length < 2) return null;
	const index = closestTimeIndex(timestampsMs, targetMs);
	if (index < 0) return null;
	const previous = index > 0 ? timestampsMs[index] - timestampsMs[index - 1] : null;
	const next = index + 1 < timestampsMs.length ? timestampsMs[index + 1] - timestampsMs[index] : null;
	const intervalMs = Number.isFinite(previous) && previous > 0 ? previous
		: Number.isFinite(next) && next > 0 ? next : null;
	if (intervalMs === null) return null;
	const hours = intervalMs / 3_600_000;
	return Math.round(hours * 10) / 10;
}

export function frameAtTimestamp(frames, targetMs, toleranceMs = 1_000) {
	if (!Array.isArray(frames) || !frames.length || !Number.isFinite(targetMs)) return null;
	let bestFrame = null;
	let bestDistance = Infinity;
	for (const frame of frames) {
		const distance = Math.abs(frame.timestampMs - targetMs);
		if (distance < bestDistance) {
			bestFrame = frame;
			bestDistance = distance;
		}
	}
	return bestDistance <= toleranceMs ? bestFrame : null;
}

function profileLayersAdjacent(lower, upper) {
	// A trend needs a real vertical interval. Surface and pressure-level values
	// can occasionally share the same geopotential height; treating them as
	// adjacent creates a zero-width line and hides the isolated raw values.
	if (!Number.isFinite(lower?.heightM) || !Number.isFinite(upper?.heightM)
		|| upper.heightM <= lower.heightM) return false;
	if (lower?.source === 'model-surface' || upper?.source === 'model-surface') {
		return upper.heightM - lower.heightM <= 2_000;
	}
	return !Number.isFinite(lower?.pressureLevelIndex) || !Number.isFinite(upper?.pressureLevelIndex)
		|| Math.abs(upper.pressureLevelIndex - lower.pressureLevelIndex) === 1;
}

function diagnosticSourceLabel(profile) {
	return profile?.dataSource === 'windy-legacy-meteogram'
		? LEGACY_PROFILE_SOURCE_LABEL
		: profile?.dataSource === 'windy-point-forecast-v3'
			? 'Windy 点预报接口'
			: 'Windy 数据接口';
}

function responseArrayShapeLines(responseArrays) {
	return Object.entries(responseArrays && typeof responseArrays === 'object' ? responseArrays : {}).flatMap(([source, arrays]) => {
		if (!Array.isArray(arrays) || !arrays.length) return [];
		const fields = arrays.map(item => {
			const length = Number.isFinite(item?.length) ? item.length : 0;
			if (/^(?:ts|hours)$/i.test(item?.key ?? '')) return `${item.key}（时次数组长度 ${length}）`;
			const validCount = Number.isFinite(item?.validCount) ? item.validCount : 0;
			return `${item?.key ?? '未命名字段'}（数组长 ${length}，有效 ${validCount}）`;
		});
		return [source + '：' + fields.join('；')];
	});
}

function appendAlternateProfileDiagnostics(lines, alternatives) {
	if (!Array.isArray(alternatives)) return;
	for (const alternative of alternatives) {
		if (!alternative) continue;
		const model = alternative.servedModel || alternative.requestedModel || '未标注';
		lines.push('备用接口诊断：' + diagnosticSourceLabel(alternative) + '；模式 ' + String(model).toUpperCase()
			+ '；剖面状态 ' + (alternative.ok ? '存在可用天气值' : '无可用天气值')
			+ '；可识别预报时次 ' + (Array.isArray(alternative.timestampsMs) ? alternative.timestampsMs.length : 0) + ' 个');
		appendPointForecastGroupDiagnostics(lines, alternative);
		const fields = responseArrayShapeLines(alternative.responseArrays);
		lines.push(...(fields.length ? fields : ['备用接口未发现可诊断的响应数组字段。']));
	}
}

function appendPointForecastGroupDiagnostics(lines, profile) {
	if (profile?.dataSource !== 'windy-point-forecast-v3') return;
	const requestedIncludes = Array.isArray(profile.requestedIncludes) ? profile.requestedIncludes : null;
	lines.push('新版接口请求的 include：' + (requestedIncludes?.length ? requestedIncludes.join('、') : requestedIncludes ? '无' : '未记录'));
	const responseGroups = profile.responseGroups;
	if (!responseGroups || typeof responseGroups !== 'object') {
		lines.push('新版接口返回字段组：未记录');
		return;
	}
	const groups = ['data', 'header', 'celestial', 'summary', 'meteogram', 'airgram', 'sounding'];
	lines.push('新版接口实际返回字段组：' + groups.map(group => `${group} ${responseGroups[group] ? '有' : '未返回'}`).join('；'));
}

function unframedProfileDiagnosticSummary(profile) {
	const timestamps = Array.isArray(profile?.timestampsMs) ? profile.timestampsMs : [];
	const frames = Array.isArray(profile?.frames) ? profile.frames : [];
	const mode = profile?.servedModel || profile?.requestedModel || '未标注';
	const modelSource = profile?.servedModelSource === 'response'
		? 'Windy 响应标注'
		: profile?.servedModelSource === 'request' ? '按请求模式标注' : '未标注';
	const availableLevels = Array.isArray(profile?.availableLevelNames) ? profile.availableLevelNames : [];
	const lines = [
		'Windy 高空数据摘要（仅字段与能力信息，不含天气数值或坐标）',
		'数据来源：' + diagnosticSourceLabel(profile),
		'模式：' + String(mode).toUpperCase() + '（' + modelSource + '）',
		'剖面状态：无可用剖面帧',
		'错误状态：' + (profile?.error ? '请求或解析存在错误（详情见插件界面）' : '未取得可用天气剖面'),
		'可识别预报时次：' + timestamps.length + ' 个；解析帧：' + frames.length + ' 个',
		'Windy 声明的气压层：' + (availableLevels.length ? availableLevels.map(String).join('、') + '（层级元数据，不代表已有对应天气值）' : '未提供'),
	];
	appendPointForecastGroupDiagnostics(lines, profile);
	lines.push('响应字段形状与有效数量（不含原始值）：');
	const fields = responseArrayShapeLines(profile?.responseArrays);
	lines.push(...(fields.length ? fields : ['未发现可诊断的响应数组字段。']));
	appendAlternateProfileDiagnostics(lines, profile?.diagnosticAlternates);
	return lines.join('\n');
}

export function buildProfileDiagnosticSummary(profile, timestampMs, terrainElevationM = null) {
	if (!profile || !Array.isArray(profile.frames) || !profile.frames.length) {
		return unframedProfileDiagnosticSummary(profile);
	}
	const frameIndex = closestTimeIndex(profile.timestampsMs, timestampMs);
	const frame = profile.frames[frameIndex];
	if (!frame) return unframedProfileDiagnosticSummary(profile);
	const rawTimeIndex = Number.isInteger(frame.sourceTimeIndex) ? frame.sourceTimeIndex : frameIndex;

	const sourceLabel = diagnosticSourceLabel(profile);
	const model = profile.servedModel || profile.requestedModel || '未标注';
	const lines = [
		'Windy 高空数据摘要（不含天气数值）',
		'数据来源：' + sourceLabel,
		'模式：' + String(model).toUpperCase(),
		'模式标注来源：' + (profile.servedModelSource === 'response' ? 'Windy 响应' : profile.servedModelSource === 'request' ? '请求参数' : '未知'),
		'剖面状态：' + (profile.ok ? '存在可用天气值' : '当前响应未解析到可用天气值'),
		...(!profile.ok && profile.error ? ['错误状态：有（详情见插件界面）'] : []),
		'有效时次：' + new Date(frame.timestampMs).toISOString(),
		'Windy 声明的气压层：' + ((profile.availableLevelNames?.length ? profile.availableLevelNames : (profile.pressureLevels?.map(level => String(level) + 'h') ?? [])).join('、') || '无'),
		'本时次解析出带高度的气压层：' + (frame.levels?.length ?? 0) + ' 层',
	];
	appendPointForecastGroupDiagnostics(lines, profile);
	const sourceTimeAxes = ['data', 'header', 'meteogram', 'airgram', 'sounding'].flatMap(source => {
		const arrays = profile.responseArrays?.[source];
		if (!Array.isArray(arrays) || !arrays.length) return [];
		const timeArray = arrays.find(item => item.key === 'ts');
		const sourceIndex = frame.sourceTimeIndexes && Object.prototype.hasOwnProperty.call(frame.sourceTimeIndexes, source)
			? frame.sourceTimeIndexes[source]
			: rawTimeIndex;
		if (timeArray) {
			return [`${source} 时轴 ${timeArray.length} 时次，${sourceIndex === null ? '当前时次未匹配' : `匹配序号 ${sourceIndex + 1}/${timeArray.length}`}`];
		}
		return [`${source} 未返回独立时轴，沿用主时轴序号 ${rawTimeIndex + 1}`];
	});
	if (sourceTimeAxes.length) lines.push('各字段组时间对齐：' + sourceTimeAxes.join('；'));
	if (frame.timeAlignmentNotice) lines.push('时间轴警告：' + frame.timeAlignmentNotice);

	const levelFields = [
		['高度', 'gh'],
		['云量', 'cloud'],
		['云底高度', 'cloudBase'],
		['温度', 'temperature'],
		['体感温度', 'feelTemperature'],
		['气压', 'pressure'],
		['温度', 'temp'],
		['风速', 'wind'],
		['风向', 'windDir'],
		['低云量', 'lclouds'],
		['中云量', 'mclouds'],
		['高云量', 'hclouds'],
		['湿度', 'rh'],
		['露点', 'dewPoint'],
		['露点', 'dewpoint'],
		['风东向分量', 'wind_u'],
		['风北向分量', 'wind_v'],
		['阵风', 'windGust'],
		['阵风', 'gust'],
		['能见度', 'visibility'],
		['降水量', 'precipAmount'],
		['降雪量', 'precipSnowAmount'],
	];
	for (const [source, arrays] of Object.entries(profile.responseArrays ?? {})) {
		const fields = Array.isArray(arrays) ? arrays.filter(item => item.key !== 'ts') : [];
		if (!fields.length) continue;
		const groups = new Map();
		for (const item of fields) {
			const family = item.key.split('-')[0];
			if (!groups.has(family)) groups.set(family, []);
			groups.get(family).push(item);
		}
		const summary = levelFields.flatMap(([label, family]) => {
			const group = groups.get(family);
			if (!group?.length) return [];
			const sourceTimeIndex = frame.sourceTimeIndexes && Object.prototype.hasOwnProperty.call(frame.sourceTimeIndexes, source)
				? frame.sourceTimeIndexes[source]
				: rawTimeIndex;
			const currentValid = sourceTimeIndex === null ? 0 : group.filter(item => item.validAtTime?.[sourceTimeIndex]).length;
			const missing = group.filter(item => sourceTimeIndex === null || !item.validAtTime?.[sourceTimeIndex])
				.map(item => item.key.match(/-(\d+h|surface)$/i)?.[1] ?? '未分层');
			const shapeCounts = new Map();
			for (const item of group) shapeCounts.set(item.length, (shapeCounts.get(item.length) ?? 0) + 1);
			const shape = [...shapeCounts.entries()]
				.sort(([left], [right]) => right - left)
				.map(([length, count]) => `${length} 时次数组 ${count} 组`)
				.join('，');
			const displayLabel = source === 'data'
				? ({
					temperature: '地面温度',
					feelTemperature: '体感温度',
					pressure: '地面气压',
					wind: '地面风速',
					windDir: '地面风向',
					lclouds: '低云量',
					mclouds: '中云量',
					hclouds: '高云量',
					windGust: '地面阵风',
					visibility: '地面能见度',
					precipAmount: '地面降水量',
					precipSnowAmount: '地面降雪量',
				})[family] ?? label
				: label;
			return [displayLabel + ' ' + currentValid + '/' + group.length + ' 组字段有值（字段形状：' + shape + '）' + (missing.length ? '（空层：' + missing.join('、') + '）' : '')];
		});
		lines.push(source + '：' + summary.join('；'));
	}

	const allResponseArrays = Object.entries(profile.responseArrays ?? {}).flatMap(([source, arrays]) =>
		(Array.isArray(arrays) ? arrays : []).map(item => ({ source, ...item })));
	for (const [label, pattern] of [
		['逐层阵风字段', /^(?:windGust|gust)-\d+h$/i],
		['逐层能见度字段', /^visibility-\d+h$/i],
	]) {
		const found = allResponseArrays.filter(item => pattern.test(item.key));
		const details = found.length
			? found.map(item => {
				const sourceTimeIndex = frame.sourceTimeIndexes && Object.prototype.hasOwnProperty.call(frame.sourceTimeIndexes, item.source)
					? frame.sourceTimeIndexes[item.source]
					: rawTimeIndex;
				const validity = sourceTimeIndex === null ? '未匹配' : item.validAtTime?.[sourceTimeIndex] ? '有值' : '缺测';
				return `${item.source}/${item.key}（数组长 ${item.length}，当前时次${validity}）`;
			}).join('；')
			: '未发现';
		lines.push(label + '（只列响应字段，不代表已解析）：' + details);
	}

	const levels = levelsIncludingModelSurface(frame);
	const fields = [
		['温度', 'temperatureC'],
		['露点', 'dewPointC'],
		['相对湿度', 'relativeHumidityPct'],
		['风速', 'windSpeedMs'],
		['风向', 'windDirectionDeg'],
		['云量', 'cloudPct'],
	];
	lines.push('本时次已解析层数与连线能力（仅数量，不含天气值）：');
	for (const [label, field] of fields) {
		const valid = levels.filter(level => level.heightM >= 0 && level.heightM <= 9_000 && Number.isFinite(level[field]));
		const terrainKnown = Number.isFinite(terrainElevationM);
		const aboveTerrain = terrainKnown ? valid.filter(level => level.heightM >= terrainElevationM) : [];
		const belowTerrain = terrainKnown ? valid.filter(level => level.heightM < terrainElevationM) : [];
		const canDrawLine = levels.some((level, index) => {
			const next = levels[index + 1];
			const withinRange = next && level.heightM >= 0 && next.heightM <= 9_000
				&& (!terrainKnown || level.heightM >= terrainElevationM);
			return withinRange && Number.isFinite(level[field]) && Number.isFinite(next[field])
				&& profileLayersAdjacent(level, next);
		});
		const aboveTerrainRange = aboveTerrain.length
			? `（${Math.round(Math.min(...aboveTerrain.map(level => level.heightM)))}–${Math.round(Math.max(...aboveTerrain.map(level => level.heightM)))} 米）`
			: '';
		const terrainSummary = terrainKnown
			? `地形以上 ${aboveTerrain.length} 层${aboveTerrainRange}，地形以下 ${belowTerrain.length} 层`
			: '地形未知，无法区分地形以上/以下';
		const chart = buildAltitudeTrend(levels, field, terrainKnown ? terrainElevationM : null, 9_000);
		const trendSummary = canDrawLine
			? terrainKnown ? '可形成' : '可形成（地形过滤未确认）'
			: '不足以形成';
		const chartSummary = chart
			? `趋势线${trendSummary}；实际图表：${chart.points.length} 个有效点、${chart.segments.filter(segment => segment.length >= 2).length} 段实线`
			: `相邻层数据${canDrawLine ? '连续可用' : '不足'}；未单独绘制趋势图`;
		lines.push('- ' + label + '：0–9000 米内有效 ' + valid.length + ' 层；' + terrainSummary + '；' + chartSummary);
	}
	if (profile.verticalDataNotice) lines.push('接口说明：' + profile.verticalDataNotice);
	appendAlternateProfileDiagnostics(lines, profile.diagnosticAlternates);
	return lines.join('\n');
}

function uniqueAltitudeLevels(levels) {
	const ordered = [...levels].sort((a, b) => a.heightM - b.heightM);
	const repeated = new Set();
	for (let index = 1; index < ordered.length; index += 1) {
		if (Math.abs(ordered[index].heightM - ordered[index - 1].heightM) < 0.5) {
			repeated.add(ordered[index - 1]);
			repeated.add(ordered[index]);
		}
	}
	return ordered.filter(level => !repeated.has(level));
}

export function levelsIncludingModelSurface(frame) {
	return [...(frame?.levels ?? []), ...(frame?.surfaceLevel ? [frame.surfaceLevel] : [])]
		.filter(level => Number.isFinite(level.heightM))
		.sort((a, b) => a.heightM - b.heightM);
}

export function hasTrendableVerticalProfile(profile) {
	const fields = ['temperatureC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct'];
	return Boolean(profile?.frames?.some(frame => {
		const levels = levelsIncludingModelSurface(frame);
		return fields.some(field => levels.some((level, index) => {
			const next = levels[index + 1];
			return next && Number.isFinite(level[field]) && Number.isFinite(next[field])
				&& profileLayersAdjacent(level, next);
		}));
	}));
}

export function visibleProfileLevels(frame, terrainElevationM = null, maxHeightM = 9_000) {
	if (!frame?.levels) return [];
	return frame.levels.filter(level => level.heightM <= maxHeightM
		&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM));
}

export function nearestUsableProfileLevel(levels, targetHeightM, terrainElevationM = null, maxHeightM = 9_000) {
	if (!Array.isArray(levels) || !Number.isFinite(maxHeightM) || maxHeightM < 0) return null;
	const fields = ['temperatureC', 'dewPointC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct'];
	return levels
		.filter(level => Number.isFinite(level.heightM) && level.heightM >= 0 && level.heightM <= maxHeightM
			&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)
			&& fields.some(field => Number.isFinite(level[field])))
		.sort((a, b) => Number.isFinite(targetHeightM)
			? Math.abs(a.heightM - targetHeightM) - Math.abs(b.heightM - targetHeightM) || a.heightM - b.heightM
			: a.heightM - b.heightM)[0] ?? null;
}

export function resolveTerrainElevation(windyElevationM, modelElevationM, manualElevationM = null) {
	if (Number.isFinite(manualElevationM) && manualElevationM >= -1_000 && manualElevationM <= 20_000) {
		return { heightM: manualElevationM, source: 'manual' };
	}
	if (Number.isFinite(windyElevationM)) return { heightM: windyElevationM, source: 'windy' };
	if (Number.isFinite(modelElevationM)) return { heightM: modelElevationM, source: 'model' };
	return { heightM: null, source: null };
}

export function potentialIcingLevels(frame, terrainElevationM = null, maxHeightM = 9_000) {
	return (frame?.levels ?? []).filter(level => Number.isFinite(level.heightM)
		&& level.heightM >= 0 && level.heightM <= maxHeightM
		&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)
		&& Number.isFinite(level.temperatureC) && level.temperatureC <= 0
		&& ((Number.isFinite(level.cloudPct) && level.cloudPct > 0)
			|| (Number.isFinite(level.relativeHumidityPct) && level.relativeHumidityPct >= 90)))
		.map(level => ({
			...level,
			cloudSignal: Number.isFinite(level.cloudPct) && level.cloudPct > 0 ? 'direct-cloud' : 'high-humidity',
		}));
}

export function freezingLevelCrossings(frame, terrainElevationM = null, maxHeightM = 9_000) {
	const levels = levelsIncludingModelSurface(frame);
	const valid = level => Number.isFinite(level.heightM) && level.heightM >= 0 && level.heightM <= maxHeightM
		&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)
		&& Number.isFinite(level.temperatureC);
	const validLevelCount = levels.filter(valid).length;
	const heightsM = [];
	const addHeight = heightM => {
		if (!heightsM.some(existing => Math.abs(existing - heightM) < 0.5)) heightsM.push(heightM);
	};
	for (const level of levels) {
		if (valid(level) && level.temperatureC === 0) addHeight(level.heightM);
	}
	let validAdjacentPairCount = 0;
	for (let index = 1; index < levels.length; index += 1) {
		const lower = levels[index - 1];
		const upper = levels[index];
		if (!valid(lower) || !valid(upper) || !profileLayersAdjacent(lower, upper)) continue;
		validAdjacentPairCount += 1;
		if ((lower.temperatureC < 0 && upper.temperatureC > 0)
			|| (lower.temperatureC > 0 && upper.temperatureC < 0)) {
			const fraction = -lower.temperatureC / (upper.temperatureC - lower.temperatureC);
			addHeight(lower.heightM + (upper.heightM - lower.heightM) * fraction);
		}
	}
	return { heightsM: heightsM.sort((a, b) => a - b), validLevelCount, validAdjacentPairCount };
}

export function humidityCloudBands(frame, terrainElevationM = null, maxHeightM = 9_000, thresholdPct = 90) {
	const levels = uniqueAltitudeLevels([...(frame?.levels ?? [])]
		.filter(level => Number.isFinite(level.heightM)
			&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)));
	const bands = [];
	const crossingHeight = (a, b) => {
		const fraction = (thresholdPct - a.relativeHumidityPct) / (b.relativeHumidityPct - a.relativeHumidityPct);
		return a.heightM + fraction * (b.heightM - a.heightM);
	};
	let index = 0;
	while (index < levels.length) {
		if (!Number.isFinite(levels[index].relativeHumidityPct) || levels[index].relativeHumidityPct < thresholdPct) {
			index += 1;
			continue;
		}
		const startIndex = index;
		while (index + 1 < levels.length && Number.isFinite(levels[index + 1].relativeHumidityPct)
			&& levels[index + 1].relativeHumidityPct >= thresholdPct
			&& (!Number.isFinite(levels[index].pressureLevelIndex) || !Number.isFinite(levels[index + 1].pressureLevelIndex)
				|| Math.abs(levels[index + 1].pressureLevelIndex - levels[index].pressureLevelIndex) === 1)) index += 1;
		const endIndex = index;
		const first = levels[startIndex];
		const last = levels[endIndex];
		const previous = levels[startIndex - 1];
		const next = levels[endIndex + 1];
		const previousAdjacent = Boolean(previous && (!Number.isFinite(previous.pressureLevelIndex) || !Number.isFinite(first.pressureLevelIndex)
			|| Math.abs(previous.pressureLevelIndex - first.pressureLevelIndex) === 1));
		const nextAdjacent = Boolean(next && (!Number.isFinite(next.pressureLevelIndex) || !Number.isFinite(last.pressureLevelIndex)
			|| Math.abs(next.pressureLevelIndex - last.pressureLevelIndex) === 1));
		const lowerBoundaryKnown = Boolean(previousAdjacent && Number.isFinite(previous.relativeHumidityPct)
			&& previous.relativeHumidityPct < thresholdPct);
		const upperBoundaryKnown = Boolean(nextAdjacent && Number.isFinite(next.relativeHumidityPct)
			&& next.relativeHumidityPct < thresholdPct);
		const lowerEstimate = lowerBoundaryKnown
			? crossingHeight(previous, first)
			: previousAdjacent ? (previous.heightM + first.heightM) / 2
				: Math.max(0, first.heightM - ((next?.heightM ?? first.heightM + 500) - first.heightM) / 2);
		const upperEstimate = upperBoundaryKnown
			? crossingHeight(last, next)
			: nextAdjacent ? (last.heightM + next.heightM) / 2
				: last.heightM + (last.heightM - (previous?.heightM ?? last.heightM - 500)) / 2;
		const lowHeightM = Math.max(Number.isFinite(terrainElevationM) ? terrainElevationM : 0, lowerEstimate);
		const highHeightM = upperEstimate;
		if (highHeightM > lowHeightM) {
			bands.push({
				lowHeightM,
				highHeightM,
				extendsAboveMaxHeight: highHeightM > maxHeightM,
				extendsAboveChart: highHeightM > 9_000,
				lowerBoundaryKnown,
				upperBoundaryKnown,
				thresholdPct,
				source: 'humidity-heuristic',
			});
		}
		index = endIndex + 1;
	}
	return bands;
}

export function directCloudLayerBands(frame, terrainElevationM = null) {
	const levels = uniqueAltitudeLevels([...(frame?.levels ?? [])]
		.filter(level => Number.isFinite(level.heightM)
			&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)));
	const adjacent = (lower, upper) => Number.isFinite(lower?.heightM) && Number.isFinite(upper?.heightM)
		&& upper.heightM > lower.heightM
		&& (!Number.isFinite(lower.pressureLevelIndex) || !Number.isFinite(upper.pressureLevelIndex)
			|| Math.abs(lower.pressureLevelIndex - upper.pressureLevelIndex) === 1);
	const isCloudLayer = level => Number.isFinite(level.cloudPct) && level.cloudPct > 0;
	const bands = [];
	let index = 0;
	while (index < levels.length) {
		if (!isCloudLayer(levels[index])) {
			index += 1;
			continue;
		}
		const firstIndex = index;
		while (index + 1 < levels.length && isCloudLayer(levels[index + 1]) && adjacent(levels[index], levels[index + 1])) index += 1;
		const lastIndex = index;
		const first = levels[firstIndex];
		const last = levels[lastIndex];
		const previous = levels[firstIndex - 1];
		const next = levels[lastIndex + 1];
		const previousAdjacent = Boolean(previous && adjacent(previous, first));
		const nextAdjacent = Boolean(next && adjacent(last, next));
		const lowerBoundaryKnown = Boolean(previousAdjacent && Number.isFinite(previous.cloudPct) && previous.cloudPct === 0);
		const upperBoundaryKnown = Boolean(nextAdjacent && Number.isFinite(next.cloudPct) && next.cloudPct === 0);
		const lowerSpacing = previousAdjacent ? first.heightM - previous.heightM
			: nextAdjacent ? next.heightM - first.heightM : 500;
		const upperSpacing = nextAdjacent ? next.heightM - last.heightM
			: previousAdjacent ? last.heightM - previous.heightM : 500;
		const lowHeightM = Math.max(Number.isFinite(terrainElevationM) ? terrainElevationM : 0,
			previousAdjacent ? (previous.heightM + first.heightM) / 2 : first.heightM - lowerSpacing / 2);
		const highHeightM = last.heightM + (nextAdjacent ? next.heightM - last.heightM : upperSpacing) / 2;
		if (highHeightM > lowHeightM) {
			const cloudValues = levels.slice(firstIndex, lastIndex + 1).map(level => level.cloudPct);
			bands.push({
				lowHeightM,
				highHeightM,
				lowerBoundaryKnown,
				upperBoundaryKnown,
				thicknessM: lowerBoundaryKnown && upperBoundaryKnown ? highHeightM - lowHeightM : null,
				peakCloudPct: Math.max(...cloudValues),
				levelCount: lastIndex - firstIndex + 1,
				source: 'model-cloud-layer-estimate',
			});
		}
		index = lastIndex + 1;
	}
	return bands;
}

function scalarAtHeight(levels, targetHeightM, field) {
	const ordered = levels.filter(level => Number.isFinite(level.heightM))
		.sort((a, b) => a.heightM - b.heightM);
	const exact = ordered.find(level => Math.abs(level.heightM - targetHeightM) < 0.5);
	if (exact) return Number.isFinite(exact[field])
		? { value: exact[field], method: 'direct', lower: exact, upper: exact }
		: { value: null, method: 'unavailable', lower: null, upper: null };
	for (let index = 1; index < ordered.length; index += 1) {
		const lower = ordered[index - 1];
		const upper = ordered[index];
		const adjacentLayers = profileLayersAdjacent(lower, upper);
		if (adjacentLayers && Number.isFinite(lower[field]) && Number.isFinite(upper[field])
			&& lower.heightM < targetHeightM && targetHeightM < upper.heightM) {
			const fraction = (targetHeightM - lower.heightM) / (upper.heightM - lower.heightM);
			return { value: lower[field] + (upper[field] - lower[field]) * fraction, method: 'interpolated', lower, upper };
		}
	}
	return { value: null, method: 'unavailable', lower: null, upper: null };
}

function windComponents(level) {
	if (!Number.isFinite(level?.windSpeedMs) || !Number.isFinite(level?.windDirectionDeg)) return null;
	const direction = level.windDirectionDeg * Math.PI / 180;
	return {
		u: -level.windSpeedMs * Math.sin(direction),
		v: -level.windSpeedMs * Math.cos(direction),
	};
}

function interpolateWind(levels, targetHeightM) {
	const ordered = levels.filter(level => Number.isFinite(level.heightM)).sort((a, b) => a.heightM - b.heightM);
	const exact = ordered.find(level => Math.abs(level.heightM - targetHeightM) < 0.5);
	if (exact) return windComponents(exact)
		? { speedMs: exact.windSpeedMs, directionDeg: exact.windDirectionDeg, method: 'direct' }
		: { speedMs: null, directionDeg: null, method: 'unavailable' };
	for (let index = 1; index < ordered.length; index += 1) {
		const lower = ordered[index - 1];
		const upper = ordered[index];
		const adjacentLayers = profileLayersAdjacent(lower, upper);
		if (adjacentLayers && windComponents(lower) && windComponents(upper)
			&& lower.heightM < targetHeightM && targetHeightM < upper.heightM) {
			const fraction = (targetHeightM - lower.heightM) / (upper.heightM - lower.heightM);
			const low = windComponents(lower);
			const high = windComponents(upper);
			const u = low.u + (high.u - low.u) * fraction;
			const v = low.v + (high.v - low.v) * fraction;
			const speedMs = Math.hypot(u, v);
			const directionDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
			return { speedMs, directionDeg, method: 'interpolated' };
		}
	}
	return { speedMs: null, directionDeg: null, method: 'unavailable' };
}

export function interpolateAtHeight(frame, targetHeightM, terrainElevationM = null) {
	if (!Number.isFinite(targetHeightM)) return { ok: false, reason: 'invalid-height' };
	if (Number.isFinite(terrainElevationM) && targetHeightM < terrainElevationM) return { ok: false, reason: 'below-terrain' };
	const levels = levelsIncludingModelSurface(frame).filter(level => !Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM);
	const temperature = scalarAtHeight(levels, targetHeightM, 'temperatureC');
	const dewPoint = scalarAtHeight(levels, targetHeightM, 'dewPointC');
	const humidity = scalarAtHeight(levels, targetHeightM, 'relativeHumidityPct');
	const cloud = scalarAtHeight(levels, targetHeightM, 'cloudPct');
	const wind = interpolateWind(levels, targetHeightM);
	const hasBracket = [temperature, dewPoint, humidity, cloud].some(value => value.method !== 'unavailable') || wind.method !== 'unavailable';
	return {
		ok: hasBracket,
		reason: hasBracket ? null : 'no-bracketing-levels',
		heightM: targetHeightM,
		temperatureC: temperature.value,
		dewPointC: dewPoint.value,
		humidityPct: humidity.value,
		cloudPct: cloud.value,
		windSpeedMs: wind.speedMs,
		windDirectionDeg: wind.directionDeg,
		methods: { temperature: temperature.method, dewPoint: dewPoint.method, humidity: humidity.method, cloud: cloud.method, wind: wind.method },
	};
}

export function assessCloudAtHeight(result, bands, targetHeightM, directCloudBaseM = null, unitSystem = 'metric') {
	const formatHeight = value => {
		const display = heightToDisplay(value, unitSystem);
		return display === null ? '—' : `${Math.round(display)} ${heightUnit(unitSystem)}`;
	};
	if (result?.reason === 'below-terrain') return { kind: 'insufficient', text: '查询高度低于地形' };
	if (!Number.isFinite(targetHeightM)) return { kind: 'insufficient', text: '查询海拔无效，无法判断云区关系' };
	const inHumidityBand = (bands ?? []).some(band => targetHeightM >= band.lowHeightM && targetHeightM <= band.highHeightM);
	const humidAtThreshold = Number.isFinite(result?.humidityPct) && result.humidityPct >= 90;
	const directCloud = Number.isFinite(result?.cloudPct) ? result.cloudPct : null;
	const belowCloudBase = Number.isFinite(directCloudBaseM) && targetHeightM < directCloudBaseM;
	const hasConflictingSignal = inHumidityBand || humidAtThreshold || (directCloud !== null && directCloud > 0);
	if ((belowCloudBase || directCloud === 0) && hasConflictingSignal) {
		return { kind: 'uncertain', text: '直接云底／逐层云量与高湿估算信号不一致，无法确认是否处于云中' };
	}
	if (inHumidityBand) {
		return { kind: 'possible', text: '查询高度位于相对湿度≥90%的可能云区；这是高湿启发式估算' };
	}
	if (humidAtThreshold) {
		return { kind: 'uncertain', text: '湿度达到 90%，但相邻有效层不足以确认可能云区边界' };
	}
	if (directCloud !== null && directCloud > 0) {
		return { kind: 'possible', text: `该高度附近模式层云量 ${Math.round(directCloud)}%，有模式云信号；不等于该地点的云中实况观测` };
	}
	if (belowCloudBase) {
		return { kind: 'outside', text: `查询海拔低于 Windy 直接云底 ${formatHeight(directCloudBaseM)}；云顶字段未返回` };
	}
	if (directCloud === 0) return { kind: 'outside', text: '该高度附近模式层云量为 0%；这不保证实况无云' };
	if (Number.isFinite(directCloudBaseM)) {
		return { kind: 'uncertain', text: `查询海拔高于 Windy 直接云底 ${formatHeight(directCloudBaseM)}，但云顶及该高度云层信号缺测，无法确认是否入云` };
	}
	if (Number.isFinite(result?.humidityPct)) return { kind: 'outside', text: '未识别到高湿可能云区；这不等于无云' };
	return { kind: 'insufficient', text: '该高度没有足够的垂直湿度或云量数据，无法判断云区关系' };
}

export function buildRouteTargetSummaries(samples, timestampMs, targetAltitudeM, unitSystem = 'metric') {
	return (samples ?? []).map((sample, index) => {
		const terrain = sample?.terrainSource === 'manual' && Number.isFinite(sample?.terrainElevationM)
			? { heightM: sample.terrainElevationM, source: 'manual' }
			: resolveTerrainElevation(sample?.terrainElevationM ?? null, sample?.profile?.modelElevationM ?? null);
		const frame = frameAtTimestamp(sample?.profile?.frames, timestampMs);
		const targetMslM = Number.isFinite(targetAltitudeM) && targetAltitudeM >= 0 ? targetAltitudeM : null;
		const weather = frame
			? interpolateAtHeight(frame, targetMslM, terrain.heightM)
			: {
				ok: false,
				reason: 'no-forecast',
				temperatureC: null,
				dewPointC: null,
				humidityPct: null,
				cloudPct: null,
				windSpeedMs: null,
				windDirectionDeg: null,
				methods: { temperature: 'unavailable', dewPoint: 'unavailable', humidity: 'unavailable', cloud: 'unavailable', wind: 'unavailable' },
			};
		const possibleCloudBands = humidityCloudBands(frame, terrain.heightM, 9_000);
		return {
			index,
			key: sample?.key ?? `${sample?.lat ?? 'unknown'}-${sample?.lon ?? 'unknown'}`,
			name: sample?.name ?? `分析点 ${index + 1}`,
			lat: Number.isFinite(sample?.lat) ? sample.lat : null,
			lon: Number.isFinite(sample?.lon) ? sample.lon : null,
			distanceM: Number.isFinite(sample?.distanceM) ? sample.distanceM : null,
			error: sample?.error ?? null,
			hasForecast: Boolean(sample?.profile?.ok && frame),
			terrainElevationM: terrain.heightM,
			terrainSource: terrain.source,
			targetHeightMsl: targetMslM,
			weather,
			freezingLevels: freezingLevelCrossings(frame, terrain.heightM, 9_000),
			cloudAssessment: assessCloudAtHeight(weather, possibleCloudBands, targetMslM, frame?.cloudBaseM, unitSystem),
			cloudBaseM: frame?.cloudBaseM ?? null,
			surfaceVisibilityM: frame?.surfaceVisibilityM ?? null,
			precipAmountMm: frame?.precipAmountMm ?? null,
			precipSnowAmountMm: frame?.precipSnowAmountMm ?? null,
		};
	});
}

export function sampleAltitudeRange(startHeightM, endHeightM, stepM = 250) {
	if (!Number.isFinite(startHeightM) || !Number.isFinite(endHeightM) || !Number.isFinite(stepM)
		|| startHeightM < 0 || endHeightM < startHeightM || stepM <= 0) return [];
	const intervalCount = Math.floor((endHeightM - startHeightM) / stepM) + 1;
	const lastIntervalHeightM = startHeightM + (intervalCount - 1) * stepM;
	const count = intervalCount + (lastIntervalHeightM < endHeightM ? 1 : 0);
	if (count > 401) return [];
	const samples = Array.from({ length: intervalCount }, (_, index) => startHeightM + index * stepM);
	if (lastIntervalHeightM < endHeightM) samples.push(endHeightM);
	return samples;
}

export function buildAltitudeTrend(levels, field, terrainElevationM = null, maxHeightM = 9_000, width = 720, height = 300) {
	const supportedFields = new Set(['temperatureC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct']);
	if (!supportedFields.has(field) || !Number.isFinite(maxHeightM) || maxHeightM <= 0) return null;
	const pad = { left: 62, right: 18, top: 24, bottom: 42 };
	const plot = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };
	const sortedLevels = [...(levels ?? [])].sort((a, b) => {
		const aHasHeight = Number.isFinite(a.heightM);
		const bHasHeight = Number.isFinite(b.heightM);
		if (!aHasHeight && !bHasHeight) return 0;
		if (!aHasHeight) return 1;
		if (!bHasHeight) return -1;
		return a.heightM - b.heightM;
	});
	const allValues = sortedLevels
		.filter(level => Number.isFinite(level.heightM) && level.heightM >= 0 && level.heightM <= maxHeightM
			&& Number.isFinite(level[field]));
	const belowTerrainValues = Number.isFinite(terrainElevationM)
		? allValues.filter(level => level.heightM < terrainElevationM)
		: [];
	const belowTerrainPointCount = belowTerrainValues.length;
	const values = allValues.filter(level => !Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM);
	let domainMin = 0;
	let domainMax = 100;
	if (field === 'temperatureC') {
		if (allValues.length) {
			domainMin = Math.floor(Math.min(...allValues.map(level => level[field])) / 10) * 10;
			domainMax = Math.ceil(Math.max(...allValues.map(level => level[field])) / 10) * 10;
			if (domainMax - domainMin < 10) domainMax = domainMin + 10;
		} else {
			domainMin = -80;
			domainMax = 40;
		}
	} else if (field === 'windSpeedMs') {
		domainMax = allValues.length
			? Math.max(5, Math.ceil(Math.max(0, ...allValues.map(level => level[field])) / 5) * 5)
			: 50;
	} else if (field === 'relativeHumidityPct') {
		// Relative humidity has a fixed physical range; keep it comparable across locations and times.
		domainMax = 100;
	} else if (field === 'cloudPct' && allValues.length) {
		domainMax = Math.max(10, Math.min(100, Math.ceil(Math.max(...allValues.map(level => level[field])) / 10) * 10));
	}
	const x = altitudeM => plot.left + altitudeM / maxHeightM * (plot.right - plot.left);
	const y = value => plot.bottom - (value - domainMin) / (domainMax - domainMin) * (plot.bottom - plot.top);
	const points = values.map(level => ({ heightM: level.heightM, value: level[field], source: level.source ?? 'pressure-level', pressureHPa: level.pressureHPa,
		pressureLevelIndex: level.pressureLevelIndex, x: x(level.heightM), y: y(level[field]) }));
	const hasRepeatedHeights = new Set(values.map(level => level.heightM)).size < values.length;
	const referencePoints = allValues.map(level => ({ heightM: level.heightM, value: level[field], source: level.source ?? 'pressure-level', pressureHPa: level.pressureHPa,
		pressureLevelIndex: level.pressureLevelIndex, belowTerrain: Number.isFinite(terrainElevationM) && level.heightM < terrainElevationM,
		x: x(level.heightM), y: y(level[field]) }));
	const referenceSegments = [];
	let referenceSegment = [];
	for (const point of referencePoints) {
		const previous = referenceSegment.at(-1);
		if (previous && !profileLayersAdjacent(previous, point)) {
			referenceSegments.push(referenceSegment);
			referenceSegment = [];
		}
		referenceSegment.push(point);
	}
	if (referenceSegment.length) referenceSegments.push(referenceSegment);
	const paths = [];
	let segment = [];
	let pointIndex = 0;
	for (const level of sortedLevels) {
		const valid = Number.isFinite(level.heightM) && level.heightM >= 0 && level.heightM <= maxHeightM
			&& (!Number.isFinite(terrainElevationM) || level.heightM >= terrainElevationM)
			&& Number.isFinite(level[field]);
		if (valid) {
			const point = points[pointIndex++];
			const previous = segment.at(-1);
			if (previous && !profileLayersAdjacent(previous, point)) {
				paths.push(segment);
				segment = [];
			}
			segment.push(point);
		} else if (segment.length) {
			paths.push(segment);
			segment = [];
		}
	}
	if (segment.length) paths.push(segment);
	const path = paths.filter(group => group.length >= 2)
		.map(group => group.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')).join(' ');
	const referencePath = referenceSegments.filter(group => group.length >= 2)
		.map(group => group.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')).join(' ');
	const isolatedPoints = paths.filter(group => group.length === 1).flat();
	const valueTicks = Array.from({ length: 5 }, (_, index) => domainMin + (domainMax - domainMin) * index / 4);
	const altitudeTicks = Array.from({ length: 5 }, (_, index) => maxHeightM * index / 4);
	return { plot, x, y, path, points, segments: paths, referencePath, referencePoints, referenceSegments,
		isolatedPoints, valueTicks, altitudeTicks, domainMin, domainMax, maxHeightM, chartWidth: width, belowTerrainPointCount, hasRepeatedHeights };
}

export function altitudeAtChartX(x, plot, maxHeightM = 9_000, stepM = 50) {
	if (!Number.isFinite(x) || !Number.isFinite(plot?.left) || !Number.isFinite(plot?.right)
		|| plot.right <= plot.left || !Number.isFinite(maxHeightM) || maxHeightM <= 0
		|| !Number.isFinite(stepM) || stepM <= 0) return null;
	const fraction = Math.max(0, Math.min(1, (x - plot.left) / (plot.right - plot.left)));
	return Math.max(0, Math.min(maxHeightM, Math.round((fraction * maxHeightM) / stepM) * stepM));
}

export function altitudeAfterSliderKey(currentAltitudeM, key, maxHeightM = 9_000, stepM = 50) {
	if (!Number.isFinite(currentAltitudeM) || !Number.isFinite(maxHeightM) || maxHeightM <= 0
		|| !Number.isFinite(stepM) || stepM <= 0) return null;
	const current = Math.max(0, Math.min(maxHeightM, currentAltitudeM));
	let next;
	switch (key) {
		case 'ArrowLeft':
		case 'ArrowDown': next = current - stepM; break;
		case 'ArrowRight':
		case 'ArrowUp': next = current + stepM; break;
		case 'PageDown': next = current - stepM * 10; break;
		case 'PageUp': next = current + stepM * 10; break;
		case 'Home': next = 0; break;
		case 'End': next = maxHeightM; break;
		default: return null;
	}
	return Math.max(0, Math.min(maxHeightM, Math.round(next / stepM) * stepM));
}

export function altitudeTrendValueAt(geometry, altitudeM) {
	if (!geometry || !Number.isFinite(altitudeM)) return null;
	for (const segment of geometry.segments ?? []) {
		for (const point of segment) {
			if (Math.abs(point.heightM - altitudeM) < 0.5) return point.value;
		}
		for (let index = 1; index < segment.length; index += 1) {
			const lower = segment[index - 1];
			const upper = segment[index];
			if (lower.heightM < altitudeM && altitudeM < upper.heightM) {
				const fraction = (altitudeM - lower.heightM) / (upper.heightM - lower.heightM);
				return lower.value + (upper.value - lower.value) * fraction;
			}
		}
	}
	return null;
}

export function buildRouteTerrainOverlay(samples, geometry) {
	if (!Array.isArray(samples) || !geometry || typeof geometry.x !== 'function' || typeof geometry.y !== 'function' || !geometry.plot) {
		return { line: '', area: '', highest: null, count: 0 };
	}
	const ordered = [...samples].sort((a, b) => a.distanceM - b.distanceM);
	const segments = [];
	let segment = [];
	const valid = [];
	const terrainPoints = [];
	for (const sample of ordered) {
		if (Number.isFinite(sample.distanceM) && Number.isFinite(sample.elevationM) && sample.elevationM >= 0) {
			const point = { ...sample, x: geometry.x(sample.distanceM), y: geometry.y(sample.elevationM) };
			terrainPoints.push(point);
			if (sample.elevationM <= geometry.maxHeightM) {
				segment.push(point);
				valid.push(point);
			} else if (segment.length) {
				if (segment.length > 1) segments.push(segment);
				segment = [];
			}
		} else if (segment.length) {
			if (segment.length > 1) segments.push(segment);
			segment = [];
		}
	}
	if (segment.length > 1) segments.push(segment);
	const line = segments.map(points => points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')).join(' ');
	const area = segments.map(points => {
		const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
		return `${path} L${points.at(-1).x.toFixed(1)},${geometry.plot.bottom} L${points[0].x.toFixed(1)},${geometry.plot.bottom} Z`;
	}).join(' ');
	const highest = terrainPoints.reduce((result, point) => !result || point.elevationM > result.elevationM ? point : result, null);
	return { line, area, highest, count: valid.length };
}

export function buildRouteTargetLine(samples, geometry, targetHeightM) {
	if (!Array.isArray(samples) || !geometry || typeof geometry.x !== 'function' || typeof geometry.y !== 'function'
		|| !Number.isFinite(geometry.maxHeightM) || !Number.isFinite(targetHeightM)) return { line: '', points: [], segments: [] };
	const ordered = [...samples].sort((a, b) => a.distanceM - b.distanceM);
	const points = [];
	const segments = [];
	let segment = [];
	for (let sampleIndex = 0; sampleIndex < ordered.length; sampleIndex += 1) {
		const sample = ordered[sampleIndex];
		const altitudeM = targetHeightM;
		if (!Number.isFinite(sample.distanceM) || !Number.isFinite(altitudeM) || altitudeM < 0 || altitudeM > geometry.maxHeightM) {
			if (segment.length) segments.push(segment);
			segment = [];
			continue;
		}
		const point = { sampleIndex, distanceM: sample.distanceM, altitudeM,
			x: geometry.x(sample.distanceM), y: geometry.y(altitudeM) };
		points.push(point);
		segment.push(point);
	}
	if (segment.length) segments.push(segment);
	const line = segments.filter(group => group.length >= 2)
		.map(group => group.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')).join(' ');
	return { line, points, segments };
}

export function buildRouteFreezingMarks(samples, timestampMs, geometry) {
	if (!Array.isArray(samples) || !geometry || typeof geometry.x !== 'function' || typeof geometry.y !== 'function') return [];
	const ordered = [...samples].sort((a, b) => a.distanceM - b.distanceM);
	return ordered.flatMap((sample, sampleIndex) => {
		const frame = frameAtTimestamp(sample?.profile?.frames, timestampMs);
		const terrain = Number.isFinite(sample?.terrainElevationM) ? sample.terrainElevationM
			: Number.isFinite(sample?.profile?.modelElevationM) ? sample.profile.modelElevationM : null;
		if (!frame || !Number.isFinite(sample?.distanceM) || !Number.isFinite(terrain)) return [];
		return freezingLevelCrossings(frame, terrain, geometry.maxHeightM ?? 9_000).heightsM.map((heightM, crossingIndex) => ({
			sampleIndex,
			name: sample.name ?? `分析点 ${sampleIndex + 1}`,
			distanceM: sample.distanceM,
			heightM,
			x: geometry.x(sample.distanceM),
			y: geometry.y(heightM),
			crossingIndex,
		}));
	});
}

export function summarizeRouteSurfaceWindGust(samples, timestampMs) {
	const ordered = [...(samples ?? [])].sort((a, b) => a.distanceM - b.distanceM);
	const available = ordered.flatMap((sample, sampleIndex) => {
		const frame = frameAtTimestamp(sample.profile?.frames, timestampMs);
		return Number.isFinite(sample.distanceM) && Number.isFinite(frame?.surfaceWindGustMs)
			? [{ sampleIndex, key: sample.key ?? `${sample.distanceM}-${sampleIndex}`, name: sample.name ?? `分析点 ${sampleIndex + 1}`,
				distanceM: sample.distanceM, gustMs: frame.surfaceWindGustMs }]
			: [];
	});
	const maximum = available.reduce((best, item) => !best || item.gustMs > best.gustMs ? item : best, null);
	return { available, maximum, availableCount: available.length, totalCount: ordered.length };
}

export function buildRoutePrecipitationGeometry(samples, profileGeometry, width = 640, height = 120) {
	if (!Array.isArray(samples) || !profileGeometry || typeof profileGeometry.x !== 'function') {
		return { marks: [], plot: null, maxMm: 0 };
	}
	const ordered = [...samples].sort((a, b) => a.distanceM - b.distanceM);
	const pad = { top: 12, bottom: 26 };
	const plot = {
		left: profileGeometry.plot?.left ?? 42,
		right: profileGeometry.plot?.right ?? width - 12,
		top: pad.top,
		bottom: height - pad.bottom,
	};
	const maxMm = Math.max(0, ...ordered.flatMap(sample => [sample.amountMm, sample.snowMm])
		.filter(value => Number.isFinite(value)));
	const scaleMaxMm = Math.max(1, maxMm);
	const y = valueMm => plot.bottom - Math.max(0, valueMm) / scaleMaxMm * (plot.bottom - plot.top);
	const centers = ordered.map(sample => profileGeometry.x(sample.distanceM));
	const marks = ordered.map((sample, index) => {
		const left = index === 0 ? plot.left : (centers[index - 1] + centers[index]) / 2;
		const right = index === ordered.length - 1 ? plot.right : (centers[index] + centers[index + 1]) / 2;
		const slotWidth = Math.max(1, right - left);
		const barWidth = Math.max(1.5, Math.min(12, slotWidth * 0.28));
		const amountMm = finiteOrNull(sample.amountMm, { min: 0, max: 2_000 });
		const snowMm = finiteOrNull(sample.snowMm, { min: 0, max: 2_000 });
		return {
			key: sample.key ?? `${sample.distanceM}-${index}`,
			name: sample.name ?? `分析点 ${index + 1}`,
			distanceM: sample.distanceM,
			x: centers[index],
			width: barWidth,
			amountMm,
			snowMm,
			totalY: amountMm === null ? plot.bottom : y(amountMm),
			totalHeight: amountMm === null ? 0 : plot.bottom - y(amountMm),
			snowY: snowMm === null ? plot.bottom : y(snowMm),
			snowHeight: snowMm === null ? 0 : plot.bottom - y(snowMm),
			available: amountMm !== null || snowMm !== null,
		};
	});
	return { marks, plot, maxMm, scaleMaxMm };
}

export function formatWindDirection(degrees) {
	if (!Number.isFinite(degrees)) return '—';
	const normalized = ((degrees % 360) + 360) % 360;
	const labels = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
	const index = Math.round(normalized / 45) % 8;
	return `${labels[index]} ${Math.round(normalized) % 360}°`;
}

export function windFlowRotationDeg(windFromDirectionDeg) {
	if (!Number.isFinite(windFromDirectionDeg)) return null;
	return ((windFromDirectionDeg + 90) % 360 + 360) % 360;
}

export function formatForecastTime(timestampMs, timeZone = 'Asia/Shanghai') {
	if (!Number.isFinite(timestampMs)) return '时刻未知';
	return new Intl.DateTimeFormat('zh-CN', {
		timeZone,
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(new Date(timestampMs));
}

export function buildVerticalChartPoints(levels, terrainElevationM = null, maxHeightM = 9_000, width = 280, height = 250) {
	const visible = visibleProfileLevels({ levels }, terrainElevationM, maxHeightM);
	const modelVisible = [...(levels ?? [])].filter(level => Number.isFinite(level.heightM)
		&& level.heightM >= 0 && level.heightM <= maxHeightM);
	const pad = { left: 108, right: 15, top: 14, bottom: 24 };
	const plotHeight = height - pad.top - pad.bottom;
	const plotWidth = width - pad.left - pad.right;
	const x = temperatureC => pad.left + (Math.max(-60, Math.min(30, temperatureC)) + 60) / 90 * plotWidth;
	const y = altitudeM => pad.top + (maxHeightM - altitudeM) / maxHeightM * plotHeight;
	const tempSegments = [];
	let segment = [];
	for (const level of visible) {
		if (Number.isFinite(level.temperatureC)) segment.push({ x: x(level.temperatureC), y: y(level.heightM), level });
		else if (segment.length) { tempSegments.push(segment); segment = []; }
	}
	if (segment.length) tempSegments.push(segment);
	const temperaturePath = tempSegments.filter(points => points.length > 1)
		.map(points => points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '))
		.join(' ');
	return {
		visible,
		modelVisible,
		temperaturePath,
		plot: { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom },
		x,
		y,
		cloudX: 50,
		cloudWidth: 42,
	};
}

const CROSS_SECTION_FIELDS = {
	cloud: 'cloudPct',
	humidity: 'relativeHumidityPct',
	temperature: 'temperatureC',
	wind: 'windSpeedMs',
	thickness: null,
};

export function buildCrossSectionGeometry(samples, timestampMs, variable = 'cloud', maxHeightM = 9_000, width = 640, height = 640, horizontalMode = 'samples') {
	const field = Object.prototype.hasOwnProperty.call(CROSS_SECTION_FIELDS, variable)
		? CROSS_SECTION_FIELDS[variable]
		: CROSS_SECTION_FIELDS.cloud;
	const ordered = [...(samples ?? [])].sort((a, b) => a.distanceM - b.distanceM);
	const pad = { left: 74, right: 24, top: 40, bottom: 48 };
	const plot = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };
	const plotWidth = plot.right - plot.left;
	const plotHeight = plot.bottom - plot.top;
	const maxDistanceM = Math.max(1, ordered.at(-1)?.distanceM ?? 1);
	const x = distanceM => plot.left + distanceM / maxDistanceM * plotWidth;
	const y = altitudeM => plot.top + (maxHeightM - altitudeM) / maxHeightM * plotHeight;
	const weatherColumnWidth = Math.max(4, Math.min(36, plotWidth / Math.max(1, ordered.length - 1) * 0.12));
	const centers = ordered.map(sample => x(sample.distanceM));
	const cells = [];
	const levelMarks = [];
	const sampleMarks = [];
	const possibleCloudBands = [];
	const directCloudBands = [];
	for (let sampleIndex = 0; sampleIndex < ordered.length; sampleIndex += 1) {
		const sample = ordered[sampleIndex];
		const sampleLeft = sampleIndex === 0 ? plot.left : (centers[sampleIndex - 1] + centers[sampleIndex]) / 2;
		const sampleRight = sampleIndex === ordered.length - 1 ? plot.right : (centers[sampleIndex] + centers[sampleIndex + 1]) / 2;
		// In estimated coverage mode each point represents its nearest half-interval.
		// Keep missing points in the planned grid so no neighbour fills their region.
		const estimatedCoverage = horizontalMode === 'nearest' && ordered.length > 1;
		const columnX = estimatedCoverage ? sampleLeft : Math.max(plot.left, centers[sampleIndex] - weatherColumnWidth / 2);
		const columnWidth = estimatedCoverage ? Math.max(0, sampleRight - sampleLeft)
			: Math.max(1, Math.min(plot.right, centers[sampleIndex] + weatherColumnWidth / 2) - columnX);
		const frame = frameAtTimestamp(sample.profile?.frames, timestampMs);
		const terrainSource = sample.terrainSource === 'manual' && Number.isFinite(sample.terrainElevationM) ? '手动校正海拔' : Number.isFinite(sample.terrainElevationM) ? 'Windy 地形接口' : Number.isFinite(sample.profile?.modelElevationM) ? '模式地形' : null;
		const terrain = Number.isFinite(sample.terrainElevationM) ? sample.terrainElevationM : Number.isFinite(sample.profile?.modelElevationM) ? sample.profile.modelElevationM : null;
		const eligible = levelsIncludingModelSurface(frame).filter(level => level.heightM <= maxHeightM
			&& (!Number.isFinite(terrain) || level.heightM >= terrain)) ?? [];
		if (!eligible.length) {
			cells.push({ sampleIndex, x: columnX, y: plot.top, width: columnWidth, height: plotHeight, value: null, missing: true, pressureHPa: null });
		} else {
			for (let levelIndex = 0; levelIndex < eligible.length; levelIndex += 1) {
				const level = eligible[levelIndex];
				const previous = eligible[levelIndex - 1];
				const next = eligible[levelIndex + 1];
				const adjacent = profileLayersAdjacent;
				const previousAdjacent = previous && adjacent(previous, level);
				const nextAdjacent = next && adjacent(level, next);
				const low = Math.max(terrain ?? 0, previousAdjacent ? (previous.heightM + level.heightM) / 2
					: nextAdjacent ? level.heightM - (next.heightM - level.heightM) / 2 : level.heightM);
				const high = Math.min(maxHeightM, nextAdjacent ? (level.heightM + next.heightM) / 2
					: previousAdjacent ? level.heightM + (level.heightM - previous.heightM) / 2 : level.heightM);
				levelMarks.push({ sampleIndex, x: centers[sampleIndex], y: y(level.heightM), heightM: level.heightM,
					value: field ? level[field] : null, missing: field ? !Number.isFinite(level[field]) : false,
					pressureHPa: level.pressureHPa, source: level.source });
				if (high <= low) continue;
				const value = level[field];
				cells.push({
					sampleIndex,
					x: columnX,
					y: y(high),
					width: columnWidth,
					height: Math.max(1, y(low) - y(high)),
					value: Number.isFinite(value) ? value : null,
					missing: !Number.isFinite(value),
					pressureHPa: level.pressureHPa,
					source: level.source,
					lowHeightM: low,
					highHeightM: high,
				});
			}
		}
		for (const band of humidityCloudBands(frame, terrain, maxHeightM)) {
			const visibleLowM = Math.max(0, band.lowHeightM);
			const visibleHighM = Math.min(maxHeightM, band.highHeightM);
			if (visibleHighM <= visibleLowM) continue;
			possibleCloudBands.push({
				sampleIndex,
				x: columnX,
				y: y(visibleHighM),
				width: columnWidth,
				height: Math.max(1, y(visibleLowM) - y(visibleHighM)),
				extendsAboveChart: band.highHeightM > maxHeightM,
				band: {
					...band,
					thicknessM: band.lowerBoundaryKnown && band.upperBoundaryKnown
						? band.highHeightM - band.lowHeightM
						: null,
				},
			});
		}
		for (const band of directCloudLayerBands(frame, terrain)) {
			const visibleLowM = Math.max(0, band.lowHeightM);
			const visibleHighM = Math.min(maxHeightM, band.highHeightM);
			if (visibleHighM <= visibleLowM) continue;
			directCloudBands.push({
				sampleIndex,
				x: columnX,
				y: y(visibleHighM),
				width: columnWidth,
				height: Math.max(1, y(visibleLowM) - y(visibleHighM)),
				visibleLowM,
				visibleHighM,
				extendsAboveChart: band.highHeightM > maxHeightM,
				band,
			});
		}
		const isFirstSample = sampleIndex === 0;
		const isLastSample = sampleIndex === ordered.length - 1;
		sampleMarks.push({
			sampleIndex,
			x: centers[sampleIndex],
			left: sampleLeft,
			labelX: isFirstSample ? centers[sampleIndex] + 5 : isLastSample ? centers[sampleIndex] - 5 : centers[sampleIndex],
			labelAnchor: isFirstSample ? 'start' : isLastSample ? 'end' : 'middle',
			width: Math.max(1, sampleRight - sampleLeft),
			distanceM: sample.distanceM,
			terrainElevationM: terrain,
			terrainSource,
			name: sample.name ?? `分析点 ${sampleIndex + 1}`,
		});
	}
	const terrainSegments = [];
	let terrainSegment = [];
	for (const mark of sampleMarks) {
		if (Number.isFinite(mark.terrainElevationM)) terrainSegment.push(`${terrainSegment.length ? 'L' : 'M'}${mark.x.toFixed(1)},${y(mark.terrainElevationM).toFixed(1)}`);
		else if (terrainSegment.length) {
			if (terrainSegment.length > 1) terrainSegments.push(terrainSegment.join(' '));
			terrainSegment = [];
		}
	}
	if (terrainSegment.length > 1) terrainSegments.push(terrainSegment.join(' '));
	return {
		cells,
		levelMarks,
		possibleCloudBands,
		directCloudBands,
		sampleMarks,
		terrainPath: terrainSegments.join(' '),
		plot,
		width,
		height,
		x,
		y,
		maxHeightM,
		maxDistanceM,
		field,
		horizontalMode,
	};
}
