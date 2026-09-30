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
	dot,
	rad,
} from './observation-geometry.js';
import { cloudAtRay, summarizeCloud } from './observation-weather.js';
import { solarWindows, solarPath } from './observation-solar.js';

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
	async function run(config, previous, solarWindow) {
		cancel();
		const id = generation;
		controller = new AbortController();
		const signal = controller.signal;
		const result = solarWindow
			? { ...structuredClone(previous), solarPaths: [] }
			: {
					config: structuredClone(config),
					stage: 'terrain',
					grid: [],
					sectors: [],
					weatherPoints: [],
					windows: [],
					solarPaths: [],
					unknowns: [
						'雪面覆盖与金色效果未确认',
						'实际透明度未知',
						'采样点之间的地形与天气未知',
					],
				};
		let completed = 0,
			total = 0,
			rateLimited = false;
		const publish = () => {
			if (result.weatherPoints?.length)
				result.cloud = summarizeCloud(result.weatherPoints);
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
			} catch (e) {
				if (e.name === 'AbortError') throw e;
				if (isWindyRateLimit(e)) rateLimited = true;
				p.error = rateLimited ? 'Windy 限流' : '天气读取失败';
				p.cloud = { status: 'unknown', reason: p.error };
			}
			completed++;
			publish();
			return p;
		};
		try {
			if (!solarWindow) {
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
				result.windows = solarWindows(
					config.date,
					peak,
					result.sectors.filter((s) => s.status === 'clear'),
					result.grid,
				);
			} else {
				result.stage = 'solar';
				const times = [
					solarWindow.startMs,
					Math.round((solarWindow.startMs + solarWindow.endMs) / 2),
					solarWindow.endMs,
				];
				for (const timestampMs of [...new Set(times)])
					for (const sectorId of solarWindow.sectorIds) {
						const sector = result.sectors.find((s) => s.id === sectorId);
						if (!sector?.representative) continue;
						const path = solarPath(sector.representative, timestampMs);
						const sun = path.sun;
						const sunVector = [
							Math.sin(rad(sun.azimuthDeg)) *
								Math.cos(rad(sun.geometricAltitudeDeg)),
							Math.cos(rad(sun.azimuthDeg)) *
								Math.cos(rad(sun.geometricAltitudeDeg)),
							Math.sin(rad(sun.geometricAltitudeDeg)),
						];
						const evidence = {
							sectorId,
							timestampMs,
							...path,
							weatherPoints: [],
							status: 'unknown',
							sunFacing: sector.normal
								? dot(sector.normal, sunVector) > 0
								: null,
						};
						result.solarPaths = [...result.solarPaths, evidence];
						await batch(evidence.points, readElevation);
						evidence.terrainBlocked = evidence.points
							.slice(1)
							.some(
								(p) =>
									Number.isFinite(p.elevationM) && p.elevationM > p.rayM + 30,
							);
						const weatherDistances = [
							0, 1000, 5000, 12000, 30000, 65000, 125000, 175000, 250000,
						];
						evidence.weatherPoints = weatherDistances.map((d) => ({
							...evidence.points.find((p) => p.distanceM === d),
							timestampMs,
						}));
						await batch(evidence.weatherPoints, readWeather);
						evidence.cloud = summarizeCloud(evidence.weatherPoints);
						evidence.status =
							evidence.sunFacing === false ||
							evidence.terrainBlocked ||
							evidence.cloud.status === 'blocked'
								? 'blocked'
								: 'unknown';
						evidence.reason =
							evidence.sunFacing === false
								? '该代表时刻坡面背向太阳'
								: evidence.terrainBlocked
									? '太阳方向采样山脊高于光路'
									: evidence.cloud.status === 'blocked'
										? evidence.cloud.obstruction.cloud.reason
										: '可见山面具备低角度受光条件；250 km 以外、点间地形、未返回高空层和方向覆盖仍未知';
						publish();
					}
				result.windows = result.windows.map((w) =>
					w.id === solarWindow.id
						? {
								...w,
								status: result.solarPaths.some((p) => p.status === 'blocked')
									? 'blocked'
									: 'unknown',
								reason: '已检查开始／中间／结束方向；具体证据见光路列表',
							}
						: w,
				);
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
		analyzeSolar: (config, previous, window) => run(config, previous, window),
	};
}
