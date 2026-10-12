import { isWindyRateLimit, mapWithConcurrency } from './async.js';
import { profileMatchesRequestedModel } from './profile.js';
import { createSightlinePlan, sightlineRefinementPoints } from './sightline.js';

// Separate orchestration from geometry and UI. Callers supply cached Windy
// requests; their shared limiter remains the only network concurrency gate.
export async function runSightlineAnalysis(options, onUpdate, signal) {
	const { start, end, model, step, eyeHeightM, fetchElevation, fetchProfile } = options;
	const state = { plan: null, terrain: [], weather: [], phase: 'endpoints', completed: 0, total: 2, rateLimited: false, cancelled: false };
	let stopped = false;
	const publish = () => onUpdate({ ...state, terrain: [...state.terrain], weather: [...state.weather] });
	const cancelled = () => signal.aborted || stopped;
	const elevation = async point => {
		try { return await fetchElevation(point, signal); }
		catch (error) {
			if (isWindyRateLimit(error)) { stopped = true; state.rateLimited = true; }
			return null;
		}
	};
	publish();
	const endpoints = await mapWithConcurrency([start, end], 2, async (point, index) => {
		const override = index === 0 ? options.startGroundM : options.targetElevationM;
		const value = Number.isFinite(override) ? override : await elevation(point);
		state.completed++; publish(); return value;
	}, cancelled);
	if (cancelled()) { state.cancelled = signal.aborted; state.phase = 'stopped'; publish(); return state; }
	state.plan = createSightlinePlan(start, end, endpoints[0], endpoints[1], eyeHeightM);
	state.terrain = state.plan.terrainPoints.map(point => ({ ...point, elevationM: null }));
	state.weather = state.plan.weatherPoints.map((point, index) => ({ ...point, key: `sight-${index}`,
		name: index === 0 ? start.name : index === state.plan.weatherPoints.length - 1 ? end.name : `天气采样 ${index + 1}`,
		profile: null, terrainElevationM: null, error: '尚未读取' }));
	state.phase = 'terrain'; state.completed = 0; state.total = state.terrain.length; publish();
	await mapWithConcurrency(state.terrain, 3, async (point, index) => {
		const value = point.endpoint ? point.fraction === 0 ? endpoints[0] : endpoints[1] : await elevation(point);
		if (signal.aborted) return;
		state.terrain[index] = { ...point, elevationM: Number.isFinite(value) ? value : null };
		state.completed++; publish();
	}, cancelled);
	if (!cancelled()) {
		const refined = sightlineRefinementPoints(state.plan, state.terrain).map(point => ({ ...point, elevationM: null }));
		const baseCount = state.terrain.length;
		state.terrain.push(...refined); state.total += refined.length; publish();
		await mapWithConcurrency(refined, 3, async (point, index) => {
			const value = await elevation(point);
			if (signal.aborted) return;
			state.terrain[baseCount + index] = { ...point, elevationM: Number.isFinite(value) ? value : null };
			state.completed++; publish();
		}, cancelled);
	}
	state.terrain.sort((a, b) => a.distanceM - b.distanceM);
	if (!cancelled()) {
		state.phase = 'weather'; state.completed = 0; state.total = state.weather.length; publish();
		await mapWithConcurrency(state.weather, 3, async (point, index) => {
			let profile = null, error = '';
			try {
				const parsed = await fetchProfile(point, model, step, signal);
				if (parsed.ok && profileMatchesRequestedModel(parsed, model)) profile = parsed;
				else error = parsed.ok ? 'Windy 返回模式与所选模式不一致' : parsed.error || '预报缺测';
			} catch (failure) {
				error = isWindyRateLimit(failure) ? 'Windy 请求达到频率限制' : failure instanceof Error ? failure.message : String(failure);
				if (isWindyRateLimit(failure)) { stopped = true; state.rateLimited = true; }
			}
			if (signal.aborted) return;
			const exact = state.terrain.find(sample => Math.abs(sample.distanceM - point.distanceM) < 0.01 && Number.isFinite(sample.elevationM));
			const ground = exact ? exact.elevationM : !cancelled() ? await elevation(point) : null;
			if (signal.aborted) return;
			state.weather[index] = { ...point, profile, terrainElevationM: ground, error };
			state.completed++; publish();
		}, cancelled);
	}
	state.cancelled = signal.aborted;
	state.phase = cancelled() ? 'stopped' : 'complete'; publish();
	return state;
}
