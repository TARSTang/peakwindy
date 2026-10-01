import { mapWithConcurrency, isWindyRateLimit } from './async.js';
import {
	directPath,
	mountainGrid,
	mountainSectors,
	terrainSight,
	rayHeight,
	bearing,
	EARTH_RADIUS_M,
	deg,
} from './observation-geometry.js';
import { cloudAtRay, fogAtGround, summarizeCloud, summarizeFog } from './observation-weather.js';

export function createObservationRunner({
	elevation,
	weather,
	onProgress = () => {},
}) {
	let controller = null,
		generation = 0;
	const cancel = () => {
		generation++;
		controller?.abort();
	};
	async function run(config) {
		cancel();
		const id = generation;
		controller = new AbortController();
		const signal = controller.signal;
		const result = {
			config: structuredClone(config),
			stage: 'terrain',
			grid: [],
			sectors: [],
			weatherPoints: [],
			unknowns: ['实际透明度未知', '采样点之间的地形与天气未知'],
		};
		let completed = 0,
			total = 0,
			rateLimited = false;
	const publish = () => {
		if (result.weatherPoints?.length)
			result.cloud = summarizeCloud(result.weatherPoints);
		const fogPoints = [
			...(result.weatherPoints ?? []),
			...(result.sectors ?? []).map((sector) => sector.weatherPoint).filter(Boolean),
		];
		if (fogPoints.length) result.fog = summarizeFog(fogPoints);
		if (id === generation && !signal.aborted)
				onProgress({ ...result, completed, total });
		};
		const checkpoint = () => {
			if (signal.aborted || id !== generation)
				throw new DOMException('已取消', 'AbortError');
			if (rateLimited) throw new Error('Windy 请求限流');
		};
		const readElevation = async (p) => {
			try {
				const v = await elevation(p, signal);
				checkpoint();
				p.elevationM = Number.isFinite(v) ? v : null;
			} catch (e) {
				if (e.name === 'AbortError') throw e;
				if (isWindyRateLimit(e)) rateLimited = true;
				p.error = rateLimited ? 'Windy 限流' : '地形读取失败';
			}
			completed++;
			publish();
			return p;
		};
		const batch = async (items, worker) => {
			total += items.length;
			publish();
			await mapWithConcurrency(
				items,
				3,
				worker,
				() => signal.aborted || id !== generation || rateLimited,
			);
			checkpoint();
		};
		const readWeather = async (p) => {
			try {
				const profile = await weather(p, config.model, signal);
				checkpoint();
				p.profile = profile;
				p.cloud = cloudAtRay(
					p.profile,
					p.timestampMs ?? config.timestampMs,
					p.rayM,
					p.elevationM,
				);
				p.fog = fogAtGround(
					p.profile,
					p.timestampMs ?? config.timestampMs,
					p.remainingDistanceM,
				);
			} catch (e) {
				if (e.name === 'AbortError') throw e;
				if (isWindyRateLimit(e)) rateLimited = true;
				p.error = rateLimited ? 'Windy 限流' : '天气读取失败';
				p.cloud = { status: 'unknown', reason: p.error };
				p.fog = { status: 'unknown', reason: `雾／能见度资料不足：${p.error}` };
			}
			completed++;
			publish();
			return p;
		};
		try {
			{
				const camera = { ...config.camera },
					peak = { ...config.peak };
				const main = directPath(camera, peak);
				result.camera = camera;
				result.peak = peak;
				await batch([camera, peak], readElevation);
				camera.elevationM = Number.isFinite(config.camera.actualM)
					? config.camera.actualM
					: camera.elevationM;
				peak.elevationM = Number.isFinite(config.peak.actualM)
					? config.peak.actualM
					: peak.elevationM;
				const viewerM = Number.isFinite(camera.elevationM)
					? camera.elevationM + config.eyeM
					: null;
				result.viewerM = viewerM;
				result.grid = mountainGrid(peak, config.radiusM);
				await batch(result.grid, readElevation);
				// Correct the summit cell only. Neighbours retain Windy's own terrain values.
				if (Number.isFinite(config.peak.actualM))
					result.grid[40].elevationM = config.peak.actualM;
				result.sectors = mountainSectors(result.grid, camera, viewerM);
				for (const point of main)
					point.rayM =
						Number.isFinite(viewerM) && Number.isFinite(peak.elevationM)
							? rayHeight(
									viewerM,
									peak.elevationM,
									point.distanceM,
									main.at(-1).distanceM,
								)
							: null;
				result.sight = {
					status: 'unknown',
					reason: '通视路径尚未完成',
					path: main,
				};
				await batch(main, readElevation);
				result.sight = terrainSight(main, viewerM, peak.elevationM);
				result.distanceM = main.at(-1).distanceM;
				result.bearingDeg = bearing(camera, peak);
				result.angleDeg =
					Number.isFinite(viewerM) && Number.isFinite(peak.elevationM)
						? deg(
								Math.atan2(
									peak.elevationM -
										viewerM -
										result.distanceM ** 2 / (2 * EARTH_RADIUS_M),
									result.distanceM,
								),
							)
						: null;
				for (const sector of result.sectors) {
					checkpoint();
					if (!sector.representative || sector.facing === false) continue;
					const path = directPath(camera, sector.representative);
					for (const point of path)
						point.rayM =
							Number.isFinite(viewerM) &&
							Number.isFinite(sector.representative.elevationM)
								? rayHeight(
										viewerM,
										sector.representative.elevationM,
										point.distanceM,
										path.at(-1).distanceM,
									)
								: null;
					sector.sight = {
						status: 'unknown',
						reason: '分区通视路径尚未完成',
						path,
					};
					await batch(path, readElevation);
					sector.sight = terrainSight(
						path,
						viewerM,
						sector.representative.elevationM,
					);
					sector.status = sector.sight.status;
					sector.reason = sector.sight.reason;
					if (sector.sight.status === 'blocked') {
						const remainingM =
							path.at(-1).distanceM - sector.sight.obstruction.distanceM;
						sector.obstructionKind =
							remainingM <= config.radiusM * 2 ? 'self' : 'ridge';
						sector.reason = `${sector.obstructionKind === 'self' ? '局部山体自身遮挡' : '远处山脊遮挡'}：${sector.sight.reason}`;
					}
					// The dense representative path includes local ridges, so self-occlusion shares this evidence.
					if (
						!sector.normal ||
						sector.cells.some((p) => !Number.isFinite(p.elevationM))
					) {
						if (sector.status === 'clear') sector.status = 'unknown';
						sector.reason += '；坡面法向或分区地形不足';
					}
					publish();
				}
				result.stage = 'weather';
				result.weatherPoints = directPath(camera, peak, 5000, 41).map((p) => ({
					...p,
					remainingDistanceM: Math.max(0, result.distanceM - p.distanceM),
					rayM:
						Number.isFinite(viewerM) && Number.isFinite(peak.elevationM)
							? rayHeight(
									viewerM,
									peak.elevationM,
									p.distanceM,
									result.distanceM,
								)
							: null,
				}));
				await batch(result.weatherPoints, readElevation);
				await batch(result.weatherPoints, readWeather);
				for (const sector of result.sectors) {
					if (!sector.representative) continue;
					sector.weatherPoint = {
						...sector.representative,
						distanceM: sector.sight?.path?.at(-1)?.distanceM ?? null,
						remainingDistanceM: 0,
						rayM: sector.representative.elevationM,
					};
					await batch([sector.weatherPoint], readWeather);
					// Main-direction samples plus representative endpoint; lateral path weather remains explicitly unknown.
					const endpointCloud = summarizeCloud([sector.weatherPoint]);
					sector.cloud =
						endpointCloud.status === 'blocked'
							? endpointCloud
							: {
									status: 'unknown',
									reason: '分区代表点外的侧向视线天气未独立采样',
								};
					sector.weatherNotice =
						'主路径天气与分区代表点；分区侧向路径未独立密集采样';
				}
				result.cloud = summarizeCloud(result.weatherPoints);
			}
			result.stage = 'complete';
			publish();
			return result;
		} catch (e) {
			result.stage =
				e.name === 'AbortError'
					? 'cancelled'
					: rateLimited
						? 'rate-limited'
						: 'error';
			result.error =
				e.name === 'AbortError'
					? '已取消，未完成区域保持未知'
					: rateLimited
						? 'Windy 请求限流，已停止新增请求；保留已完成证据'
						: e.message;
			// Cancellations retain completed evidence; callers reject obsolete generations.
			return result;
		}
	}
	return {
		cancel,
		analyze: (config) => run(config),
	};
}
