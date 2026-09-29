import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildVerticalChartPoints,
	buildAltitudeTrend,
	altitudeAtChartX,
	altitudeAfterSliderKey,
	altitudeTrendValueAt,
	assessCloudAtHeight,
	buildRoutePrecipitationGeometry,
	buildRouteTargetSummaries,
	buildRouteTargetLine,
	buildRouteFreezingMarks,
	buildRouteTerrainOverlay,
	buildCrossSectionGeometry,
	attachRequestedModel,
	directCloudLayerBands,
	closestTimeIndex,
	nearestForecastTimestamp,
	buildProfileDiagnosticSummary,
	forecastIntervalHours,
	frameAtTimestamp,
	freezingLevelCrossings,
	hasTrendableVerticalProfile,
	formatForecastTime,
	formatWindDirection,
	windFlowRotationDeg,
	interpolateAtHeight,
	levelsIncludingModelSurface,
	nearestUsableProfileLevel,
	humidityCloudBands,
	parseWindyProfile,
	parseWindyLegacyProfile,
	potentialIcingLevels,
	profileProvenance,
	profileMatchesRequestedModel,
	resolveTerrainElevation,
	sampleAltitudeRange,
	summarizeRouteSurfaceWindGust,
	visibleProfileLevels,
} from '../src/lib/profile.js';

function makePayload() {
	return {
		data: {
			status: 'success',
			celestial: {},
			summary: [],
			data: { ts: [1_790_000_000, 1_790_010_800], temperature: [285, 284], wind: [3, 4], windGust: [14, 18], visibility: [25_000, 12_500], lclouds: [20, 30], mclouds: [40, 50], hclouds: [60, 70], precipAmount: [1.5, 0], precipSnowAmount: [0.2, 0] },
			header: { modelElevation: 1800, model: 'ecmwf', update: '2026-09-24T00:00:00Z', refTime: '2026-09-23T18:00:00Z' },
			meteogram: {
				ts: [1_790_000_000, 1_790_010_800],
				cloudBase: [2400, 2450],
				'gh-850h': [1500, 1510], 'gh-700h': [3000, 3020], 'gh-500h': [5500, 5530],
				'cloud-850h': [80, 70], 'cloud-700h': [40, 50], 'cloud-500h': [10, 20],
			},
			airgram: {
				ts: [1_790_000_000, 1_790_010_800],
				'temp-850h': [275, 274], 'temp-700h': [260, 259], 'temp-500h': [245, 244],
				'wind-850h': [10, 12], 'wind-700h': [15, 17], 'wind-500h': [20, 22],
				'windDir-850h': [359, 1], 'windDir-700h': [90, 90], 'windDir-500h': [180, 180],
			},
			sounding: {
				ts: [1_790_000_000, 1_790_010_800],
				'temp-850h': [275, 274], 'temp-700h': [260, 259], 'temp-500h': [245, 244],
				'wind-850h': [10, 12], 'wind-700h': [15, 17], 'wind-500h': [20, 22],
				'windDir-850h': [359, 1], 'windDir-700h': [90, 90], 'windDir-500h': [180, 180],
				'rh-850h': [85, 82], 'rh-700h': [70, 72], 'rh-500h': [45, 48],
				'dewPoint-850h': [270, 269], 'dewPoint-700h': [250, 249], 'dewPoint-500h': [230, 229],
			},
		},
	};
}

test('parses Windy HttpPayload and optional pressure-level blocks', () => {
	const result = parseWindyProfile(makePayload());
	assert.equal(result.ok, true);
	assert.equal(result.modelElevationM, 1800);
	assert.deepEqual(result.pressureLevels, [850, 700, 500]);
	assert.equal(result.frames.length, 2);
	assert.equal(result.frames[0].levels[0].heightM, 1500);
	assert.equal(result.frames[0].levels[0].temperatureC, 275 - 273.15);
	assert.equal(result.frames[0].levels[0].relativeHumidityPct, 85);
	assert.equal(result.frames[0].levels[0].dewPointC, 270 - 273.15);
	assert.equal(result.frames[0].levels[0].cloudPct, 80);
	assert.equal(result.frames[0].cloudBaseM, 2400);
	assert.equal(result.frames[0].precipAmountMm, 1.5);
	assert.equal(result.frames[0].precipSnowAmountMm, 0.2);
	assert.equal(result.frames[0].surfaceVisibilityM, 25_000);
	assert.equal(result.frames[0].surfaceWindGustMs, 14);
	assert.deepEqual([result.frames[0].lowCloudPct, result.frames[0].mediumCloudPct, result.frames[0].highCloudPct], [20, 40, 60]);
	assert.equal(result.servedModel, 'ecmwf');
	assert.equal(result.servedModelSource, 'response');
	assert.equal(result.dataSource, 'windy-point-forecast-v3');
	assert.equal(result.updateTime, '2026-09-24T00:00:00Z');
	assert.equal(result.referenceTime, '2026-09-23T18:00:00Z');
	assert.equal(result.frames[0].levels[0].windDirectionDeg, 359);
	assert.equal(result.frames[0].precipAmountMm, 1.5);
});

test('aligns each response group by its own timestamps and preserves the full main forecast timeline', () => {
	const payload = makePayload();
	const [firstTime, secondTime] = payload.data.data.ts;
	payload.data.meteogram.ts = [secondTime, firstTime];
	payload.data.meteogram['gh-850h'] = [1510, 1500];
	payload.data.airgram.ts = [secondTime];
	payload.data.airgram['wind-850h'] = [17];
	payload.data.sounding['wind-850h'] = [null, null];

	const profile = parseWindyProfile(payload);
	assert.equal(profile.frames.length, 2, 'a shorter optional time axis must not truncate the main forecast');
	const first850 = profile.frames[0].levels.find(level => level.pressureHPa === 850);
	const second850 = profile.frames[1].levels.find(level => level.pressureHPa === 850);
	assert.equal(first850.heightM, 1500, 'reordered meteogram values must match their timestamps');
	assert.equal(first850.windSpeedMs, null, 'the missing airgram timestamp must remain missing');
	assert.equal(second850.heightM, 1510);
	assert.equal(second850.windSpeedMs, 17);
	assert.deepEqual(profile.frames.map(frame => frame.sourceTimeIndexes.airgram), [null, 0]);
	assert.match(profile.frames[0].timeAlignmentNotice, /温度和风字段未包含当前预报时次/);
	assert.equal(profile.frames[1].timeAlignmentNotice, '');

	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[0], 1_000);
	assert.match(summary, /airgram 时轴 1 时次，当前时次未匹配/);
	assert.match(summary, /时间轴警告：Windy 的温度和风字段未包含当前预报时次/);
	assert.match(summary, /airgram：温度 0\/3 组字段有值/);
	assert.doesNotMatch(summary, /(?:^|\D)17(?:\D|$)/);
});

test('copies field validity and trend capability diagnostics without forecast values', () => {
	const profile = parseWindyProfile(makePayload());
	profile.requestedModel = 'ecmwf';
	profile.requestedIncludes = ['header', 'celestial', 'summary', 'meteogram', 'airgram', 'sounding'];
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[0], 1_000);
	assert.match(summary, /新版接口请求的 include：header、celestial、summary、meteogram、airgram、sounding/);
	assert.match(summary, /新版接口实际返回字段组：data 有；header 有；celestial 有；summary 有；meteogram 有；airgram 有；sounding 有/);
	assert.match(summary, /Windy 声明的气压层：850h、700h、500h/);
	assert.match(summary, /meteogram：高度 3\/3 组字段有值（字段形状：2 时次数组 3 组）/);
	assert.match(summary, /airgram：温度 3\/3 组字段有值/);
	assert.match(summary, /data：.*地面阵风 1\/1 组字段有值/);
	assert.match(summary, /data：.*地面能见度 1\/1 组字段有值/);
	assert.match(summary, /逐层阵风字段（只列响应字段，不代表已解析）：未发现/);
	assert.match(summary, /逐层能见度字段（只列响应字段，不代表已解析）：未发现/);
	assert.match(summary, /温度：0–9000 米内有效 4 层；地形以上 4 层（1500–5500 米），地形以下 0 层；趋势线可形成/);
	assert.match(summary, /露点：0–9000 米内有效 3 层；地形以上 3 层（1500–5500 米），地形以下 0 层；相邻层数据连续可用；未单独绘制趋势图/);
	assert.match(summary, /风向：0–9000 米内有效 3 层；地形以上 3 层（1500–5500 米），地形以下 0 层；相邻层数据连续可用；未单独绘制趋势图/);
	assert.doesNotMatch(summary, /(?:露点|风向)：.*实际图表：0 个有效点/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:275|260|245)(?:\D|$)/);
});

test('diagnostics report the exact trend segments drawn for the selected vertical profile', () => {
	const timestampMs = Date.parse('2026-09-28T06:00:00.000Z');
	const levels = [500, 1_000, 1_500, 2_000, 2_400, 2_800, 2_953, 4_100, 5_200, 6_400, 7_639, 9_500, 11_000, 14_000]
		.map((heightM, pressureLevelIndex) => ({
			heightM,
			pressureHPa: 1_000 - pressureLevelIndex * 50,
			pressureLevelIndex,
			temperatureC: 11.234 - pressureLevelIndex,
			dewPointC: 2.345 - pressureLevelIndex,
			relativeHumidityPct: 47.123 + pressureLevelIndex,
			windSpeedMs: 8.765 + pressureLevelIndex,
			windDirectionDeg: 180,
			cloudPct: pressureLevelIndex * 3,
		}));
	const profile = {
		ok: true,
		dataSource: 'windy-point-forecast-v3',
		servedModel: 'ecmwf',
		servedModelSource: 'response',
		frames: [{ timestampMs, sourceTimeIndex: 0, levels }],
		timestampsMs: [timestampMs],
		availableLevelNames: [],
	};

	const summary = buildProfileDiagnosticSummary(profile, timestampMs, 2_900);
	assert.match(summary, /温度：0–9000 米内有效 11 层；地形以上 5 层（2953–7639 米），地形以下 6 层；趋势线可形成；实际图表：5 个有效点、1 段实线/);
	assert.match(summary, /露点：0–9000 米内有效 11 层；地形以上 5 层（2953–7639 米），地形以下 6 层；相邻层数据连续可用；未单独绘制趋势图/);
	assert.match(summary, /风向：0–9000 米内有效 11 层；地形以上 5 层（2953–7639 米），地形以下 6 层；相邻层数据连续可用；未单独绘制趋势图/);
	assert.match(summary, /相对湿度：0–9000 米内有效 11 层；地形以上 5 层（2953–7639 米），地形以下 6 层；趋势线可形成；实际图表：5 个有效点、1 段实线/);
	assert.doesNotMatch(summary, /11\.234|47\.123|8\.765/);
});

test('parses a 14-layer Windy sounding and builds the four requested chart lines', () => {
	const timestampMs = Date.parse('2026-09-28T06:00:00.000Z');
	const timestamps = Array.from({ length: 15 }, (_, index) => timestampMs / 1_000 - 12 * 3_600 + index * 3 * 3_600);
	const pressureLayers = [
		{ pressure: 1_000, height: 100 }, { pressure: 950, height: 500 },
		{ pressure: 925, height: 1_000 }, { pressure: 900, height: 1_500 },
		{ pressure: 850, height: 2_000 }, { pressure: 800, height: 2_500 },
		{ pressure: 700, height: 2_953 }, { pressure: 600, height: 4_100 },
		{ pressure: 500, height: 5_200 }, { pressure: 400, height: 6_400 },
		{ pressure: 300, height: 7_639 }, { pressure: 250, height: 9_500 },
		{ pressure: 200, height: 11_000 }, { pressure: 150, height: 14_000 },
	];
	const valuesAtTime = value => timestamps.map((_, index) => value + index / 10);
	const heights = Object.fromEntries(pressureLayers.map(({ pressure, height }) => [`gh-${pressure}h`, valuesAtTime(height)]));
	const soundingFields = Object.fromEntries(pressureLayers.flatMap(({ pressure }, index) => [
		[`temp-${pressure}h`, valuesAtTime(285 - index * 6)],
		[`dewPoint-${pressure}h`, valuesAtTime(280 - index * 6)],
		[`rh-${pressure}h`, valuesAtTime(70 + index)],
		[`wind-${pressure}h`, valuesAtTime(4 + index)],
		[`windDir-${pressure}h`, valuesAtTime((350 + index * 3) % 360)],
		[`cloud-${pressure}h`, valuesAtTime(index * 4)],
	]));
	const profile = parseWindyProfile({
		data: {
			data: { ts: timestamps },
			header: { model: 'ecmwf', modelElevation: 1_800, availableLevels: pressureLayers.map(({ pressure }) => `${pressure}h`) },
			meteogram: { ts: timestamps, ...heights, cloudBase: valuesAtTime(2_800) },
			airgram: { ts: timestamps },
			sounding: { ts: timestamps, ...soundingFields },
		},
	});
	const frame = frameAtTimestamp(profile.frames, timestampMs);
	assert.equal(frame.levels.length, 14);
	for (const field of ['temperatureC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct']) {
		const chart = buildAltitudeTrend(levelsIncludingModelSurface(frame), field, 2_953, 9_000);
		assert.equal(chart.points.length, 5, `${field} should retain all five above-terrain samples`);
		assert.deepEqual(chart.segments.map(segment => segment.length), [5], `${field} should render one continuous line`);
		assert.ok(chart.path.startsWith('M') && chart.path.includes('L'), `${field} should produce an SVG path`);
	}
	const summary = buildProfileDiagnosticSummary(profile, timestampMs, 2_953);
	assert.match(summary, /匹配序号 5\/15/);
	assert.match(summary, /温度：0–9000 米内有效 11 层；地形以上 5 层（2953–7639 米），地形以下 6 层；趋势线可形成；实际图表：5 个有效点、1 段实线/);
});

test('aligns ICON profile fields across the reported 13-time, 15-field response shape', () => {
	const timestampMs = Date.parse('2026-09-28T06:00:00.000Z');
	const timestamps = Array.from({ length: 13 }, (_, index) => timestampMs / 1_000 - 3_600 + index * 3_600);
	const pressureLayers = [
		{ pressure: 1_000, height: 100 }, { pressure: 950, height: 500 },
		{ pressure: 925, height: 1_000 }, { pressure: 900, height: 1_500 },
		{ pressure: 850, height: 2_000 }, { pressure: 800, height: 2_500 },
		{ pressure: 700, height: 2_841 }, { pressure: 600, height: 4_100 },
		{ pressure: 500, height: 5_200 }, { pressure: 400, height: 6_400 },
		{ pressure: 300, height: 7_498 }, { pressure: 250, height: 9_500 },
		{ pressure: 200, height: 11_000 }, { pressure: 150, height: 14_000 },
	];
	const valuesAtTime = value => timestamps.map((_, index) => value + index / 10);
	const pressureFields = Object.fromEntries(pressureLayers.flatMap(({ pressure, height }, index) => [
		[`gh-${pressure}h`, valuesAtTime(height)],
		[`temp-${pressure}h`, valuesAtTime(285 - index * 6)],
		[`dewPoint-${pressure}h`, valuesAtTime(280 - index * 6)],
		[`rh-${pressure}h`, valuesAtTime(70 + index)],
		[`wind-${pressure}h`, valuesAtTime(4 + index)],
		[`windDir-${pressure}h`, valuesAtTime((350 + index * 3) % 360)],
		[`cloud-${pressure}h`, valuesAtTime(index * 4)],
	]));
	const airgramFields = Object.fromEntries(pressureLayers.flatMap(({ pressure }, index) => [
		[`temp-${pressure}h`, valuesAtTime(285 - index * 6)],
		[`wind-${pressure}h`, valuesAtTime(4 + index)],
		[`windDir-${pressure}h`, valuesAtTime((350 + index * 3) % 360)],
	]));
	const profile = parseWindyProfile({
		data: {
			data: { ts: timestamps },
			header: { model: 'icon', modelElevation: 2_700, availableLevels: pressureLayers.map(({ pressure }) => `${pressure}h`) },
			meteogram: {
				ts: timestamps,
				...Object.fromEntries(pressureLayers.map(({ pressure, height }) => [`gh-${pressure}h`, valuesAtTime(height)])),
				...Object.fromEntries(pressureLayers.map(({ pressure }, index) => [`cloud-${pressure}h`, valuesAtTime(index * 4)])),
				'gh-surface': timestamps.map(() => null),
				'cloud-surface': valuesAtTime(0),
				cloudBase: timestamps.map(() => null),
			},
			airgram: { ts: timestamps, ...airgramFields },
			sounding: {
				ts: timestamps,
				...pressureFields,
				'gh-surface': timestamps.map(() => null),
				'temp-surface': valuesAtTime(285),
				'dewPoint-surface': valuesAtTime(280),
				'rh-surface': valuesAtTime(70),
				'wind-surface': valuesAtTime(4),
				'windDir-surface': valuesAtTime(350),
				'cloud-surface': valuesAtTime(0),
			},
		},
	});
	const frame = frameAtTimestamp(profile.frames, timestampMs);
	assert.equal(profile.servedModel, 'icon');
	assert.equal(frame.sourceTimeIndexes.data, 1);
	for (const source of ['meteogram', 'airgram', 'sounding']) assert.equal(frame.sourceTimeIndexes[source], 1);
	for (const field of ['temperatureC', 'relativeHumidityPct', 'windSpeedMs', 'cloudPct']) {
		const chart = buildAltitudeTrend(levelsIncludingModelSurface(frame), field, 2_841, 9_000);
		assert.equal(chart.points.length, 5, `${field} should retain the five levels above model terrain`);
		assert.deepEqual(chart.segments.map(segment => segment.length), [5]);
		assert.ok(chart.path.startsWith('M') && chart.path.includes('L'));
		assert.equal(chart.x(0), chart.plot.left, 'the altitude axis should start at 0m');
		assert.equal(chart.x(9_000), chart.plot.right, 'the altitude axis should end at 9000m');
		assert.equal(chart.points[0].heightM, 2_841.1, 'terrain-below levels should not become valid weather points');
		assert.equal(chart.points.at(-1).heightM, 7_498.1, 'no value should be invented up to 9000m');
		assert.equal(altitudeTrendValueAt(chart, 9_000), null, 'uncovered chart edges must remain unavailable');
	}
	const summary = buildProfileDiagnosticSummary(profile, timestampMs, 2_841);
	assert.match(summary, /data 时轴 13 时次，匹配序号 2\/13/);
	assert.match(summary, /meteogram 时轴 13 时次，匹配序号 2\/13/);
	assert.match(summary, /sounding 时轴 13 时次，匹配序号 2\/13/);
	assert.match(summary, /meteogram：高度 14\/15 组字段有值（字段形状：13 时次数组 15 组）（空层：surface）/);
	assert.match(summary, /云量 15\/15 组字段有值/);
	assert.match(summary, /实际图表：5 个有效点、1 段实线/);
});

test('distinguishes requested v3 groups that Windy omitted from groups returned as empty objects', () => {
	const payload = makePayload();
	delete payload.data.airgram;
	payload.data.meteogram = {};
	const profile = parseWindyProfile(payload);
	profile.requestedIncludes = ['meteogram', 'airgram', 'sounding'];
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[0], 1_000);
	assert.match(summary, /新版接口请求的 include：meteogram、airgram、sounding/);
	assert.match(summary, /新版接口实际返回字段组：data 有；header 有；celestial 有；summary 有；meteogram 有；airgram 未返回；sounding 有/);
	assert.doesNotMatch(summary, /^meteogram：/m);
	assert.doesNotMatch(summary, /(?:^|\D)(?:285|275|260|245)(?:\D|$)/);
});

test('diagnostics retain response field evidence when timestamps exist but no weather values are usable', () => {
	const payload = makePayload();
	for (const source of [payload.data.data, payload.data.meteogram, payload.data.airgram, payload.data.sounding]) {
		for (const [key, values] of Object.entries(source)) {
			if (key !== 'ts' && !/^gh-/i.test(key) && Array.isArray(values)) source[key] = values.map(() => null);
		}
	}
	const profile = parseWindyProfile(payload);
	assert.equal(profile.ok, false);
	assert.equal(profile.frames.length, 2);
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[0], 1_000);
	assert.match(summary, /剖面状态：当前响应未解析到可用天气值/);
	assert.match(summary, /错误状态：有（详情见插件界面）/);
	assert.match(summary, /data：.*地面温度 0\/1 组字段有值（字段形状：2 时次数组 1 组）/);
	assert.match(summary, /meteogram：高度 3\/3 组字段有值（字段形状：2 时次数组 3 组）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:275|260|245|25_000)(?:\D|$)/);
});

test('diagnostics expose field names and shapes when the response has no usable forecast timestamps', () => {
	const payload = makePayload();
	payload.data.data.ts = [];
	payload.data.header.availableLevels = ['850h', '700h', '500h'];
	const profile = parseWindyProfile(payload);
	assert.equal(profile.ok, false);
	assert.equal(profile.responseArrays.data.find(item => item.key === 'temperature').validCount, 2);
	const summary = buildProfileDiagnosticSummary(profile, null);
	assert.match(summary, /模式：ECMWF（Windy 响应标注）/);
	assert.match(summary, /可识别预报时次：0 个；解析帧：0 个/);
	assert.match(summary, /Windy 声明的气压层：850h、700h、500h（层级元数据，不代表已有对应天气值）/);
	assert.match(summary, /data：.*ts（时次数组长度 0）.*temperature（数组长 2，有效 2）.*wind（数组长 2，有效 2）/);
	assert.match(summary, /airgram：.*temp-850h（数组长 2，有效 2）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:285|275|260|245|1790000000)(?:\D|$)/);
});

test('diagnostics support a failed request with no parsed response profile', () => {
	const summary = buildProfileDiagnosticSummary({
		ok: false,
		error: 'Windy 请求未返回可解析的天气剖面',
		dataSource: 'windy-point-forecast-v3',
		requestedModel: 'icon',
		servedModelSource: 'unknown',
		frames: [],
		timestampsMs: [],
		responseArrays: {},
	}, null);
	assert.match(summary, /模式：ICON（未标注）/);
	assert.match(summary, /剖面状态：无可用剖面帧/);
	assert.match(summary, /请求或解析存在错误/);
	assert.match(summary, /未发现可诊断的响应数组字段/);
});

test('diagnostics use the selected forecast index and expose array lengths without values', () => {
	const payload = makePayload();
	payload.data.meteogram['gh-700h'][1] = null;
	payload.data.airgram['temp-700h'][1] = null;
	payload.data.airgram['temp-500h'][1] = null;
	const profile = parseWindyProfile(payload);
	profile.requestedModel = 'ecmwf';
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[1], 1_000);
	assert.match(summary, /meteogram：高度 2\/3 组字段有值（字段形状：2 时次数组 3 组）（空层：700h）/);
	assert.match(summary, /airgram：温度 1\/3 组字段有值（字段形状：2 时次数组 3 组）（空层：700h、500h）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:274|259|244)(?:\D|$)/);
});

test('diagnostics do not claim every layer is above terrain when terrain is unavailable', () => {
	const profile = parseWindyProfile(makePayload());
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[0]);
	assert.match(summary, /温度：0–9000 米内有效 4 层；地形未知，无法区分地形以上\/以下；趋势线可形成（地形过滤未确认）/);
});

test('diagnostics reveal unexpected vertical gust and visibility arrays without parsing them as values', () => {
	const payload = makePayload();
	const [firstTime, secondTime] = payload.data.data.ts;
	payload.data.airgram.ts = [secondTime, firstTime];
	payload.data.airgram['windGust-700h'] = [9, null];
	payload.data.sounding.ts = [secondTime, firstTime];
	payload.data.sounding['visibility-700h'] = [20_000, null];
	const profile = parseWindyProfile(payload);
	const summary = buildProfileDiagnosticSummary(profile, profile.timestampsMs[1], 1_000);
	assert.match(summary, /逐层阵风字段（只列响应字段，不代表已解析）：airgram\/windGust-700h（数组长 2，当前时次有值）/);
	assert.match(summary, /逐层能见度字段（只列响应字段，不代表已解析）：sounding\/visibility-700h（数组长 2，当前时次有值）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:9|20_000)(?:\D|$)/);

	payload.data.airgram.ts = [secondTime];
	payload.data.airgram['windGust-700h'] = [null];
	const unmatchedSummary = buildProfileDiagnosticSummary(parseWindyProfile(payload), profile.timestampsMs[0], 1_000);
	assert.match(unmatchedSummary, /airgram\/windGust-700h（数组长 1，当前时次未匹配）/);
});

test('provenance distinguishes Windy response models from request-only model labels', () => {
	assert.deepEqual(profileProvenance({ dataSource: 'windy-point-forecast-v3', servedModel: 'ecmwf', servedModelSource: 'response' }), {
		source: 'Windy 点预报接口',
		model: 'Windy 响应返回 ECMWF',
	});
	assert.deepEqual(profileProvenance({ dataSource: 'windy-legacy-meteogram', servedModel: 'icon', servedModelSource: 'request' }), {
		source: 'Windy 旧版兼容逐层接口（官方标记弃用）',
		model: '请求模式 ICON（Windy 响应未标注模式名）',
	});
	assert.deepEqual(profileProvenance(null), {
		source: 'Windy 数据接口',
		model: '模式信息未读取',
	});
});

test('uses the requested model when Windy omits the response label, but rejects a different explicit model', () => {
	const unlabeled = attachRequestedModel({
		ok: true,
		dataSource: 'windy-point-forecast-v3',
		servedModel: null,
		servedModelSource: 'unknown',
	}, 'icon');
	assert.equal(unlabeled.servedModel, 'icon');
	assert.equal(unlabeled.servedModelSource, 'request');
	assert.equal(profileMatchesRequestedModel(unlabeled, 'icon'), true);
	assert.deepEqual(profileProvenance(unlabeled), {
		source: 'Windy 点预报接口',
		model: '请求模式 ICON（Windy 响应未标注模式名）',
	});

	const responseMismatch = attachRequestedModel({
		ok: true,
		dataSource: 'windy-point-forecast-v3',
		servedModel: 'ecmwf-hres',
		servedModelSource: 'response',
	}, 'icon');
	assert.equal(responseMismatch.servedModel, 'ecmwf-hres');
	assert.equal(responseMismatch.servedModelSource, 'response');
	assert.equal(profileMatchesRequestedModel(responseMismatch, 'icon'), false);
	assert.equal(profileMatchesRequestedModel(responseMismatch, 'ecmwf'), true);
});

test('does not call geopotential-only levels usable vertical weather data', () => {
	const payload = makePayload();
	for (const source of [payload.data.data, payload.data.meteogram, payload.data.airgram, payload.data.sounding]) {
		for (const [key, values] of Object.entries(source)) {
			if (key !== 'ts' && !/^gh-/i.test(key) && Array.isArray(values)) source[key] = values.map(() => null);
		}
	}
	const result = parseWindyProfile(payload);
	assert.equal(result.hasVerticalLayers, false);
	assert.equal(result.hasSurfaceData, false);
	assert.equal(result.ok, false);
	assert.equal(result.frames[0].levels.length, 3);
});

test('parses Windy legacy meteogram levels only at returned geopotential heights', () => {
	const result = parseWindyLegacyProfile({
		status: 200,
		data: {
			header: { modelElevation: 4_800, refTime: '2026-09-24T00:00:00Z', update: '2026-09-24T03:00:00Z' },
			data: {
				hours: [1_790_000_000, 1_790_010_800],
				'gh-surface': [null, null],
				'gh-700h': [3_100, 3_120], 'gh-500h': [5_600, 5_630], 'gh-300h': [9_200, 9_240],
				'temp-700h': [270, 268], 'temp-500h': [250, 248], 'temp-300h': [230, 228],
				'dewpoint-700h': [265, 263], 'rh-700h': [85, 82], 'rh-500h': [45, 48], 'rh-300h': [20, 22],
				'wind_u-700h': [-10, -8], 'wind_v-700h': [0, 2],
				'wind_u-500h': [0, 0], 'wind_v-500h': [-20, -18],
				'wind_u-300h': [5, 4], 'wind_v-300h': [0, 1],
				'cloud-700h': [70, 65], 'cloud-500h': [20, 15], 'cloud-300h': [0, 0],
				'cloud-surface': [25, 20],
				'temp-surface': [280, 279], 'dewpoint-surface': [275, 274], 'rh-surface': [80, 78],
				'wind_u-surface': [0, 0], 'wind_v-surface': [-3, -4],
			},
		},
	}, 'ecmwf');
	assert.equal(result.ok, true);
	assert.equal(result.hasVerticalLayers, true);
	assert.equal(result.servedModel, 'ecmwf');
	assert.equal(result.servedModelSource, 'request');
	assert.equal(result.dataSource, 'windy-legacy-meteogram');
	assert.deepEqual(result.pressureLevels, [700, 500, 300]);
	assert.equal(result.frames[0].levels.length, 3);
	assert.equal(result.frames[0].levels[0].heightM, 3_100);
	assert.equal(result.frames[0].levels[0].temperatureC, 270 - 273.15);
	assert.equal(result.frames[0].levels[0].relativeHumidityPct, 85);
	assert.equal(result.frames[0].levels[0].cloudPct, 70);
	assert.equal(result.frames[0].levels[0].windSpeedMs, 10);
	assert.equal(result.frames[0].levels[0].windDirectionDeg, 90);
	assert.equal(result.frames[0].surfaceLevel.heightM, 4_800);
	assert.equal(result.frames[0].surfaceLevel.relativeHumidityPct, 80);
	assert.equal(result.frames[0].surfaceLevel.cloudPct, 25);
	assert.equal(result.hasDirectCloud, true);
	assert.equal(result.frames[0].surfaceLevel.windSpeedMs, 3);
	assert.ok(buildAltitudeTrend(levelsIncludingModelSurface(result.frames[0]), 'temperatureC', 3_000).path.length > 0);
	assert.equal(result.frames[0].levels.find(level => level.pressureHPa === 300).heightM, 9_200);
});

test('requires two adjacent levels with real variable values before skipping the legacy fallback', () => {
	const heightsOnly = { frames: [{ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0 },
		{ heightM: 2_000, pressureLevelIndex: 1 },
	] }] };
	assert.equal(hasTrendableVerticalProfile(heightsOnly), false);

	const splitFields = { frames: [{ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 12 },
		{ heightM: 2_000, pressureLevelIndex: 1, relativeHumidityPct: 70 },
	] }] };
	assert.equal(hasTrendableVerticalProfile(splitFields), false);

	const adjacentValues = { frames: [{ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 12 },
		{ heightM: 2_000, pressureLevelIndex: 1, temperatureC: 4 },
	] }] };
	assert.equal(hasTrendableVerticalProfile(adjacentValues), true);

	const gap = { frames: [{ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 12 },
		{ heightM: 3_000, pressureLevelIndex: 2, temperatureC: -3 },
	] }] };
	assert.equal(hasTrendableVerticalProfile(gap), false);
});

test('legacy parser does not manufacture heights from pressure when geopotential height is absent', () => {
	const result = parseWindyLegacyProfile({
		status: 200,
		data: { header: { modelElevation: 500 }, data: { hours: [1_790_000_000], 'gh-850h': [null], 'temp-850h': [275], 'rh-850h': [80] } },
	}, 'icon');
	assert.equal(result.ok, false);
	assert.equal(result.hasVerticalLayers, false);
	assert.equal(result.frames[0].levels.length, 0);
	assert.equal(result.servedModel, 'icon');
});

test('legacy diagnostics preserve known field arrays when no forecast timestamp can be parsed', () => {
	const profile = parseWindyLegacyProfile({
		status: 200,
		data: { header: { model: 'ecmwf' }, data: { hours: [], 'gh-850h': [1_500], 'temp-850h': [275], 'dewpoint-850h': [270], 'wind_u-850h': [4], 'wind_v-850h': [8] } },
	}, 'icon');
	assert.equal(profile.ok, false);
	assert.equal(profile.servedModel, 'ecmwf');
	const summary = buildProfileDiagnosticSummary(profile, null);
	assert.match(summary, /数据来源：Windy 旧版兼容逐层接口（官方标记弃用）/);
	assert.match(summary, /data：.*hours（时次数组长度 0）.*gh-850h（数组长 1，有效 1）.*dewpoint-850h（数组长 1，有效 1）.*wind_u-850h（数组长 1，有效 1）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:1_500|275|270|4|8)(?:\D|$)/);
});

test('failed-profile diagnostics can retain both point and legacy response shapes separately', () => {
	const currentPayload = makePayload();
	currentPayload.data.data.ts = [];
	const currentProfile = parseWindyProfile(currentPayload);
	const legacyProfile = parseWindyLegacyProfile({
		status: 200,
		data: { header: { model: 'ecmwf' }, data: { hours: [], 'gh-700h': [3_000], 'temp-700h': [260] } },
	}, 'ecmwf');
	currentProfile.diagnosticAlternates = [legacyProfile];
	const summary = buildProfileDiagnosticSummary(currentProfile, null);
	assert.match(summary, /数据来源：Windy 点预报接口/);
	assert.match(summary, /备用接口诊断：Windy 旧版兼容逐层接口（官方标记弃用）；模式 ECMWF；剖面状态 无可用天气值；可识别预报时次 0 个/);
	assert.match(summary, /gh-700h（数组长 1，有效 1）/);
	assert.doesNotMatch(summary, /(?:^|\D)(?:3_000|260|275)(?:\D|$)/);
});

test('keeps surface visibility distinct from pressure-level values', () => {
	const result = parseWindyProfile(makePayload());
	assert.equal(result.frames[0].surfaceVisibilityM, 25_000);
	assert.equal(result.frames[0].surfaceWindGustMs, 14);
	assert.equal(result.frames[0].levels.every(level => !('visibilityM' in level)), true);
	assert.equal(result.frames[0].levels.every(level => !('surfaceWindGustMs' in level)), true);
	const selectedHeight = interpolateAtHeight(result.frames[0], 2_000, 1_000);
	assert.equal('visibilityM' in selectedHeight, false);
	assert.equal('surfaceWindGustMs' in selectedHeight, false);
});

test('anchors Windy near-surface temperature and wind at model terrain without relabeling them as pressure layers', () => {
	const frame = parseWindyProfile(makePayload()).frames[0];
	assert.equal(frame.levels.every(level => level.source === 'pressure-level'), true);
	assert.equal(frame.surfaceLevel.source, 'model-surface');
	assert.equal(frame.surfaceLevel.heightM, 1_800);
	assert.equal(frame.surfaceLevel.temperatureC, 285 - 273.15);
	assert.equal(frame.surfaceLevel.windSpeedMs, 3);
	assert.equal(frame.surfaceLevel.relativeHumidityPct, null);
	assert.equal(frame.surfaceLevel.cloudPct, null);
	assert.equal(levelsIncludingModelSurface(frame).length, frame.levels.length + 1);
	assert.ok(buildAltitudeTrend(levelsIncludingModelSurface(frame), 'temperatureC', 1_800).path.length > 0);
	assert.equal(interpolateAtHeight(frame, 1_800, 1_800).temperatureC, 285 - 273.15);
	assert.equal(interpolateAtHeight(frame, 6_000, 1_800).temperatureC, null);
});

test('keeps near-surface readings available when Windy returns no vertical pressure levels', () => {
	const payload = makePayload();
	for (const source of [payload.data.meteogram, payload.data.airgram, payload.data.sounding]) {
		for (const key of Object.keys(source)) if (/^(?:gh|cloud|temp|wind|windDir|rh|dewPoint)-\d+h$/i.test(key)) delete source[key];
	}
	const profile = parseWindyProfile(payload);
	assert.equal(profile.ok, true);
	assert.equal(profile.hasVerticalLayers, false);
	assert.equal(profile.hasSurfaceData, true);
	assert.equal(profile.frames[0].levels.length, 0);
	assert.equal(interpolateAtHeight(profile.frames[0], 1_800, 1_800).temperatureC, 285 - 273.15);
	assert.equal(interpolateAtHeight(profile.frames[0], 2_000, 1_800).temperatureC, null);
});

test('parses direct v3 surface sounding fields without treating them as pressure layers', () => {
	const payload = makePayload();
	for (const source of [payload.data.meteogram, payload.data.airgram, payload.data.sounding]) {
		for (const key of Object.keys(source)) if (/^(?:gh|cloud|temp|wind|windDir|rh|dewPoint)-\d+h$/i.test(key)) delete source[key];
	}
	payload.data.data.temperature = [null, null];
	payload.data.data.wind = [null, null];
	payload.data.data.windDir = [null, null];
	Object.assign(payload.data.meteogram, { dewPoint: [272, 271], 'cloud-surface': [35, 20] });
	Object.assign(payload.data.airgram, { 'temp-surface': [281, 280], 'wind-surface': [8, 9], 'windDir-surface': [270, 280] });
	Object.assign(payload.data.sounding, { 'rh-surface': [66, 70], 'dewPoint-surface': [268, 267] });

	const profile = parseWindyProfile(payload);
	const frame = profile.frames[0];
	assert.equal(profile.hasVerticalLayers, false);
	assert.equal(profile.hasSurfaceData, true);
	assert.equal(profile.hasDirectCloud, true);
	assert.equal(frame.levels.length, 0);
	assert.equal(frame.surfaceLevel.source, 'model-surface');
	assert.equal(frame.surfaceLevel.heightM, 1_800);
	assert.equal(frame.surfaceLevel.temperatureC, 281 - 273.15);
	assert.equal(frame.surfaceLevel.dewPointC, 272 - 273.15);
	assert.equal(frame.surfaceLevel.relativeHumidityPct, 66);
	assert.equal(frame.surfaceLevel.windSpeedMs, 8);
	assert.equal(frame.surfaceLevel.windDirectionDeg, 270);
	assert.equal(frame.surfaceLevel.cloudPct, 35);
	const ground = interpolateAtHeight(frame, 1_800, 1_800);
	assert.equal(ground.humidityPct, 66);
	assert.equal(ground.cloudPct, 35);
});

test('route cross sections place model-surface values at model elevation and exclude them below terrain', () => {
	const profile = parseWindyProfile(makePayload());
	const timestampMs = profile.timestampsMs[0];
	const sample = { distanceM: 0, terrainElevationM: 1_800, profile };
	const geometry = buildCrossSectionGeometry([sample], timestampMs, 'temperature');
	assert.ok(geometry.levelMarks.some(mark => mark.source === 'model-surface' && mark.heightM === 1_800 && mark.value !== null));
	assert.ok(geometry.cells.some(cell => cell.source === 'model-surface' && !cell.missing));
	const highTerrain = buildCrossSectionGeometry([{ ...sample, terrainElevationM: 2_000 }], timestampMs, 'temperature');
	assert.equal(highTerrain.levelMarks.some(mark => mark.source === 'model-surface'), false);
});

test('uses geopotential heights and direct cloud layers from sounding when meteogram is not returned', () => {
	const payload = makePayload();
	delete payload.data.meteogram;
	Object.assign(payload.data.sounding, {
		'gh-850h': [1500, 1510], 'gh-700h': [3000, 3020], 'gh-500h': [5500, 5530],
		'cloud-850h': [80, 70], 'cloud-700h': [40, 50], 'cloud-500h': [10, 20],
	});
	const result = parseWindyProfile(payload);
	assert.equal(result.ok, true);
	assert.equal(result.frames[0].levels.length, 3);
	assert.equal(result.frames[0].levels[0].heightM, 1500);
	assert.equal(result.frames[0].levels[0].cloudPct, 80);
	assert.ok(buildAltitudeTrend(result.frames[0].levels, 'temperatureC').path.length > 0);
});

test('reads geopotential heights and cloud layers placed on the v3 forecast header', () => {
	const payload = makePayload();
	delete payload.data.meteogram;
	payload.data.header.availableLevels = ['850h', '700h', '500h'];
	Object.assign(payload.data.header, {
		'gh-850h': [1_650, 1_670], 'gh-700h': [3_100, 3_130], 'gh-500h': [5_650, 5_700],
		'cloud-850h': [75, 70], 'cloud-700h': [35, 30], 'cloud-500h': [5, 0],
		cloudBase: [2_200, 2_250],
	});
	const result = parseWindyProfile(payload);
	assert.deepEqual(result.pressureLevels, [850, 700, 500]);
	assert.equal(result.frames[0].levels[0].heightM, 1_650);
	assert.equal(result.frames[0].levels[0].cloudPct, 75);
	assert.equal(result.frames[0].levels[1].heightM, 3_100);
	assert.equal(result.frames[0].cloudBaseM, 2_200);
	assert.equal(result.hasVerticalLayers, true);
});

test('keeps one real vertical layer visible without inventing a trend line', () => {
	const payload = makePayload();
	for (const source of [payload.data.meteogram, payload.data.airgram, payload.data.sounding]) {
		for (const key of Object.keys(source)) if (/(?:700|500)h$/.test(key)) delete source[key];
	}
	const result = parseWindyProfile(payload);
	assert.equal(result.ok, true);
	assert.equal(result.frames[0].levels.length, 1);
	const geometry = buildAltitudeTrend(result.frames[0].levels, 'temperatureC');
	assert.equal(geometry.points.length, 1);
	assert.equal(geometry.path, '');
	assert.equal(geometry.points[0].value, 275 - 273.15);
});

test('normalizes forecast timestamps and chooses the nearest map time', () => {
	const result = parseWindyProfile(makePayload());
	assert.equal(result.timestampsMs[0], 1_790_000_000_000);
	assert.equal(closestTimeIndex(result.timestampsMs, 1_790_005_000_000), 0);
	assert.equal(nearestForecastTimestamp(result.timestampsMs, result.timestampsMs[0] + 7_200_000), result.timestampsMs[1]);
	assert.equal(nearestForecastTimestamp([], result.timestampsMs[0]), null);
	assert.match(formatForecastTime(result.timestampsMs[0]), /^\d{2}\/\d{2}/);
	assert.equal(frameAtTimestamp(result.frames, result.timestampsMs[0] + 750), result.frames[0]);
	assert.equal(frameAtTimestamp(result.frames, result.timestampsMs[0] + 1_001), null);
});

test('reports the actual preceding forecast interval, including irregular model time steps', () => {
	const times = [0, 3_600_000, 7_200_000, 18_000_000];
	assert.equal(forecastIntervalHours(times, 7_200_000), 1);
	assert.equal(forecastIntervalHours(times, 18_000_000), 3);
	assert.equal(forecastIntervalHours([0], 0), null);
});

test('terrain and chart bounds hide underground levels without changing valid model levels', () => {
	const frame = parseWindyProfile(makePayload()).frames[0];
	assert.deepEqual(visibleProfileLevels(frame, 1800, 9000).map(level => level.pressureHPa), [700, 500]);
	const geometry = buildVerticalChartPoints(frame.levels, 1800, 9000);
	assert.equal(geometry.visible.length, 2);
	assert.ok(geometry.temperaturePath.startsWith('M'));
});

test('manual summit elevation overrides Windy terrain and retains model fallback provenance', () => {
	assert.deepEqual(resolveTerrainElevation(4_800, 4_650, 8_848), { heightM: 8_848, source: 'manual' });
	assert.deepEqual(resolveTerrainElevation(4_800, 4_650), { heightM: 4_800, source: 'windy' });
	assert.deepEqual(resolveTerrainElevation(null, 4_650), { heightM: 4_650, source: 'model' });
	assert.deepEqual(resolveTerrainElevation(null, null), { heightM: null, source: null });
});

test('interpolates scalar values between geometric heights and does not extrapolate', () => {
	const frame = parseWindyProfile(makePayload()).frames[0];
	const interpolated = interpolateAtHeight(frame, 4000, 1800);
	assert.equal(interpolated.ok, true);
	assert.equal(interpolated.methods.temperature, 'interpolated');
	assert.equal(interpolated.methods.humidity, 'interpolated');
	assert.equal(interpolated.cloudPct, 28);
	assert.equal(interpolated.methods.cloud, 'interpolated');
	assert.equal(interpolateAtHeight(frame, 7000, 1800).windSpeedMs, null);
	assert.equal(interpolateAtHeight(frame, 7000, 1800).cloudPct, null);
	assert.equal(interpolateAtHeight(frame, 1200, 1800).reason, 'below-terrain');
});

test('underground pressure levels never bracket above-ground point or route queries', () => {
	const frame = { levels: [
		{ heightM: 2_000, pressureLevelIndex: 0, temperatureC: 10, relativeHumidityPct: 30, windSpeedMs: 5, windDirectionDeg: 180 },
		{ heightM: 3_000, pressureLevelIndex: 1, temperatureC: 0, relativeHumidityPct: 50, windSpeedMs: 10, windDirectionDeg: 180 },
		{ heightM: 4_000, pressureLevelIndex: 2, temperatureC: -10, relativeHumidityPct: 70, windSpeedMs: 15, windDirectionDeg: 180 },
	] };
	const aboveTerrainButBelowFirstLevel = interpolateAtHeight(frame, 2_500, 2_500);
	assert.equal(aboveTerrainButBelowFirstLevel.temperatureC, null);
	assert.equal(aboveTerrainButBelowFirstLevel.windSpeedMs, null);
	const betweenAboveGroundLevels = interpolateAtHeight(frame, 3_500, 2_500);
	assert.equal(betweenAboveGroundLevels.temperatureC, -5);
	assert.equal(betweenAboveGroundLevels.methods.temperature, 'interpolated');
});

test('builds 250 metre altitude queries without generating invalid or oversized ranges', () => {
	assert.deepEqual(sampleAltitudeRange(2_000, 3_000), [2_000, 2_250, 2_500, 2_750, 3_000]);
	assert.deepEqual(sampleAltitudeRange(2_000, 3_000, 400), [2_000, 2_400, 2_800, 3_000]);
	assert.deepEqual(sampleAltitudeRange(2_000, 2_900, 300), [2_000, 2_300, 2_600, 2_900]);
	assert.deepEqual(sampleAltitudeRange(3_000, 2_000), []);
	assert.deepEqual(sampleAltitudeRange(0, 200_000, 1), []);
});

test('builds altitude trend charts with real layer heights and breaks lines at missing values', () => {
	const geometry = buildAltitudeTrend([
		{ heightM: 3_000, temperatureC: -8, source: 'pressure-level' },
		{ heightM: 1_000, temperatureC: 6, source: 'model-surface' },
		{ heightM: 2_000, temperatureC: null },
		{ heightM: 4_000, temperatureC: -20 },
	], 'temperatureC', 0, 9_000);
	assert.equal(geometry.points.length, 3);
	assert.equal(geometry.points[0].heightM, 1_000);
	assert.equal(geometry.belowTerrainPointCount, 0);
	assert.ok(geometry.points[0].x > geometry.plot.left);
	assert.equal(geometry.path.match(/M/g)?.length, 1);
	assert.deepEqual(geometry.segments.map(segment => segment.length), [1, 2]);
	assert.deepEqual(geometry.altitudeTicks, [0, 2_250, 4_500, 6_750, 9_000]);
	assert.equal(geometry.points[0].source, 'model-surface');
	assert.equal(geometry.referencePoints.find(point => point.heightM === 3_000).source, 'pressure-level');
});

test('altitude trends do not connect nonadjacent pressure levels', () => {
	const geometry = buildAltitudeTrend([
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 5 },
		{ heightM: 3_000, pressureLevelIndex: 2, temperatureC: -12 },
	], 'temperatureC');
	assert.deepEqual(geometry.segments.map(segment => segment.length), [1, 1]);
	assert.equal(geometry.path, '');
	assert.equal(altitudeTrendValueAt(geometry, 2_000), null);
});

test('equal-height layers remain visible as raw values but do not create a zero-width trend', () => {
	const levels = [
		{ heightM: 7_800, pressureLevelIndex: 0, pressureHPa: 700, temperatureC: -12 },
		{ heightM: 7_800, pressureLevelIndex: 1, pressureHPa: 650, temperatureC: -10 },
	];
	const geometry = buildAltitudeTrend(levels, 'temperatureC');
	assert.equal(geometry.path, '');
	assert.deepEqual(geometry.segments.map(segment => segment.length), [1, 1]);
	assert.deepEqual(geometry.isolatedPoints.map(point => point.value), [-12, -10]);
	assert.equal(hasTrendableVerticalProfile({ frames: [{ levels, surfaceLevel: null }] }), false);
});

test('altitude trend geometry follows the measured chart width on narrow panels', () => {
	const geometry = buildAltitudeTrend([
		{ heightM: 1_000, temperatureC: 8, pressureLevelIndex: 0 },
		{ heightM: 3_000, temperatureC: -4, pressureLevelIndex: 1 },
	], 'temperatureC', 0, 9_000, 390, 320);
	assert.equal(geometry.chartWidth, 390);
	assert.equal(geometry.x(0), geometry.plot.left);
	assert.equal(geometry.x(9_000), geometry.plot.right);
	assert.equal(altitudeAtChartX(geometry.x(4_500), geometry.plot, 9_000, 50), 4_500);
});

test('altitude trend chart rejects unsupported fields and uses a readable wind domain', () => {
	assert.equal(buildAltitudeTrend([], 'dewPointC'), null);
	const geometry = buildAltitudeTrend([{ heightM: 2_000, windSpeedMs: 7.2 }], 'windSpeedMs');
	assert.equal(geometry.domainMin, 0);
	assert.equal(geometry.domainMax, 10);
	assert.equal(geometry.points.length, 1);
	assert.equal(geometry.path, '');
	assert.equal(geometry.isolatedPoints.length, 1);
	assert.equal(geometry.isolatedPoints[0].heightM, 2_000);
	assert.equal(geometry.isolatedPoints[0].value, 7.2);
	assert.equal(altitudeTrendValueAt(geometry, 2_000), 7.2);
	assert.equal(altitudeTrendValueAt(geometry, 2_050), null);
});

test('keeps the 0–9000 metre query axis available when a supported variable has no data', () => {
	const geometry = buildAltitudeTrend([], 'temperatureC', 5_000, 9_000);
	assert.ok(geometry);
	assert.deepEqual(geometry.altitudeTicks, [0, 2_250, 4_500, 6_750, 9_000]);
	assert.equal(geometry.domainMin, -80);
	assert.equal(geometry.domainMax, 40);
	assert.equal(geometry.points.length, 0);
	assert.equal(geometry.path, '');
	assert.equal(altitudeAtChartX(geometry.x(5_050), geometry.plot, 9_000, 50), 5_050);
	assert.equal(altitudeTrendValueAt(geometry, 5_050), null);
	assert.equal(buildAltitudeTrend([], 'windSpeedMs').domainMax, 50);
});

test('altitude trend reports valid samples hidden below local terrain separately', () => {
	const geometry = buildAltitudeTrend([
		{ heightM: 1_000, temperatureC: 10 },
		{ heightM: 2_000, temperatureC: 5 },
		{ heightM: 3_000, temperatureC: 0 },
	], 'temperatureC', 2_500);
	assert.equal(geometry.points.length, 1);
	assert.equal(geometry.belowTerrainPointCount, 2);
});

test('shows below-terrain raw profile as a reference while excluding it from query interpolation', () => {
	const levels = [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 12 },
		{ heightM: 3_000, pressureLevelIndex: 1, temperatureC: 2 },
		{ heightM: 5_000, pressureLevelIndex: 2, temperatureC: -8 },
		{ heightM: 7_000, pressureLevelIndex: 3, temperatureC: -25 },
	];
	const geometry = buildAltitudeTrend(levels, 'temperatureC', 5_000);
	assert.equal(geometry.referencePoints.length, 4);
	assert.equal(geometry.referencePoints.filter(point => point.belowTerrain).length, 2);
	assert.equal(geometry.referencePath.match(/M/g)?.length, 1);
	assert.equal(geometry.points.length, 2);
	assert.equal(geometry.path.match(/M/g)?.length, 1);
	assert.equal(altitudeTrendValueAt(geometry, 3_000), null);
	assert.equal(interpolateAtHeight({ levels }, 3_000, 5_000).reason, 'below-terrain');
	assert.equal(buildVerticalChartPoints(levels, 5_000).visible.length, 2);
	assert.equal(buildVerticalChartPoints(levels, 5_000).modelVisible.length, 4);
});

test('nearest profile-layer lookup returns real usable data and excludes ground and frame gaps', () => {
	const levels = [
		{ heightM: 4_900, temperatureC: -2 },
		{ heightM: 6_200, temperatureC: -8 },
		{ heightM: 7_800, relativeHumidityPct: 72 },
		{ heightM: 9_250, temperatureC: -40 },
	];
	assert.equal(nearestUsableProfileLevel(levels, 5_050, 5_000, 9_000).heightM, 6_200);
	assert.equal(nearestUsableProfileLevel(levels, 8_000, 5_000, 9_000).heightM, 7_800);
	assert.equal(nearestUsableProfileLevel(levels, 5_050, 10_000, 9_000), null);
});

test('route target line uses the selected MSL altitude across all sampled points', () => {
	const geometry = { x: distance => distance / 10, y: height => 100 - height / 100, maxHeightM: 9_000 };
	const samples = [
		{ distanceM: 0, terrainElevationM: 1_000 },
		{ distanceM: 1_000, terrainElevationM: 2_000 },
		{ distanceM: 2_000, terrainElevationM: null, profile: { modelElevationM: null } },
	];
	const result = buildRouteTargetLine(samples, geometry, 5_000);
	assert.equal(result.points.length, 3);
	assert.deepEqual(result.points.map(point => point.altitudeM), [5_000, 5_000, 5_000]);
	assert.ok(result.line.length > 0);
});

test('route surface-gust summary reports the maximum only among returned ground samples at the selected time', () => {
	const profile = parseWindyProfile(makePayload());
	const timestampMs = profile.timestampsMs[0];
	const midpointProfile = {
		...profile,
		frames: profile.frames.map((frame, index) => index === 0 ? { ...frame, surfaceWindGustMs: 18 } : frame),
	};
	const summary = summarizeRouteSurfaceWindGust([
		{ key: 'b', name: '中点', distanceM: 1_000, profile: midpointProfile },
		{ key: 'a', name: '起点', distanceM: 0, profile },
		{ key: 'c', name: '终点', distanceM: 2_000, profile: { ...profile, frames: [] } },
	], timestampMs);
	assert.equal(summary.availableCount, 2);
	assert.equal(summary.totalCount, 3);
	assert.equal(summary.maximum.name, '中点');
	assert.equal(summary.maximum.gustMs, 18);
	assert.equal(summary.maximum.distanceM, 1_000);
	assert.equal(summarizeRouteSurfaceWindGust([], timestampMs).maximum, null);
});

test('route target summaries keep every requested point and report only its own sampled fields', () => {
	const profile = parseWindyProfile(makePayload());
	const [loaded, missing] = buildRouteTargetSummaries([
		{ key: 'a', name: '起点', lat: 30, lon: 86, distanceM: 0, terrainElevationM: 1_800, profile },
		{ key: 'b', name: '终点', lat: 31, lon: 87, distanceM: 12_000, terrainElevationM: null, profile: null, error: 'Windy 请求失败' },
	], profile.timestampsMs[0], 4_000);
	assert.equal(loaded.hasForecast, true);
	assert.equal(loaded.terrainSource, 'windy');
	assert.equal(loaded.targetHeightMsl, 4_000);
	assert.equal(loaded.weather.methods.temperature, 'interpolated');
	assert.ok(Number.isFinite(loaded.weather.windSpeedMs));
	assert.equal(loaded.cloudBaseM, 2_400);
	assert.equal(loaded.precipAmountMm, 1.5);
	assert.equal(loaded.surfaceVisibilityM, 25_000);
	assert.equal(missing.name, '终点');
	assert.equal(missing.hasForecast, false);
	assert.equal(missing.error, 'Windy 请求失败');
	assert.equal(missing.weather.temperatureC, null);
});

test('flags only above-terrain subfreezing layers with a direct cloud or explicit high-humidity signal', () => {
	const result = potentialIcingLevels({ levels: [
		{ heightM: 2_000, temperatureC: -4, cloudPct: 20, relativeHumidityPct: 60 },
		{ heightM: 3_000, temperatureC: -1, cloudPct: 0, relativeHumidityPct: 92 },
		{ heightM: 4_000, temperatureC: 2, cloudPct: 80, relativeHumidityPct: 90 },
		{ heightM: 5_000, temperatureC: -8, cloudPct: 0, relativeHumidityPct: 80 },
	]}, 2_500);
	assert.deepEqual(result.map(level => level.heightM), [3_000]);
	assert.equal(result[0].cloudSignal, 'high-humidity');
});

test('estimates every zero-degree crossing only between adjacent valid above-terrain temperature layers', () => {
	const frame = { levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 8 },
		{ heightM: 2_000, pressureLevelIndex: 1, temperatureC: -4 },
		{ heightM: 3_000, pressureLevelIndex: 2, temperatureC: 6 },
		{ heightM: 4_000, pressureLevelIndex: 3, temperatureC: null },
		{ heightM: 5_000, pressureLevelIndex: 4, temperatureC: -8 },
	] };
	const result = freezingLevelCrossings(frame, 1_000);
	assert.deepEqual(result.heightsM, [1_000 + 8 / 12 * 1_000, 2_000 + 4 / 10 * 1_000]);
	assert.equal(result.validLevelCount, 4);
	assert.equal(result.validAdjacentPairCount, 2);
});

test('keeps exact zero-degree layers and reports when no adjacent temperature pair can be checked', () => {
	assert.deepEqual(freezingLevelCrossings({ levels: [
		{ heightM: 3_500, pressureLevelIndex: 3, temperatureC: 0 },
	]}, 1_000), { heightsM: [3_500], validLevelCount: 1, validAdjacentPairCount: 0 });
	assert.deepEqual(freezingLevelCrossings({ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 4 },
		{ heightM: 9_500, pressureLevelIndex: 1, temperatureC: -20 },
	]}, 0, 9_000), { heightsM: [], validLevelCount: 1, validAdjacentPairCount: 0 });
});

test('marks zero-degree levels only at sampled route locations without joining points', () => {
	const timestampMs = 1_790_000_000_000;
	const makeProfile = levels => ({ frames: [{ timestampMs, levels }] });
	const samples = [
		{ name: '终点', distanceM: 10_000, terrainElevationM: 500, profile: makeProfile([
			{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 5 },
			{ heightM: 3_000, pressureLevelIndex: 1, temperatureC: -5 },
		]) },
		{ name: '起点', distanceM: 0, terrainElevationM: 0, profile: makeProfile([
			{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 5 },
			{ heightM: 2_000, pressureLevelIndex: 1, temperatureC: 6 },
		]) },
	];
	const geometry = buildCrossSectionGeometry(samples, timestampMs, 'temperature');
	const marks = buildRouteFreezingMarks(samples, timestampMs, geometry);
	assert.equal(marks.length, 1);
	assert.equal(marks[0].sampleIndex, 1);
	assert.equal(marks[0].name, '终点');
	assert.equal(marks[0].distanceM, 10_000);
	assert.equal(marks[0].heightM, 2_000);
	assert.equal(marks[0].x, geometry.x(10_000));
	assert.equal(marks[0].y, geometry.y(2_000));
});

test('route zero-degree markers skip unknown terrain and nonadjacent temperature layers', () => {
	const timestampMs = 1_790_000_000_000;
	const profile = { frames: [{ timestampMs, levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, temperatureC: 5 },
		{ heightM: 3_000, pressureLevelIndex: 2, temperatureC: -5 },
	] }] };
	const samples = [
		{ name: '地形未知', distanceM: 0, profile },
		{ name: '层间缺档', distanceM: 10_000, terrainElevationM: 0, profile },
	];
	const geometry = buildCrossSectionGeometry(samples, timestampMs, 'temperature');
	assert.deepEqual(buildRouteFreezingMarks(samples, timestampMs, geometry), []);
});

test('maps horizontal chart dragging to a clamped, 50 metre altitude query', () => {
	const plot = { left: 62, right: 702 };
	assert.equal(altitudeAtChartX(62, plot), 0);
	assert.equal(altitudeAtChartX(382, plot), 4_500);
	assert.equal(altitudeAtChartX(702, plot), 9_000);
	assert.equal(altitudeAtChartX(-50, plot), 0);
	assert.equal(altitudeAtChartX(900, plot), 9_000);
	assert.equal(altitudeAtChartX(62 + 640 * 0.503, plot), 4_550);
	assert.equal(altitudeAtChartX(100, { left: 5, right: 5 }), null);
});

test('keyboard altitude controls step relative to the active profile elevation and clamp to the chart', () => {
	assert.equal(altitudeAfterSliderKey(5_000, 'ArrowUp'), 5_050);
	assert.equal(altitudeAfterSliderKey(5_000, 'ArrowLeft'), 4_950);
	assert.equal(altitudeAfterSliderKey(5_000, 'PageUp'), 5_500);
	assert.equal(altitudeAfterSliderKey(5_000, 'PageDown'), 4_500);
	assert.equal(altitudeAfterSliderKey(0, 'ArrowDown'), 0);
	assert.equal(altitudeAfterSliderKey(8_990, 'ArrowUp'), 9_000);
	assert.equal(altitudeAfterSliderKey(5_000, 'Home'), 0);
	assert.equal(altitudeAfterSliderKey(5_000, 'End'), 9_000);
	assert.equal(altitudeAfterSliderKey(5_000, 'Enter'), null);
});

test('reads the selected variable from the drawn trend and leaves chart gaps unavailable', () => {
	const geometry = buildAltitudeTrend([
		{ heightM: 1_000, temperatureC: 10 },
		{ heightM: 2_000, temperatureC: null },
		{ heightM: 3_000, temperatureC: 0 },
		{ heightM: 4_000, temperatureC: -10 },
	], 'temperatureC');
	assert.equal(altitudeTrendValueAt(geometry, 3_000), 0);
	assert.equal(altitudeTrendValueAt(geometry, 3_500), -5);
	assert.equal(altitudeTrendValueAt(geometry, 1_500), null);
	assert.equal(altitudeTrendValueAt(geometry, 8_000), null);
});

test('route terrain overlay uses dense samples, identifies the highest point, and leaves missing gaps', () => {
	const geometry = { x: distance => distance / 10, y: height => 100 - height / 100, maxHeightM: 9_000, plot: { bottom: 100 } };
	const overlay = buildRouteTerrainOverlay([
		{ distanceM: 0, elevationM: 1_000 },
		{ distanceM: 1_000, elevationM: 2_500 },
		{ distanceM: 2_000, elevationM: null },
		{ distanceM: 3_000, elevationM: 1_800 },
		{ distanceM: 4_000, elevationM: 1_600 },
	], geometry);
	assert.equal(overlay.count, 4);
	assert.equal(overlay.highest.distanceM, 1_000);
	assert.equal(overlay.highest.elevationM, 2_500);
	assert.equal(overlay.line.match(/M/g)?.length, 2);
	assert.equal(overlay.area.match(/Z/g)?.length, 2);
});

test('route terrain reports an above-frame maximum without drawing it into the altitude range', () => {
	const geometry = { x: distance => distance / 10, y: height => 100 - height / 100, maxHeightM: 9_000, plot: { bottom: 100 } };
	const overlay = buildRouteTerrainOverlay([
		{ distanceM: 0, elevationM: 8_000 },
		{ distanceM: 1_000, elevationM: 9_500 },
		{ distanceM: 2_000, elevationM: 8_500 },
	], geometry);
	assert.equal(overlay.highest.elevationM, 9_500);
	assert.equal(overlay.count, 2);
	assert.equal(overlay.line, '');
});

test('route precipitation geometry keeps missing samples empty and scales millimetres per forecast step', () => {
	const profileGeometry = {
		plot: { left: 42, right: 628 },
		x: distance => 42 + distance / 10,
	};
	const geometry = buildRoutePrecipitationGeometry([
		{ key: 'a', name: '起点', distanceM: 0, amountMm: 2, snowMm: 0.5 },
		{ key: 'b', name: '中点', distanceM: 2_000, amountMm: null, snowMm: null },
		{ key: 'c', name: '终点', distanceM: 4_000, amountMm: 4, snowMm: 1 },
	], profileGeometry);
	assert.equal(geometry.maxMm, 4);
	assert.equal(geometry.marks[0].available, true);
	assert.equal(geometry.marks[0].totalHeight > geometry.marks[0].snowHeight, true);
	assert.equal(geometry.marks[1].available, false);
	assert.equal(geometry.marks[1].totalHeight, 0);
	assert.equal(geometry.marks[2].x, 442);
});

test('altitude-range values interpolate only within valid profile levels', () => {
	const frame = parseWindyProfile(makePayload()).frames[0];
	const rows = sampleAltitudeRange(1_250, 5_750).map(heightM => ({ heightM, result: interpolateAtHeight(frame, heightM, 1_800) }));
	assert.equal(rows[0].result.reason, 'below-terrain');
	assert.equal(rows.find(row => row.heightM === 2_500).result.ok, true);
	assert.equal(rows.find(row => row.heightM === 2_500).result.dewPointC, null);
	assert.equal(rows.find(row => row.heightM === 4_000).result.ok, true);
	assert.equal(rows.find(row => row.heightM === 4_000).result.dewPointC, 250 - 273.15 + (230 - 250) * (1_000 / 2_500));
	assert.equal(rows.at(-1).result.ok, false);
	assert.equal(rows.at(-1).result.windSpeedMs, null);
});

test('does not interpolate across missing levels or through a missing target layer value', () => {
	const payload = makePayload();
	payload.data.meteogram['gh-700h'] = [null, null];
	const result = parseWindyProfile(payload);
	assert.equal(interpolateAtHeight(result.frames[0], 4000).temperatureC, null);
	assert.equal(interpolateAtHeight(result.frames[0], 4000).windSpeedMs, null);

	const missingHumidity = makePayload();
	missingHumidity.data.sounding['rh-700h'] = [null, null];
	const profile = parseWindyProfile(missingHumidity);
	assert.equal(interpolateAtHeight(profile.frames[0], 2250).humidityPct, null);
});

test('interpolates wind as horizontal components across north', () => {
	const frame = {
		levels: [
			{ heightM: 1000, windSpeedMs: 10, windDirectionDeg: 359 },
			{ heightM: 2000, windSpeedMs: 10, windDirectionDeg: 1 },
		],
	};
	const wind = interpolateAtHeight(frame, 1500);
	assert.ok(wind.windDirectionDeg < 1 || wind.windDirectionDeg > 359);
	assert.ok(Math.abs(wind.windSpeedMs - 10) < 0.01);
});

test('wind directions are shown with normalized degree and compass label', () => {
	assert.equal(formatWindDirection(360), '北 0°');
	assert.equal(formatWindDirection(91), '东 91°');
	assert.equal(formatWindDirection(359.8), '北 0°');
});

test('wind arrows point downwind for cardinal and north-crossing directions', () => {
	assert.equal(windFlowRotationDeg(0), 90);
	assert.equal(windFlowRotationDeg(90), 180);
	assert.equal(windFlowRotationDeg(180), 270);
	assert.equal(windFlowRotationDeg(270), 0);
	assert.equal(windFlowRotationDeg(359), 89);
	assert.equal(windFlowRotationDeg(360), 90);
	assert.equal(windFlowRotationDeg(Number.NaN), null);
});

test('missing Windy values stay missing and route cross-section keeps them gray', () => {
	const payload = makePayload();
	payload.data.meteogram['cloud-700h'] = [null, null];
	const profile = parseWindyProfile(payload);
	assert.equal(profile.frames[0].levels.find(level => level.pressureHPa === 700).cloudPct, null);
	const geometry = buildCrossSectionGeometry([
		{ name: '起点', distanceM: 0, terrainElevationM: 1000, profile },
		{ name: '终点', distanceM: 10000, terrainElevationM: 1200, profile },
	], profile.timestampsMs[0]);
	assert.ok(geometry.cells.some(cell => cell.missing && cell.pressureHPa === 700));
});

test('route cross section tolerates sub-second timestamp differences between samples', () => {
	const profile = parseWindyProfile(makePayload());
	const geometry = buildCrossSectionGeometry([
		{ name: '起点', distanceM: 0, terrainElevationM: 1000, profile },
		{
			name: '终点', distanceM: 10000, terrainElevationM: 1200,
			profile: { ...profile, frames: profile.frames.map(frame => ({ ...frame, timestampMs: frame.timestampMs + 500 })) },
		},
	], profile.timestampsMs[0]);
	assert.ok(geometry.cells.some(cell => cell.sampleIndex === 1 && !cell.missing));
});

test('route cross section keeps isolated layers as points and leaves gaps between nonadjacent levels', () => {
	const timestampMs = 1_790_000_000_000;
	const profile = { frames: [{ timestampMs, levels: [
		{ heightM: 1_000, pressureHPa: 850, pressureLevelIndex: 0, cloudPct: 20 },
		{ heightM: 3_000, pressureHPa: 500, pressureLevelIndex: 2, cloudPct: 80 },
	] }] };
	const geometry = buildCrossSectionGeometry([
		{ name: '起点', distanceM: 0, terrainElevationM: 0, profile },
	], timestampMs);
	assert.equal(geometry.cells.length, 0);
	assert.equal(geometry.levelMarks.length, 2);
	assert.deepEqual(geometry.levelMarks.map(mark => mark.heightM), [1_000, 3_000]);
});

test('route cross-section geometry matches its SVG viewport and keeps endpoint distance labels inside the plot', () => {
	const timestampMs = 1_790_000_000_000;
	const profile = { frames: [{ timestampMs, levels: [
		{ heightM: 5_900, pressureHPa: 500, pressureLevelIndex: 0, windSpeedMs: 8 },
		{ heightM: 7_600, pressureHPa: 400, pressureLevelIndex: 1, windSpeedMs: 12 },
	] }] };
	const geometry = buildCrossSectionGeometry([
		{ name: '起点', distanceM: 0, terrainElevationM: 5_500, profile },
		{ name: '终点', distanceM: 19_500, terrainElevationM: 5_400, profile },
	], timestampMs, 'wind', 9_000, 1_800, 640);

	assert.equal(geometry.width, 1_800);
	assert.equal(geometry.height, 640);
	assert.deepEqual(geometry.plot, { left: 74, right: 1_776, top: 40, bottom: 592 });
	assert.equal(geometry.y(9_000), geometry.plot.top);
	assert.equal(geometry.y(0), geometry.plot.bottom);
	assert.equal(geometry.sampleMarks[0].labelAnchor, 'start');
	assert.ok(geometry.sampleMarks[0].labelX > geometry.plot.left);
	assert.equal(geometry.sampleMarks[1].labelAnchor, 'end');
	assert.ok(geometry.sampleMarks[1].labelX < geometry.plot.right);
	assert.ok(geometry.cells.every(cell => cell.width <= 36), 'weather cells should mark sampled columns without filling unsampled route intervals');
	assert.ok(geometry.cells.filter(cell => cell.sampleIndex === 0).every(cell => cell.x === geometry.plot.left));
	assert.ok(geometry.cells.filter(cell => cell.sampleIndex === 1).every(cell => cell.x + cell.width === geometry.plot.right));
});

test('RH threshold bands are marked as an estimate, interpolate crossings, and clip below terrain', () => {
	const frame = { levels: [
		{ heightM: 1000, relativeHumidityPct: 80 },
		{ heightM: 2000, relativeHumidityPct: 92 },
		{ heightM: 3000, relativeHumidityPct: 95 },
		{ heightM: 4000, relativeHumidityPct: 80 },
	] };
	const [band] = humidityCloudBands(frame, null, 9000);
	assert.ok(Math.abs(band.lowHeightM - 1833.33) < 1);
	assert.ok(Math.abs(band.highHeightM - 3333.33) < 1);
	assert.equal(band.source, 'humidity-heuristic');
	assert.equal(band.lowerBoundaryKnown, true);
	assert.equal(band.upperBoundaryKnown, true);
	assert.equal(humidityCloudBands(frame, 2500, 9000)[0].lowHeightM, 2500);
});

test('humidity cloud bands use valid levels above 9000m to estimate an above-frame cloud top', () => {
	const frame = { levels: [
		{ heightM: 8_000, pressureLevelIndex: 0, relativeHumidityPct: 80 },
		{ heightM: 8_500, pressureLevelIndex: 1, relativeHumidityPct: 95 },
		{ heightM: 9_500, pressureLevelIndex: 2, relativeHumidityPct: 95 },
		{ heightM: 10_500, pressureLevelIndex: 3, relativeHumidityPct: 80 },
	] };
	const [band] = humidityCloudBands(frame, null, 9_000);
	assert.ok(band.highHeightM > 9_000);
	assert.equal(band.extendsAboveMaxHeight, true);
	assert.equal(band.upperBoundaryKnown, true);
	assert.ok(Math.abs(band.highHeightM - 9_833.33) < 1);

	const geometry = buildCrossSectionGeometry([
		{ distanceM: 0, terrainElevationM: 0, profile: { frames: [{ timestampMs: 1_790_000_000_000, ...frame }] } },
	], 1_790_000_000_000, 'thickness', 9_000);
	assert.equal(geometry.possibleCloudBands.length, 1);
	assert.equal(geometry.possibleCloudBands[0].extendsAboveChart, true);
	assert.equal(geometry.possibleCloudBands[0].y, geometry.plot.top);
	assert.ok(geometry.possibleCloudBands[0].height <= geometry.plot.bottom - geometry.plot.top);
});

test('missing humidity breaks possible-cloud bands instead of being bridged', () => {
	const bands = humidityCloudBands({ levels: [
		{ heightM: 1000, relativeHumidityPct: 95 },
		{ heightM: 2000, relativeHumidityPct: null },
		{ heightM: 3000, relativeHumidityPct: 96 },
	] });
	assert.equal(bands.length, 2);
	assert.equal(bands[0].upperBoundaryKnown, false);
	assert.equal(bands[1].lowerBoundaryKnown, false);
});

test('duplicate geopotential heights do not define humidity or direct-cloud bands', () => {
	const levels = [
		{ heightM: 4_000, pressureLevelIndex: 0, relativeHumidityPct: 80, cloudPct: 0 },
		{ heightM: 5_000, pressureLevelIndex: 1, relativeHumidityPct: 95, cloudPct: 60 },
		{ heightM: 5_000, pressureLevelIndex: 2, relativeHumidityPct: 98, cloudPct: 80 },
		{ heightM: 6_000, pressureLevelIndex: 3, relativeHumidityPct: 80, cloudPct: 0 },
	];
	assert.deepEqual(humidityCloudBands({ levels }), []);
	assert.deepEqual(directCloudLayerBands({ levels }), []);
});

test('subterrain humidity cannot define a known lower cloud boundary', () => {
	const bands = humidityCloudBands({ levels: [
		{ heightM: 2_000, pressureLevelIndex: 0, relativeHumidityPct: 80 },
		{ heightM: 3_000, pressureLevelIndex: 1, relativeHumidityPct: 95 },
		{ heightM: 4_000, pressureLevelIndex: 2, relativeHumidityPct: 80 },
	] }, 2_500);
	assert.equal(bands.length, 1);
	assert.equal(bands[0].lowHeightM, 2_500);
	assert.equal(bands[0].lowerBoundaryKnown, false);
	assert.equal(bands[0].upperBoundaryKnown, true);
});

test('estimates direct cloud bands from adjacent non-zero cloud layers without claiming exact boundaries', () => {
	const bands = directCloudLayerBands({ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, cloudPct: 0 },
		{ heightM: 2_000, pressureLevelIndex: 1, cloudPct: 25 },
		{ heightM: 3_000, pressureLevelIndex: 2, cloudPct: 80 },
		{ heightM: 4_000, pressureLevelIndex: 3, cloudPct: 0 },
	] });
	assert.equal(bands.length, 1);
	assert.equal(bands[0].lowHeightM, 1_500);
	assert.equal(bands[0].highHeightM, 3_500);
	assert.equal(bands[0].thicknessM, 2_000);
	assert.equal(bands[0].peakCloudPct, 80);
	assert.equal(bands[0].levelCount, 2);
	assert.equal(bands[0].lowerBoundaryKnown, true);
	assert.equal(bands[0].upperBoundaryKnown, true);
	assert.equal(bands[0].source, 'model-cloud-layer-estimate');
});

test('keeps cloud gaps and unknown boundaries separate, and clips lower estimates at terrain', () => {
	const bands = directCloudLayerBands({ levels: [
		{ heightM: 1_000, pressureLevelIndex: 0, cloudPct: 0 },
		{ heightM: 2_000, pressureLevelIndex: 1, cloudPct: 60 },
		{ heightM: 3_000, pressureLevelIndex: 2, cloudPct: null },
		{ heightM: 4_000, pressureLevelIndex: 3, cloudPct: 70 },
		{ heightM: 5_000, pressureLevelIndex: 4, cloudPct: 0 },
	] });
	assert.equal(bands.length, 2);
	assert.equal(bands[0].lowerBoundaryKnown, true);
	assert.equal(bands[0].upperBoundaryKnown, false);
	assert.equal(bands[0].thicknessM, null);
	assert.equal(bands[1].lowerBoundaryKnown, false);
	assert.equal(bands[1].upperBoundaryKnown, true);
	assert.equal(directCloudLayerBands({ levels: [
		{ heightM: 2_000, pressureLevelIndex: 0, cloudPct: 0 },
		{ heightM: 3_000, pressureLevelIndex: 1, cloudPct: 70 },
		{ heightM: 4_000, pressureLevelIndex: 2, cloudPct: 0 },
	] }, 2_500)[0].lowHeightM, 2_500);
	assert.equal(directCloudLayerBands({ levels: [
		{ heightM: 2_000, pressureLevelIndex: 0, cloudPct: 0 },
		{ heightM: 3_000, pressureLevelIndex: 1, cloudPct: 70 },
		{ heightM: 4_000, pressureLevelIndex: 2, cloudPct: 0 },
	] }, 2_500)[0].lowerBoundaryKnown, false);
});

test('assesses direct cloud base alongside high-humidity estimates without overstating cloud certainty', () => {
	assert.equal(assessCloudAtHeight({ reason: 'below-terrain' }, [], 5_000, 4_000).kind, 'insufficient');
	const belowBase = assessCloudAtHeight({ humidityPct: 50, cloudPct: null }, [], 3_000, 3_500);
	assert.equal(belowBase.kind, 'outside');
	assert.match(belowBase.text, /直接云底/);
	const belowBaseImperial = assessCloudAtHeight({ humidityPct: 50, cloudPct: null }, [], 3_000, 3_500, 'imperial');
	assert.match(belowBaseImperial.text, /英尺/);
	const aboveBase = assessCloudAtHeight({ humidityPct: null, cloudPct: null }, [], 4_000, 3_500);
	assert.equal(aboveBase.kind, 'uncertain');
	const humidityConflict = assessCloudAtHeight({ humidityPct: 95, cloudPct: 0 }, [{ lowHeightM: 4_000, highHeightM: 5_000 }], 4_500);
	assert.equal(humidityConflict.kind, 'uncertain');
	const estimatedCloud = assessCloudAtHeight({ humidityPct: 95, cloudPct: null }, [{ lowHeightM: 4_000, highHeightM: 5_000 }], 4_500);
	assert.equal(estimatedCloud.kind, 'possible');
	const directCloud = assessCloudAtHeight({ humidityPct: null, cloudPct: 40 }, [], 4_500, 3_500);
	assert.equal(directCloud.kind, 'possible');
});

test('route thickness view retains direct cloud bands and RH estimates while leaving weather cells missing', () => {
	const profile = parseWindyProfile(makePayload());
	const frame = {
		...profile.frames[0],
		levels: profile.frames[0].levels.map((level, index) => ({
			...level,
			relativeHumidityPct: [80, 95, 80][index],
		})),
	};
	const sample = { name: '起点', distanceM: 0, terrainElevationM: 0, profile: { ...profile, frames: [frame] } };
	const geometry = buildCrossSectionGeometry([sample], frame.timestampMs, 'thickness');
	assert.ok(geometry.possibleCloudBands[0].band.thicknessM > 0);
	assert.equal(geometry.directCloudBands.length, 1);
	assert.equal(geometry.directCloudBands[0].band.thicknessM, null);
	assert.equal(geometry.cells.every(cell => cell.missing), true);
	const cloudGeometry = buildCrossSectionGeometry([sample], frame.timestampMs, 'cloud');
	assert.equal(cloudGeometry.cells.some(cell => !cell.missing), true);
});
