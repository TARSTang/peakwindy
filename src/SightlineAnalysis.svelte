<script>
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { assessSightlineTerrain, assessSightlineWeather, buildSightlineGeometry, sightlineForecastTimes, sightlinePointAt } from './lib/sightline.js';
	import { runSightlineAnalysis } from './lib/sightline-run.js';
	import { assessGroundFog, groundFogStatusLabel } from './lib/fog.js';
	import { formatForecastTime, interpolateAtHeight, nearestForecastTimestamp } from './lib/profile.js';
	import { cloudCoverageColor, WEATHER_COLORS } from './lib/weather-colors';
	import { heightToDisplay, heightUnit, distanceToDisplay, distanceUnit, temperatureToDisplay, temperatureUnit, windToDisplay, windUnit } from './lib/units.js';

	export let start = null;
	export let end = null;
	export let model = 'ecmwf';
	export let step = 3;
	export let timestampMs = null;
	export let unitSystem = 'metric';
	export let queryAltitudeM = 5000;
	export let fetchElevation;
	export let fetchProfile;
	const dispatch = createEventDispatcher();
	let swapped = false;
	let startHeightText = '', targetHeightText = '';
	let eyeHeightM = 1.6;
	let endpointKey = '', contextKey = '';
	let state = null, controller = null, runId = 0;
	let running = false, error = '';
	let dialog, chartWidth = 1000, chartHeight = 520, focusedIndex = 0, evidenceDistanceM = null;
	let dragPointer = null, pendingAltitude = null, dragFrame = null;

	$: observer = swapped ? end : start;
	$: target = swapped ? start : end;
	$: syncEndpoints(JSON.stringify([observer?.lat, observer?.lon, observer?.elevationM, target?.lat, target?.lon, target?.elevationM]));
	$: invalidateContext(JSON.stringify([endpointKey, observer?.name, target?.name, model, step, eyeHeightM, startHeightText, targetHeightText]));
	$: times = sightlineForecastTimes(state?.weather ?? []);
	$: selectedTime = nearestForecastTimestamp(times, timestampMs ?? Date.now());
	$: terrainAssessment = assessSightlineTerrain(state?.terrain ?? []);
	$: weatherAssessment = assessSightlineWeather(state?.weather ?? [], selectedTime);
	$: fog = assessGroundFog(state?.weather?.[0]?.profile, selectedTime);
	$: geometry = buildSightlineGeometry(state?.plan, state?.terrain ?? [], state?.weather ?? [], selectedTime, chartWidth, chartHeight);
	$: focused = weatherAssessment.points[Math.min(focusedIndex, Math.max(0, weatherAssessment.points.length - 1))];
	$: queryWeather = focused ? interpolateAtHeight(focused.frame, queryAltitudeM, focused.terrainM) : null;
	$: evidencePoint = state?.plan && Number.isFinite(evidenceDistanceM) ? sightlinePointAt(state.plan, evidenceDistanceM / state.plan.distanceM) : null;
	$: dispatch('mapEvidence', state?.plan ? { plan: state.plan,
		blockers: terrainAssessment.blockers.slice(0, 5),
		clouds: [...weatherAssessment.cloudSignals, ...weatherAssessment.humiditySignals],
		focus: evidencePoint } : null);

	function syncEndpoints(key) {
		if (key === endpointKey) return;
		endpointKey = key;
		startHeightText = Number.isFinite(observer?.elevationM) ? String(observer.elevationM) : '';
		targetHeightText = Number.isFinite(target?.elevationM) ? String(target.elevationM) : '';
	}
	function invalidateContext(key) {
		if (key === contextKey) return;
		contextKey = key; runId++; controller?.abort(); controller = null;
		running = false; state = null; error = ''; focusedIndex = 0; evidenceDistanceM = null;
		finishDrag(); dialog?.close();
	}
	function correction(text) {
		if (!String(text).trim()) return null;
		const value = Number(text);
		if (!Number.isFinite(value) || value < -500 || value > 10000) throw new Error('校正海拔须在 −500～10000 米范围');
		return value;
	}
	async function analyse() {
		if (running) return;
		let startGroundM, targetElevationM;
		try { startGroundM = correction(startHeightText); targetElevationM = correction(targetHeightText); }
		catch (failure) { error = failure.message; return; }
		const id = ++runId;
		controller?.abort(); const request = new AbortController(); controller = request;
		running = true; error = ''; state = null; focusedIndex = 0; evidenceDistanceM = null;
		try {
			await runSightlineAnalysis({ start: observer, end: target, model, step, startGroundM, targetElevationM,
				eyeHeightM, fetchElevation, fetchProfile }, next => { if (id === runId) state = next; }, request.signal);
		} catch (failure) { if (id === runId && !request.signal.aborted) error = failure.message || String(failure); }
		finally { if (id === runId) { running = false; controller = null; } }
	}
	function cancel() { controller?.abort(); }
	function showChart() { if (geometry && !dialog.open) dialog.showModal(); }
	function focusEvidence(point) {
		evidenceDistanceM = point.distanceM;
		let closest = 0;
		for (let index = 1; index < weatherAssessment.points.length; index++) {
			if (Math.abs(weatherAssessment.points[index].distanceM - point.distanceM) < Math.abs(weatherAssessment.points[closest].distanceM - point.distanceM)) closest = index;
		}
		focusedIndex = closest; showChart();
	}
	function setTime(event) { dispatch('time', Number(event.currentTarget.value)); }
	function measure(node) {
		const resize = new ResizeObserver(entries => {
			const width = Math.max(360, Math.round(entries[0].contentRect.width));
			if (width !== chartWidth) chartWidth = width;
		});
		resize.observe(node); return { destroy: () => resize.disconnect() };
	}
	function dragAltitude(event) {
		if (event.pointerId !== dragPointer || !geometry) return;
		const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
		const y = (event.clientY - bounds.top) * geometry.height / bounds.height;
		const fraction = Math.max(0, Math.min(1, (geometry.plot.bottom - y) / (geometry.plot.bottom - geometry.plot.top)));
		pendingAltitude = Math.max(0, Math.round((geometry.minHeightM + fraction * (geometry.maxHeightM - geometry.minHeightM)) / 50) * 50);
		if (dragFrame === null) dragFrame = requestAnimationFrame(() => {
			dragFrame = null;
			if (pendingAltitude !== null && pendingAltitude !== queryAltitudeM) dispatch('altitude', pendingAltitude);
			pendingAltitude = null;
		});
	}
	function beginDrag(event) {
		if (event.button !== 0) return;
		event.preventDefault(); dragPointer = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId); dragAltitude(event);
	}
	function finishDrag() {
		if (dragFrame !== null) cancelAnimationFrame(dragFrame);
		if (pendingAltitude !== null && pendingAltitude !== queryAltitudeM) dispatch('altitude', pendingAltitude);
		dragFrame = null; pendingAltitude = null; dragPointer = null;
	}
	function sliderKey(event) {
		const changes = { ArrowUp: 50, ArrowRight: 50, ArrowDown: -50, ArrowLeft: -50, PageUp: 500, PageDown: -500 };
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? geometry.maxHeightM
			: event.key in changes ? Math.max(0, Math.min(geometry.maxHeightM, queryAltitudeM + changes[event.key])) : null;
		if (next === null) return;
		event.preventDefault(); dispatch('altitude', next);
	}
	const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
	const height = value => `${number(heightToDisplay(value, unitSystem))} ${heightUnit(unitSystem)}`;
	const distance = value => `${number(distanceToDisplay(value, unitSystem), 1)} ${distanceUnit(unitSystem)}`;
	const temp = value => `${number(temperatureToDisplay(value, unitSystem), 1)} ${temperatureUnit(unitSystem)}`;
	const wind = value => `${number(windToDisplay(value, unitSystem), 1)} ${windUnit(unitSystem)}`;
	const statusText = status => ({ blocked: '发现地形遮挡信号', sensitive: '视线接近地形，结果敏感', 'sampled-clear': '已采样位置未见明显遮挡', unknown: '资料不足', 'cloud-signal': '存在视线穿云信号', 'humidity-signal': '存在高湿可能云区' })[status];
	const relationText = relation => ({ intersects: '云与视线相交', 'estimated-intersection': '模式云带可能相交（边界估算）', 'possible-intersection': '高湿可能相交', below: '已返回云带在视线下方', above: '已返回云带在视线上方', 'separate-bands': '云带分布在不同高度', 'no-signal': '视线层云量为零', unknown: '视线层资料不足' })[relation];
	onMount(() => {
		const resize = () => chartHeight = Math.max(280, Math.min(520, Math.round(window.innerHeight * .43)));
		resize(); window.addEventListener('resize', resize);
		return () => window.removeEventListener('resize', resize);
	});
	onDestroy(() => { runId++; controller?.abort(); finishDrag(); dialog?.close(); dispatch('mapEvidence', null); });
</script>

<section class="sightline-card">
	<div class="heading"><div><span class="kicker">观景点 → 雪山</span><h3>两点视线检查</h3></div><span class="model">{model.toUpperCase()}</span></div>
	<p>检查首点到末点的直达视线。中间路线点不参与光路；只分析指定目标点，不代表整座山体都可见。</p>
	<div class="endpoints"><strong>机位：{observer?.name ?? '起点'}</strong><span>↓</span><strong>目标：{target?.name ?? '终点'}</strong></div>
	<button type="button" class="secondary" on:click={() => swapped = !swapped}>交换机位与目标</button>
	<div class="fields">
		<label>机位地面海拔（米）<input type="number" min="-500" max="10000" step="any" value={startHeightText} on:input={event => startHeightText = event.currentTarget.value} placeholder="留空读取 Windy 地形" /></label>
		<label>目标点海拔（米）<input type="number" min="-500" max="10000" step="any" value={targetHeightText} on:input={event => targetHeightText = event.currentTarget.value} placeholder="峰顶建议填写真实海拔" /></label>
		<label>视点离地高度（米）<input type="number" min="0" max="100" step="0.1" bind:value={eyeHeightM} /></label>
	</div>
	<div class="actions"><button type="button" class="primary" disabled={running} on:click={analyse}>{running ? '正在分析…' : state ? '重新分析两点视线' : '分析两点视线'}</button>{#if running}<button type="button" class="secondary" on:click={cancel}>取消分析</button>{/if}</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if state}<p class="progress" role="status">{state.phase === 'endpoints' ? '读取两端海拔' : state.phase === 'terrain' ? '读取直达路径地形' : state.phase === 'weather' ? '读取沿视线天气' : state.rateLimited ? '达到 Windy 请求频率限制，已停止后续采样' : state.cancelled ? '已取消；完成的证据保留，未完成位置仍为未知' : '分析完成'}{#if running} · {state.completed}/{state.total}{/if}</p>{/if}
	{#if state?.plan}
		<div class="facts"><span>距离 <b>{distance(state.plan.distanceM)}</b></span><span>方位 <b>{number(state.plan.bearingDeg, 1)}°</b>（北为 0°）</span><span>仰角 <b>{number(state.plan.elevationAngleDeg, 2)}°</b></span><span>视点海拔 <b>{height(state.plan.observerElevationM)}</b></span><span>目标海拔 <b>{height(state.plan.targetElevationM)}</b></span></div>
		<p class="small">地形基础间距 {distance(state.plan.terrainSpacingM)}，近掠地形局部加密；天气间距 {distance(state.plan.weatherSpacingM)}，最多 41 点。间距不是数据源分辨率。海拔留空时取 Windy 地形。</p>
		{#if times.length}<label class="time-label">预报时次（北京时间）<select value={selectedTime} on:change={setTime}>{#each times as time}<option value={time}>{formatForecastTime(time)}</option>{/each}</select></label><p class="small">实际返回 {times.length} 个时次：{formatForecastTime(times[0])} 至 {formatForecastTime(times.at(-1))}。{#if Number.isFinite(timestampMs) && Math.abs(selectedTime - timestampMs) > 1000}已选最近返回时次，没有时间外推。{/if}</p>{/if}
		<div class="evidence">
			<div><strong>地形 · {statusText(terrainAssessment.status)}</strong><p>路径内部地形有效 {terrainAssessment.validCount}/{terrainAssessment.totalCount} 点，缺测 {terrainAssessment.missingCount} 点。{#if terrainAssessment.minimum}最小视线净空 {height(terrainAssessment.minimum.clearanceM)}，距机位 {distance(terrainAssessment.minimum.distanceM)}。{/if}</p><p class="small">净空为视线海拔减地形海拔。正负 30 米仅作敏感提示，不能代表地形精度；结果采用几何曲率，未假定固定大气折射。</p>{#each terrainAssessment.blockers.slice(0, 3) as point}<button class="evidence-button" type="button" on:click={() => focusEvidence(point)}>山脊信号 · {distance(point.distanceM)} · 地形高出视线 {height(-point.clearanceM)}</button>{/each}{#if terrainAssessment.status === 'sensitive'}<button class="evidence-button" type="button" on:click={() => focusEvidence(terrainAssessment.minimum)}>定位近掠地形位置</button>{/if}</div>
			<div><strong>云层 · {statusText(weatherAssessment.status)}</strong><p>视线高度云量有值 {weatherAssessment.directCount}/{weatherAssessment.totalCount} 点。穿云信号 {weatherAssessment.cloudSignals.length} 点，高湿可能云区 {weatherAssessment.humiditySignals.length} 点，资料不足 {weatherAssessment.unknownCount} 点。</p>{#each [...weatherAssessment.cloudSignals, ...weatherAssessment.humiditySignals].slice(0, 3) as point}<button class="evidence-button" type="button" on:click={() => focusEvidence(point)}>{relationText(point.relation)} · {distance(point.distanceM)} · 海拔 {height(point.rayHeightM)}</button>{/each}</div>
			<div><strong>机位附近 · {groundFogStatusLabel(fog.status)}</strong><p>{fog.reason}</p><p class="small">近地面模式字段仅作雾信号提示，不代表整条高空视线的透明度。</p></div>
		</div>
		<div class="actions"><button type="button" class="primary" on:click={showChart}>展开视线剖面</button><button type="button" class="secondary" on:click={() => dispatch('locate', state.plan)}>地图定位两点</button></div>
		<p class="small">未采样山脊、点间云层、实际薄云透明度、霾和雪面覆盖仍有未知。云量百分比不等于遮挡概率，不输出成功率。</p>
	{/if}
</section>

<dialog bind:this={dialog} class="sightline-dialog" on:close={finishDrag} on:cancel={finishDrag}>
	{#if geometry}
		<header><div><span class="kicker">直达观测视线 · {model.toUpperCase()}</span><h2>{state.plan.start.name} → {state.plan.end.name}</h2><p>{selectedTime ? `${formatForecastTime(selectedTime)} 北京时间` : '天气时次尚未返回'}</p></div><button type="button" class="secondary" on:click={() => dialog.close()}>关闭剖面</button></header>
		{#if focused}<div class="readout"><label>所选天气点<select value={focusedIndex} on:change={event => { focusedIndex=Number(event.currentTarget.value); evidenceDistanceM=weatherAssessment.points[focusedIndex].distanceM; }}>{#each weatherAssessment.points as point,index}<option value={index}>{point.name} · {distance(point.distanceM)}</option>{/each}</select></label><div><strong>真实视线 · 海拔 {height(focused.rayHeightM)}</strong><span>地形 {height(focused.terrainM)} · 温度 {temp(focused.weather.temperatureC)} · 湿度 {number(focused.weather.humidityPct)}% · 风 {wind(focused.weather.windSpeedMs)} · 云量 {number(focused.weather.cloudPct)}%</span><span>{relationText(focused.relation)}：{focused.reason}</span></div><div><strong>绿色查询线 · 海拔 {height(queryAltitudeM)}</strong><span>{queryWeather?.reason === 'below-terrain' ? '查询高度低于地形，不能使用地下模式层' : `温度 ${temp(queryWeather?.temperatureC)} · 湿度 ${number(queryWeather?.humidityPct)}% · 风 ${wind(queryWeather?.windSpeedMs)} · 云量 ${number(queryWeather?.cloudPct)}%`}</span></div></div>{/if}
		{#if evidencePoint && focused}<p class="small">黄色定位线：距机位 {distance(evidencePoint.distanceM)} · 视线海拔 {height(evidencePoint.rayHeightM)}；数值栏的天气来自距机位 {distance(focused.distanceM)} 的最近采样点，不补造定位处的独立天气。</p>{/if}
		<div class="legend"><span><i style="background:#f8fafc"></i>白色实线：真实观测视线</span><span><i style="background:#a3e878"></i>绿色虚线：可拖动查询海拔</span><span><i style="background:#78d1cc"></i>地形采样线</span>{#each [[25,'>0–25%'],[50,'>25–50%'],[75,'>50–75%'],[100,'>75–100%']] as item}<span><i style={`background:${cloudCoverageColor(item[0])}`}></i>云量 {item[1]}</span>{/each}<span>0%：透明；灰色：云量缺测；紫色斜纹：高湿推算</span><span>视线圆点：红色为云量信号，橙色为云带边界估算</span></div>
		<div class="chart" use:measure>
			<svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="group" aria-label="两点地形、真实视线和云层剖面">
				<defs><pattern id="sight-humidity" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6" stroke={WEATHER_COLORS.evidence.estimatedCloud} stroke-width="2" /></pattern><clipPath id="sight-plot"><rect x={geometry.plot.left} y={geometry.plot.top} width={geometry.plot.right-geometry.plot.left} height={geometry.plot.bottom-geometry.plot.top}/></clipPath></defs>
				{#each geometry.altitudeTicks as value}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={geometry.y(value)} y2={geometry.y(value)} stroke="#344258" stroke-dasharray="3 6" /><text x="4" y={geometry.y(value)+5}>{number(heightToDisplay(value,unitSystem))}</text>{/each}<text x="4" y="23">海拔（{heightUnit(unitSystem)}）</text>
				<g clip-path="url(#sight-plot)">
					{#each geometry.cells as cell}<rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill={cloudCoverageColor(cell.value)} fill-opacity={cell.missing ? 0.35 : 0.95} />{/each}
					{#each geometry.possibleCloudBands as band}<rect x={band.x} y={band.y} width={band.width} height={band.height} fill="url(#sight-humidity)" />{/each}
					<path d={geometry.terrainArea} fill="#1c474b" fill-opacity="0.85"/><path d={geometry.terrainPath} stroke="#78d1cc" stroke-width="2.5" fill="none"/>
					<path d={geometry.rayPath} stroke="#07101e" stroke-width="7" fill="none"/><path d={geometry.rayPath} stroke="#f8fafc" stroke-width="3" fill="none"/>
					{#each terrainAssessment.blockers as point}<circle cx={geometry.x(point.distanceM)} cy={geometry.y(point.elevationM)} r="4" fill="#f04468"><title>地形高出视线 {height(-point.clearanceM)}，距机位 {distance(point.distanceM)}</title></circle>{/each}
					{#each weatherAssessment.points as point, index}<circle cx={geometry.x(point.distanceM)} cy={geometry.y(point.rayHeightM)} r="5" fill={point.status === 'cloud-signal' ? '#f04468' : point.status === 'cloud-band-signal' ? '#ff8738' : point.status === 'humidity-signal' ? WEATHER_COLORS.evidence.estimatedCloud : point.status === 'unknown' ? WEATHER_COLORS.evidence.missing : '#f8fafc'} /><rect x={geometry.sampleMarks[index].left} y={geometry.plot.top} width={geometry.sampleMarks[index].width} height={geometry.plot.bottom-geometry.plot.top} fill="transparent" class="point-hit" role="button" tabindex="0" aria-label={`读取距机位 ${distance(point.distanceM)} 的视线天气`} on:click={() => { focusedIndex = index; evidenceDistanceM = point.distanceM; }} on:keydown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusedIndex = index; evidenceDistanceM = point.distanceM; } }} />{/each}
					{#if Number.isFinite(evidenceDistanceM)}<line x1={geometry.x(evidenceDistanceM)} x2={geometry.x(evidenceDistanceM)} y1={geometry.plot.top} y2={geometry.plot.bottom} stroke="#ffd43b" stroke-dasharray="5 6"/>{/if}
					{#if queryAltitudeM >= geometry.minHeightM && queryAltitudeM <= geometry.maxHeightM}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={geometry.y(queryAltitudeM)} y2={geometry.y(queryAltitudeM)} stroke="#a3e878" stroke-width="2.5" stroke-dasharray="8 5"/><rect x={geometry.plot.left} y={geometry.y(queryAltitudeM)-12} width={geometry.plot.right-geometry.plot.left} height="24" fill="transparent" class="query-hit" role="slider" tabindex="0" aria-label="拖动绿色查询海拔线" aria-valuemin="0" aria-valuemax={geometry.maxHeightM} aria-valuenow={queryAltitudeM} aria-valuetext={height(queryAltitudeM)} on:pointerdown={beginDrag} on:pointermove={dragAltitude} on:pointerup={finishDrag} on:pointercancel={finishDrag} on:lostpointercapture={finishDrag} on:keydown={sliderKey} />{/if}
				</g>
				{#each geometry.distanceTicks as value}<text x={geometry.x(value)} y={geometry.height-14} text-anchor={value === 0 ? 'start' : value === state.plan.distanceM ? 'end' : 'middle'}>{distance(value)}</text>{/each}
			</svg>
		</div>
		<div class="query-control"><label>绿色查询海拔：{height(queryAltitudeM)}<input type="range" min="0" max={geometry.maxHeightM} step="50" value={queryAltitudeM} on:input={event => dispatch('altitude',Number(event.currentTarget.value))} /></label></div>
		<details><summary>逐点视线天气证据（{weatherAssessment.totalCount} 点）</summary><div class="table-wrap"><table><thead><tr><th>距机位</th><th>视线海拔</th><th>模式云量</th><th>湿度</th><th>判断依据</th></tr></thead><tbody>{#each weatherAssessment.points as point}<tr><td>{distance(point.distanceM)}</td><td>{height(point.rayHeightM)}</td><td>{number(point.weather.cloudPct)}%</td><td>{number(point.weather.humidityPct)}%</td><td>{point.reason}</td></tr>{/each}</tbody></table></div></details>
		<p class="small">天气窄列表示实际采样点；列间未采样。地形线在缺测处断开，白色视线由两端几何计算，不代表天气数据完整。查询线不改变真实视线。</p>
	{/if}
</dialog>

<style>
	.sightline-card { margin:20px 0; padding:16px; border:1px solid #bed4d0; border-radius:10px; background:#f5faf9; color:#17282e; font:15px/1.55 system-ui,sans-serif; }
	.heading, header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
	h3,h2,p { margin:0; } h3 { font-size:20px; } h2 { font-size:24px; } p { margin:8px 0; overflow-wrap:anywhere; }
	.kicker { font-size:13px; font-weight:700; color:#176b76; } .model { padding:4px 8px; border:1px solid #bed4d0; border-radius:6px; font-weight:700; }
	.endpoints { display:flex; flex-direction:column; margin:12px 0; } .endpoints span { color:#617b7a; }
	.fields { display:grid; gap:12px; margin:14px 0; } label { display:flex; flex-direction:column; gap:6px; font-size:14px; font-weight:650; }
	input,select { box-sizing:border-box; min-width:0; width:100%; min-height:44px; border:1px solid #afc9c4; border-radius:6px; padding:8px; background:#fff; color:#17282e; font:inherit; }
	.actions { display:flex; gap:10px; flex-wrap:wrap; margin:12px 0; }
	button { min-height:44px; border-radius:7px; padding:8px 12px; cursor:pointer; font:650 14px/1.4 system-ui,sans-serif; }
	.primary { border:1px solid #176b76; background:#176b76; color:#fff; } .secondary { border:1px solid #afc9c4; background:#fff; color:#176b76; }
	button:disabled { opacity:.6; cursor:wait; } button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline:3px solid #08b8d4; outline-offset:3px; }
	.error { color:#a4263c; } .progress { color:#176b76; font-weight:700; } .small { font-size:13px; line-height:1.6; color:#4e6265; }
	.facts { display:grid; gap:6px; border-block:1px solid #d7e1df; padding:12px 0; } .facts b { font-variant-numeric:tabular-nums; }
	.evidence { display:grid; gap:12px; margin:16px 0; } .evidence > div { border-left:3px solid #176b76; padding:2px 0 2px 12px; } .evidence p { margin:5px 0; }
	.evidence-button { display:block; width:100%; margin-top:8px; border:1px solid #d5b8a3; background:#fff8ef; color:#704326; text-align:left; }
	.sightline-dialog { box-sizing:border-box; width:calc(100vw - 24px); max-width:1500px; max-height:calc(100dvh - 24px); border:1px solid #344258; border-radius:10px; padding:20px; background:#0a0d1b; color:#eef3fb; font:15px/1.55 system-ui,sans-serif; scrollbar-gutter:stable; overflow-anchor:none; }
	.sightline-dialog::backdrop { background:#07101ee6; } .sightline-dialog .kicker { color:#8ddbd4; } .sightline-dialog .small,header p { color:#b5c6d7; }
	.legend { display:flex; flex-wrap:wrap; gap:8px 16px; margin:16px 0; font-size:13px; } .legend span { display:flex; align-items:center; gap:7px; } i { display:inline-block; width:18px; height:9px; border:1px solid #9aadc4; }
	.chart { box-sizing:border-box; width:100%; border:1px solid #344258; border-radius:6px; background:#080c18; } svg { display:block; width:100%; height:auto; } svg text { fill:#dce7f5; font:14px system-ui,sans-serif; }
	.query-hit { touch-action:none; cursor:ns-resize; } .point-hit { cursor:pointer; } .query-hit:focus-visible,.point-hit:focus-visible { outline:none; stroke:#08b8d4; stroke-width:2px; }
	.query-control { margin:12px 0; color:#a3e878; } input[type=range] { padding:0; accent-color:#a3e878; }
	.readout { display:grid; grid-template-columns:minmax(170px,.7fr) minmax(0,1.5fr) minmax(0,1fr); gap:16px; padding:16px; border:1px solid #344258; background:#12192b; min-height:116px; font-variant-numeric:tabular-nums; }
	.readout strong,.readout span { display:block; } .readout strong { margin-bottom:6px; } .readout span { color:#c5d3e3; margin-top:4px; }
	summary { min-height:44px; display:list-item; padding:10px 0; cursor:pointer; font-weight:700; } .table-wrap { overflow:auto; } table { border-collapse:collapse; width:100%; font-size:14px; } td,th { border-bottom:1px solid #344258; padding:10px; text-align:left; } th { white-space:nowrap; }
	@media(min-width:800px) { .fields { grid-template-columns:repeat(3,minmax(0,1fr)); } }
	@media(max-width:700px) { .readout { grid-template-columns:1fr; } .sightline-dialog { padding:12px; } header { flex-wrap:wrap; } }
</style>
