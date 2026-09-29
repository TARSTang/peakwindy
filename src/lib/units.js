const METRES_PER_FOOT = 0.3048;
const METRES_PER_MILE = 1_609.344;
const MILLIMETRES_PER_INCH = 25.4;

export function heightToDisplay(metres, system = 'metric') {
	if (!Number.isFinite(metres)) return null;
	return system === 'imperial' ? metres / METRES_PER_FOOT : metres;
}

export function heightFromDisplay(value, system = 'metric') {
	if (!Number.isFinite(value)) return null;
	return system === 'imperial' ? value * METRES_PER_FOOT : value;
}

export function parseAltitudeList(input, system = 'metric', maxCount = 200, maxHeightM = 20_000) {
	if (typeof input !== 'string' || !Number.isFinite(maxCount) || maxCount < 1 || !Number.isFinite(maxHeightM) || maxHeightM <= 0) {
		return { ok: false, heightsM: [], error: '高度列表参数无效' };
	}
	const tokens = input.trim().split(/[,，;；、\s]+/).filter(Boolean);
	if (!tokens.length) return { ok: true, heightsM: [], error: '' };
	if (tokens.length > maxCount) return { ok: false, heightsM: [], error: `一次最多查询 ${maxCount} 个高度；当前输入 ${tokens.length} 个，未删减任何项目` };
	const heightsM = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		const match = token.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(米|m|英尺|ft|feet)?$/i);
		if (!match) return { ok: false, heightsM: [], error: `第 ${index + 1} 项不是有效高度：${token}` };
		const value = Number(match[1]);
		const unit = match[2]?.toLowerCase() ?? '';
		const heightM = unit === 'm' || unit === '米' ? value
			: unit === 'ft' || unit === 'feet' || unit === '英尺' ? value * METRES_PER_FOOT
				: heightFromDisplay(value, system);
		if (!Number.isFinite(heightM) || heightM < 0 || heightM > maxHeightM) {
			return { ok: false, heightsM: [], error: `第 ${index + 1} 项超出 0–${maxHeightM} 米范围：${token}` };
		}
		heightsM.push(heightM);
	}
	return { ok: true, heightsM, error: '' };
}

export function temperatureToDisplay(celsius, system = 'metric') {
	if (!Number.isFinite(celsius)) return null;
	return system === 'imperial' ? celsius * 9 / 5 + 32 : celsius;
}

export function temperatureFromDisplay(value, system = 'metric') {
	if (!Number.isFinite(value)) return null;
	return system === 'imperial' ? (value - 32) * 5 / 9 : value;
}

export function windToDisplay(metresPerSecond, system = 'metric') {
	if (!Number.isFinite(metresPerSecond)) return null;
	return system === 'imperial' ? metresPerSecond * 2.2369362920544 : metresPerSecond;
}

export function windFromDisplay(value, system = 'metric') {
	if (!Number.isFinite(value)) return null;
	return system === 'imperial' ? value / 2.2369362920544 : value;
}

export function distanceToDisplay(metres, system = 'metric') {
	if (!Number.isFinite(metres)) return null;
	return system === 'imperial' ? metres / METRES_PER_MILE : metres / 1_000;
}

export function precipitationToDisplay(millimetres, system = 'metric') {
	if (!Number.isFinite(millimetres)) return null;
	return system === 'imperial' ? millimetres / MILLIMETRES_PER_INCH : millimetres;
}

export function heightUnit(system = 'metric') {
	return system === 'imperial' ? '英尺' : '米';
}

export function temperatureUnit(system = 'metric') {
	return system === 'imperial' ? '℉' : '℃';
}

export function windUnit(system = 'metric') {
	return system === 'imperial' ? '英里/小时' : '米/秒';
}

export function distanceUnit(system = 'metric') {
	return system === 'imperial' ? '英里' : '千米';
}

export function precipitationUnit(system = 'metric') {
	return system === 'imperial' ? '英寸' : '毫米';
}
