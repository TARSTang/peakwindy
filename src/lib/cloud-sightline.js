import { distanceMeters } from './route.js';
import { frameAtTimestamp, interpolateAtHeight, humidityCloudBands, directCloudLayerBands, explainProfileQuery } from './profile.js';

const R = 6371008.8;
function heightInput(text, fallback) {
	if (!String(text ?? '').trim()) return Number.isFinite(fallback) ? fallback : null;
	const value = Number(text);
	return Number.isFinite(value) && value >= -500 && value <= 10000 ? value : null;
}

// Straight chord on a sphere, expressed as MSL along the great-circle arc.
export function cloudSightlineHeight(distanceM, observerM, targetM, fraction) {
	if (fraction === 0) return observerM;
	if (fraction === 1) return targetM;
	const angle = distanceM / R, a = R + observerM, b = R + targetM;
	return a * b * Math.sin(angle) / (b * Math.sin(angle * (1 - fraction)) + a * Math.sin(angle * fraction)) - R;
}

export function buildCloudSightline(points, samples, timestampMs, startText, targetText, eyeHeightM, geometry) {
	const empty = reason => ({ ok: false, reason, path: '', marks: [], cloudCount: 0, humidCount: 0, unknownCount: 0 });
	if (points?.length !== 2) return empty('请仅保留两个路线点：首点为机位，末点为雪山。转折路线不能当作直达视线。');
	const distanceM = distanceMeters(points[0], points[1]);
	if (!(distanceM >= 10 && distanceM <= 500000)) return empty('两点距离须在 10 米～500 千米之间。');
	if (!samples?.length || distanceMeters(points[0], samples[0]) > 50 || distanceMeters(points[1], samples.at(-1)) > 50
		|| !Number.isFinite(distanceMeters(points[0], samples[0])) || !Number.isFinite(distanceMeters(points[1], samples.at(-1)))) return empty('请先读取当前两点的路线天气，旧路线数据不能用于新视线。');
	const ground = sample => Number.isFinite(sample?.terrainElevationM) ? sample.terrainElevationM : sample?.profile?.modelElevationM;
	const startGround = heightInput(startText, points[0].elevationM ?? ground(samples?.[0]));
	const targetM = heightInput(targetText, points[1].elevationM ?? ground(samples?.at(-1)));
	const eye = Number(eyeHeightM);
	if (startGround === null || targetM === null) return empty('请填写有效的两端海拔（−500～10000 米），或先读取路线天气获取端点地形。');
	if (!Number.isFinite(eye) || eye < 0 || eye > 100) return empty('视点离地高度须在 0～100 米之间。');
	const observerM = startGround + eye;
	const at = fraction => cloudSightlineHeight(distanceM, observerM, targetM, fraction);
	const marks = (samples ?? []).map((sample, index) => {
		const fraction = Math.max(0, Math.min(1, sample.distanceM / distanceM));
		const heightM = at(fraction);
		const frame = frameAtTimestamp(sample.profile?.frames, timestampMs);
		// Endpoint corrections affect the endpoint only. Never move interior terrain.
		const terrainM = index === 0 ? startGround : index === samples.length - 1 ? targetM : ground(sample);
		// A corrected real elevation cannot turn the model's underground layers
		// into atmospheric evidence. Keep that independent lower boundary.
		const modelGround = sample.profile?.modelElevationM;
		const weatherGround = Number.isFinite(modelGround) ? Math.max(terrainM ?? -Infinity, modelGround) : terrainM;
		const values = interpolateAtHeight(frame, heightM, weatherGround);
		const band = directCloudLayerBands(frame, weatherGround).some(item => heightM >= item.lowHeightM && heightM <= item.highHeightM);
		const humid = values.humidityPct >= 90 || humidityCloudBands(frame, weatherGround).some(item => heightM >= item.lowHeightM && heightM <= item.highHeightM);
		let kind = 'unknown', text = '该视线高度云量缺测';
		if (!frame) text = '所选时次缺测';
		else if (values.reason === 'below-terrain') text = `视线 ${Math.round(heightM)} 米低于天气有效地表边界 ${Math.round(weatherGround)} 米（含模式地形），无有效高空天气；本功能不判断地形通视`;
		else if (Number.isFinite(values.cloudPct) && values.cloudPct > 0) { kind = 'cloud'; text = `视线高度模式云量 ${Math.round(values.cloudPct)}%，存在云层相交信号`; }
		else if (band) { kind = 'cloud'; text = '视线落在模式云层估算范围内；该高度云量可能缺测'; }
		else if (humid) { kind = 'humid'; text = values.cloudPct === 0 ? '模式云量为 0%，但存在高湿信号，不能确认无云' : '存在高湿可能云区信号，不能确认实际有云'; }
		else if (values.cloudPct === 0 && Number.isFinite(terrainM)) { kind = 'clear'; text = '该采样点视线高度模式云量为 0%；不保证实况可见'; }
		else if (!Number.isFinite(terrainM)) text = '采样点地形高度缺测，无法确认该天气层在地表以上';
		else if (!Number.isFinite(values.cloudPct) || !Number.isFinite(values.humidityPct)) text = explainProfileQuery(frame, heightM, weatherGround);
		return { index, name: sample.name, distanceM: sample.distanceM, heightM, values, kind, text,
			x: geometry.x(sample.distanceM), y: geometry.y(heightM), visible: heightM >= 0 && heightM <= geometry.maxHeightM };
	});
	// Clip by breaking segments outside the chart, rather than clamping to an axis.
	let pen = false, path = '';
	for (let index = 0; index <= 160; index++) {
		const fraction = index / 160, height = at(fraction);
		if (height < 0 || height > geometry.maxHeightM) { pen = false; continue; }
		path += `${pen ? 'L' : 'M'}${geometry.x(distanceM * fraction).toFixed(2)},${geometry.y(height).toFixed(2)} `; pen = true;
	}
	const correctionWarnings = [
		Number.isFinite(ground(samples[0])) && Math.abs(startGround - ground(samples[0])) > 300 ? `机位「${points[0].name}」校正海拔 ${Math.round(startGround)} 米，与原采样地形 ${Math.round(ground(samples[0]))} 米相差较大，请核对路线顺序与坐标。` : '',
		Number.isFinite(ground(samples.at(-1))) && Math.abs(targetM - ground(samples.at(-1))) > 300 ? `目标「${points[1].name}」校正海拔 ${Math.round(targetM)} 米，与原采样地形 ${Math.round(ground(samples.at(-1)))} 米相差较大，请核对坐标。` : ''
	].filter(Boolean);
	return { ok: true, reason: '', distanceM, observerM, targetM, path, marks, correctionWarnings,
		observerName: points[0].name, targetName: points[1].name,
		clearCount: marks.filter(mark => mark.kind === 'clear').length,
		cloudCount: marks.filter(mark => mark.kind === 'cloud').length,
		humidCount: marks.filter(mark => mark.kind === 'humid').length,
		unknownCount: marks.filter(mark => mark.kind === 'unknown').length,
		outsideChart: marks.some(mark => !mark.visible) || Array.from({length: 161}, (_, i) => at(i / 160)).some(h => h < 0 || h > geometry.maxHeightM) };
}
