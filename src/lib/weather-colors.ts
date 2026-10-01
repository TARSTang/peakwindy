/** Shared saturated colors for weather values, ranges, and evidence types. */
export const WEATHER_COLORS = {
	cloud: {
		light: '#20c997',
		moderate: '#ffd43b',
		heavy: '#ff8738',
		veryHeavy: '#f04468',
	},
	humidity: {
		veryLow: '#3478f6',
		low: '#08b8d4',
		moderate: '#20b486',
		high: '#e8c51f',
		veryHigh: '#ed7134',
	},
	temperature: {
		veryCold: '#3978ee',
		cold: '#12b8d2',
		cool: '#8bd7b6',
		mild: '#f1ca45',
	warm: '#f18a36',
		hot: '#e64b5d',
	},
	wind: {
		calm: '#55d5f5',
		light: '#3986f5',
		moderate: '#6558dc',
		strong: '#a64de0',
		veryStrong: '#e94787',
	},
	evidence: {
		estimatedCloud: '#e879f9',
		estimatedCloudFill: '#592568',
		missing: '#aab4c4',
		missingFill: '#626d80',
	},
	precipitation: {
		rain: '#38bdf8',
		snow: '#eaf2ff',
	},
	series: {
		temperature: '#ff6b81',
		humidity: '#31d4e5',
		wind: '#ffd166',
		cloud: '#c084fc',
	},
} as const;

const cssVariables: Record<string, string> = {
	'--wx-cloud-light': WEATHER_COLORS.cloud.light,
	'--wx-cloud-moderate': WEATHER_COLORS.cloud.moderate,
	'--wx-cloud-heavy': WEATHER_COLORS.cloud.heavy,
	'--wx-cloud-very-heavy': WEATHER_COLORS.cloud.veryHeavy,
	'--wx-humidity-very-low': WEATHER_COLORS.humidity.veryLow,
	'--wx-humidity-low': WEATHER_COLORS.humidity.low,
	'--wx-humidity-moderate': WEATHER_COLORS.humidity.moderate,
	'--wx-humidity-high': WEATHER_COLORS.humidity.high,
	'--wx-humidity-very-high': WEATHER_COLORS.humidity.veryHigh,
	'--wx-estimated-cloud': WEATHER_COLORS.evidence.estimatedCloud,
	'--wx-estimated-cloud-fill': WEATHER_COLORS.evidence.estimatedCloudFill,
	'--wx-missing': WEATHER_COLORS.evidence.missing,
	'--wx-missing-fill': WEATHER_COLORS.evidence.missingFill,
	'--wx-rain': WEATHER_COLORS.precipitation.rain,
	'--wx-snow': WEATHER_COLORS.precipitation.snow,
	'--wx-series-temperature': WEATHER_COLORS.series.temperature,
	'--wx-series-humidity': WEATHER_COLORS.series.humidity,
	'--wx-series-wind': WEATHER_COLORS.series.wind,
	'--wx-series-cloud': WEATHER_COLORS.series.cloud,
};

export const WEATHER_COLOR_STYLE = Object.entries(cssVariables)
	.map(([name, color]) => `${name}:${color}`)
	.join(';');

export function cloudCoverageColor(value: number | null): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return WEATHER_COLORS.evidence.missing;
	if (value <= 0) return 'transparent';
	if (value <= 25) return WEATHER_COLORS.cloud.light;
	if (value <= 50) return WEATHER_COLORS.cloud.moderate;
	if (value <= 75) return WEATHER_COLORS.cloud.heavy;
	return WEATHER_COLORS.cloud.veryHeavy;
}

export function humidityColor(value: number | null): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return WEATHER_COLORS.evidence.missing;
	if (value < 40) return WEATHER_COLORS.humidity.veryLow;
	if (value < 60) return WEATHER_COLORS.humidity.low;
	if (value < 75) return WEATHER_COLORS.humidity.moderate;
	if (value < 90) return WEATHER_COLORS.humidity.high;
	return WEATHER_COLORS.humidity.veryHigh;
}

export function temperatureColor(value: number | null): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return WEATHER_COLORS.evidence.missing;
	if (value < -30) return WEATHER_COLORS.temperature.veryCold;
	if (value < -10) return WEATHER_COLORS.temperature.cold;
	if (value < 0) return WEATHER_COLORS.temperature.cool;
	if (value < 10) return WEATHER_COLORS.temperature.mild;
	if (value < 20) return WEATHER_COLORS.temperature.warm;
	return WEATHER_COLORS.temperature.hot;
}

export function windColor(value: number | null): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return WEATHER_COLORS.evidence.missing;
	if (value < 5) return WEATHER_COLORS.wind.calm;
	if (value < 10) return WEATHER_COLORS.wind.light;
	if (value < 20) return WEATHER_COLORS.wind.moderate;
	if (value < 30) return WEATHER_COLORS.wind.strong;
	return WEATHER_COLORS.wind.veryStrong;
}

export function cloudThicknessColor(value: number | null): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return WEATHER_COLORS.evidence.missing;
	if (value < 500) return WEATHER_COLORS.cloud.light;
	if (value < 1_500) return WEATHER_COLORS.cloud.moderate;
	if (value < 3_000) return WEATHER_COLORS.cloud.heavy;
	return WEATHER_COLORS.cloud.veryHeavy;
}
