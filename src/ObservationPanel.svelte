<script>
	import { onDestroy, createEventDispatcher, tick } from 'svelte';
	import { resolveOviCoordinate } from './lib/coordinates.js';
	import { createObservationRunner } from './lib/observation-runner.js';
	import ObservationEvidence from './ObservationEvidence.svelte';
	import { formatForecastTime } from './lib/profile.js';
	export let model = 'ecmwf';
	export let active = true;
	export let elevation;
	export let weather;
	const dispatch = createEventDispatcher();
	let camera = null,
		peak = null,
		picking = 'camera',
		cameraText = '',
		peakText = '',
		eyeM = 1.6,
		radiusM = 2000;
	let cameraName = '机位',
		peakName = '山峰',
		cameraActual = '',
		peakActual = '';
	let date = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Asia/Shanghai',
	}).format(new Date());
	let time = '06:00',
		result = null,
		busy = false,
		error = '',
		open = false,
		selectedSector = null;
	let dialog, trigger;
	let revision = 0,
		context = '';
	const runner = createObservationRunner({
		elevation: (p, s) => elevation(p, s),
		weather: (p, m, s) => weather(p, m, s),
		onProgress: (r) => {
			result = r;
			redraw();
		},
	});
	const status = (s) =>
		s === 'blocked'
			? '存在遮挡信号'
			: s === 'clear'
				? '条件较有利'
				: '资料不足';
	const combined = (terrain, cloud) =>
		terrain === 'blocked' || cloud === 'blocked'
			? 'blocked'
			: terrain === 'clear' && cloud === 'clear'
				? 'clear'
				: 'unknown';
	const number = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '缺测');
	const phase = (stage) =>
		({
			terrain: '地形通视',
			weather: '视线天气',
			solar: '太阳光路',
			complete: '已完成',
			cancelled: '已取消',
			'rate-limited': '限流',
			error: '异常',
		})[stage] ?? '准备数据';
	const textTime = (t) => formatForecastTime(t);
	function redraw() {
		dispatch(
			'map',
			active
				? {
						camera: camera ? { ...camera, name: cameraName } : null,
						peak: peak ? { ...peak, name: peakName } : null,
						radiusM,
						result,
						selectedSector,
					}
				: { clear: true },
		);
	}
	$: if (cameraName || peakName) redraw();
	function invalidate() {
		revision++;
		runner.cancel();
		busy = false;
		result = null;
		error = '';
		redraw();
	}
	$: {
		const next = JSON.stringify([
			model,
			date,
			time,
			radiusM,
			eyeM,
			cameraActual,
			peakActual,
		]);
		if (context && context !== next) invalidate();
		context = next;
	}
	$: if (!active) {
		cancel();
		open = false;
		dispatch('map', { clear: true });
	} else redraw();
	export function acceptMapPoint(p) {
		invalidate();
		if (picking === 'camera') {
			camera = { ...p };
			picking = 'peak';
		} else peak = { ...p };
		redraw();
	}
	export function cancel() {
		runner.cancel();
		revision++;
		busy = false;
		if (result)
			result = {
				...result,
				stage: 'cancelled',
				error: '已取消，保留已完成证据；未完成区域保持未知',
			};
		redraw();
	}
	function parse(which) {
		const p = resolveOviCoordinate(which === 'camera' ? cameraText : peakText);
		if (!p.ok) {
			error = p.error;
			return;
		}
		invalidate();
		if (which === 'camera')
			camera = { lat: p.lat, lon: p.lon, source: p.source };
		else peak = { lat: p.lat, lon: p.lon, source: p.source };
		redraw();
	}
	function config() {
		const actual = (value) => (value === '' ? null : Number(value));
		return {
			camera: { ...camera, name: cameraName, actualM: actual(cameraActual) },
			peak: { ...peak, name: peakName, actualM: actual(peakActual) },
			eyeM: Number(eyeM),
			radiusM: Number(radiusM),
			model,
			date,
			timestampMs: Date.parse(`${date}T${time}:00+08:00`),
		};
	}
	async function analyze(window = null) {
		if (!camera || !peak) {
			error = '先设置机位和山峰';
			return;
		}
		const c = config();
		if (!Number.isFinite(c.timestampMs)) {
			error = '请选择有效的日期与北京时间';
			return;
		}
		if (
			!Number.isFinite(c.eyeM) ||
			c.eyeM < 0 ||
			c.eyeM > 100 ||
			[c.camera.actualM, c.peak.actualM].some(
				(h) => h !== null && (!Number.isFinite(h) || h < -500 || h > 10000),
			)
		) {
			error = '请检查海拔与视点高度';
			return;
		}
		const own = ++revision;
		busy = true;
		error = '';
		show();
		const completed = window
			? await runner.analyzeSolar(c, result, window)
			: await runner.analyze(c);
		if (own !== revision) return;
		result = completed;
		busy = false;
		redraw();
	}
	function choose(s) {
		selectedSector = s.id;
		redraw();
	}
	function locate(p) {
		dispatch('map', {
			camera: camera ? { ...camera, name: cameraName } : null,
			peak: peak ? { ...peak, name: peakName } : null,
			radiusM,
			result,
			selectedSector,
			focusPoint: p,
		});
		close();
	}
	async function show() {
		if (!open) {
			trigger = document.activeElement;
			open = true;
			await tick();
			dialog?.focus({ preventScroll: true });
		}
	}
	function close() {
		open = false;
		trigger?.focus?.({ preventScroll: true });
	}
	function dialogKey(e) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'Tab') {
			const nodes = [
				...dialog.querySelectorAll(
					'button:not([disabled]), input, select, summary, [tabindex="0"]',
				),
			];
			const first = nodes[0],
				last = nodes.at(-1);
			if (
				e.shiftKey &&
				(document.activeElement === first || document.activeElement === dialog)
			) {
				e.preventDefault();
				last?.focus();
			} else if (
				!e.shiftKey &&
				(document.activeElement === last || document.activeElement === dialog)
			) {
				e.preventDefault();
				first?.focus();
			}
		}
	}
	$: selected = result?.sectors?.find((s) => s.id === selectedSector);
	$: weatherPoints = selected
		? selected.weatherPoint
			? [
					{
						...selected.weatherPoint,
						distanceM: selected.sight?.path?.at(-1)?.distanceM ?? 0,
					},
				]
			: []
		: (result?.weatherPoints ?? []);
	onDestroy(() => {
		runner.cancel();
		dispatch('map', { clear: true });
	});
</script>

<svelte:window on:keydown={dialogKey} />
{#if active}
	<div class="setup">
		<p class="eyebrow">机位 → 山体 · 北京时间</p>
		<h2>观山与日照金山</h2>
		<p>设置两个点，检查直达视线、山体分区与早晚受光条件。</p>
		{#each ['camera', 'peak'] as which}
			<fieldset>
				<legend>{which === 'camera' ? '① 机位' : '② 山峰'}</legend>
				<div class="pair">
					<input
						aria-label={which === 'camera' ? '机位名称' : '山峰名称'}
						maxlength="32"
						value={which === 'camera' ? cameraName : peakName}
						on:input={(e) => {
							if (which === 'camera') cameraName = e.target.value;
							else peakName = e.target.value;
						}}
					/><button
						class:active={picking === which}
						on:click={() => (picking = which)}
						>地图选{which === 'camera' ? '机位' : '山峰'}</button
					>
				</div>
				<div class="pair">
					<input
						aria-label={which === 'camera' ? '机位奥维坐标' : '山峰奥维坐标'}
						placeholder="g经度,纬度"
						value={which === 'camera' ? cameraText : peakText}
						on:input={(e) => {
							if (which === 'camera') cameraText = e.target.value;
							else peakText = e.target.value;
						}}
					/><button on:click={() => parse(which)}>定位</button>
				</div>
				<small
					>{which === 'camera'
						? camera
							? `${number(camera.lat, 5)}, ${number(camera.lon, 5)}`
							: '等待地图选点'
						: peak
							? `${number(peak.lat, 5)}, ${number(peak.lon, 5)}`
							: '等待地图选点'}</small
				>
				<label
					>真实海拔（米，可留空）<input
						type="number"
						min="-500"
						max="10000"
						placeholder="使用 Windy 地形"
						value={which === 'camera' ? cameraActual : peakActual}
						on:input={(e) => {
							if (which === 'camera') cameraActual = e.target.value;
							else peakActual = e.target.value;
						}}
					/></label
				>
			</fieldset>
		{/each}
		<div class="pair">
			<label
				>视点离地（米）<input
					type="number"
					min="0"
					max="100"
					step="0.1"
					bind:value={eyeM}
				/></label
			><label
				>山体半径<select bind:value={radiusM}
					>{#each [1000, 2000, 3000, 4000, 5000] as r}<option value={r}
							>{r / 1000} km</option
						>{/each}</select
				></label
			>
		</div>
		<div class="pair">
			<label>日期（北京时间）<input type="date" bind:value={date} /></label
			><label>观山时刻<input type="time" bind:value={time} /></label>
		</div>
		<div class="pair">
			<button
				class="primary"
				disabled={busy || !camera || !peak}
				on:click={() => analyze()}>分析观山条件</button
			>{#if busy}<button on:click={cancel}>取消</button>{:else if result}<button
					on:click={show}>查看结果</button
				>{/if}
		</div>
		{#if error}<p role="alert">{error}</p>{/if}
		{#if result}<p role="status">
				{busy
					? `正在分析：${phase(result.stage)} · ${result.completed ?? 0}/${result.total ?? 0}`
					: (result.error ?? '分析证据已保留')}
			</p>{/if}
		<small
			>半径内 9×9 粗网格；手填海拔仅校正峰顶。请求 15
			天，实际覆盖以返回时次为准。</small
		>
	</div>

	{#if open}
		<div
			bind:this={dialog}
			class="viewer"
			role="dialog"
			aria-modal="true"
			aria-label="观山分析结果"
			tabindex="-1"
		>
			<header>
				<div>
					<small>高海拔天气剖面 · {model.toUpperCase()} · 北京时间</small>
					<h2>{cameraName} → {peakName}</h2>
				</div>
				<button on:click={close}>返回地图</button>
			</header>
			<div class="pair">
				<label
					>模式<select
						value={model}
						on:change={(e) => dispatch('model', e.target.value)}
						><option value="ecmwf">ECMWF</option><option value="icon"
							>ICON</option
						></select
					></label
				><label>日期（北京时间）<input type="date" bind:value={date} /></label
				><label>观山时刻<input type="time" bind:value={time} /></label><button
					disabled={busy}
					on:click={() => analyze()}>重新分析</button
				>
			</div>
			{#if result}
				<div class="progress" role="status">
					{busy
						? `正在读取 ${phase(result.stage)} · ${result.completed ?? 0}/${result.total ?? 0}`
						: (result.error ?? '已完成当前阶段')}
					{#if busy}<button on:click={cancel}>取消读取</button>{/if}
				</div>
				<div class="verdicts">
					<article>
						<small>能否观山 · 机位到峰顶</small>
						<h3>
							{status(combined(result.sight?.status, result.cloud?.status))}
						</h3>
						<p>地形：{result.sight?.reason ?? '待检查'}</p>
						<p>
							{number(result.distanceM / 1000, 1)} km · 方位 {number(
								result.bearingDeg,
								1,
							)}° · 仰角 {number(result.angleDeg, 2)}°
						</p>
						<button
							on:click={() => locate(result.sight?.obstruction ?? result.peak)}
							>定位地形证据</button
						>
					</article>
					<article>
						<small>视线云层 · {textTime(result.config.timestampMs)}</small>
						<h3>{status(result.cloud?.status)}</h3>
						<p>
							{result.cloud?.obstruction?.cloud.reason ??
								result.cloud?.reason ??
								'天气待检查'}
						</p>
						<small>云量是模式值，不能换算遮挡概率。</small
						>{#if result.cloud?.obstruction}<button
								on:click={() => locate(result.cloud.obstruction)}
								>定位云层信号</button
							>{/if}
					</article>
				</div>
				<h3>山体分区 <small>最多九个代表区域，不表示精确可见面积</small></h3>
				<div class="sectors">
					{#each result.sectors as sector}<button
							class:selected={selectedSector === sector.id}
							class:blocked={sector.status === 'blocked' ||
								sector.cloud?.status === 'blocked'}
							on:click={() => choose(sector)}
							><strong>{sector.name}</strong><span
								>{status(sector.status)} · {number(
									sector.representative?.elevationM,
								)} m</span
							><small
								>{sector.reason}；{sector.cloud
									? status(sector.cloud.status)
									: '天气待检查'}</small
							></button
						>{/each}
				</div>
				<p>
					{selected?.weatherNotice ??
						'选择分区可定位对应通视路径；粗网格与点间地形保留未知。'} 地形间距 {number(
						selected?.sight?.spacingM ?? result.sight?.spacingM,
					)} m（目标 250 m，上限 81 点）。
				</p>
				<h3>{selected?.name ?? '机位到峰顶'} · 直达视线剖面</h3>
				{#if selected}<button
						on:click={() => {
							selectedSector = null;
							redraw();
						}}>查看机位到峰顶主路径</button
					>{/if}
				<ObservationEvidence {result} {selected} />
				<p>
					<b class="amber">橙线：真实观测视线</b> ·
					<b class="green">绿线：查询海拔，可上下拖动</b> · 青线：地形。橙色窄列是模式云层，斜纹是湿度推断可能云区；窄列只代表实际采样，空白不代表无云。
				</p>
				<details>
					<summary>视线天气依据与实际时次</summary>{#each weatherPoints as p}<p>
							{number(p.distanceM / 1000, 1)} km · 视线 {number(p.rayM)} m · {p
								.cloud?.reason ?? '未完成'} · 云 {number(p.cloud?.cloudPct)}% ·
							RH {number(p.cloud?.humidityPct)}% {#if p.cloud?.range}（{textTime(
									p.cloud.range[0],
								)} — {textTime(p.cloud.range[1])}，两侧保守值）{/if}<br /><small
								>实际返回 {p.profile?.timestampsMs?.length ?? 0} 时次 {#if p.profile?.timestampsMs?.length}
									· {textTime(p.profile.timestampsMs[0])} — {textTime(
										p.profile.timestampsMs.at(-1),
									)}{/if} · 云层 {p.cloud?.relations
									?.map(
										(l) =>
											`${number(l.heightM)} m ${l.relation === 'above' ? '在线上方' : l.relation === 'below' ? '在线下方' : '与视线相交'}`,
									)
									.join('；') ?? '缺测'}</small
							>
						</p>{/each}
				</details>
				<h3>能否遇到日照金山 · 早晚低角度受光窗口</h3>
				<p>
					{result.solarPaths.some((p) => p.status === 'blocked')
						? '存在遮挡信号，详见对应分区与时刻'
						: result.windows.length
							? '可见山面有候选受光窗口；太阳光路与实际雪面仍需检查'
							: '资料不足或当天未找到可见坡面的低角度窗口'}。按分钟计算太阳位置；窗口内天气保留真实
					1／3 小时时次。点击窗口补查开始、中间、结束的太阳光路。
				</p>
				<div class="windows">
					{#each result.windows as w}<button
							disabled={busy}
							on:click={() => analyze(w)}
							><strong
								>{w.kind === 'morning' ? '早晨' : '傍晚'}
								{textTime(w.startMs)} — {textTime(w.endMs)}</strong
							><span>{w.reason}</span></button
						>{:else}<p>
							尚未找到符合条件的可见坡面窗口；可能缺少地形、坡面背光或当天没有低角度时段。
						</p>{/each}
				</div>
				{#each result.solarPaths as p}<details>
						<summary
							>{textTime(p.timestampMs)} · 分区 {p.sectorId + 1} · 太阳方位 {number(
								p.sun.azimuthDeg,
								1,
							)}° · {status(p.status)}</summary
						>
						<p>
							{p.reason ?? '读取中'}；几何太阳高度 {number(
								p.sun.geometricAltitudeDeg,
								2,
							)}°，视高度 {number(p.sun.apparentAltitudeDeg, 2)}°
						</p>
						{#each p.weatherPoints as v}<p>
								{number(v.distanceM / 1000, 1)} km · 光路 {number(v.rayM)} m · {v
									.cloud?.reason ?? '未完成'}
							</p>{/each}
					</details>{/each}
				<aside>
					未知：{result.unknowns.join(
						'；',
					)}。受光条件满足仅表示可见山面具有低角度受光条件，积雪与金色效果尚未确认。
				</aside>
			{:else}<p role="status">正在准备分析…</p>{/if}
		</div>
	{/if}
{/if}

<style>
	.setup {
		color: #20333a;
		font-size: 14px;
		line-height: 1.6;
	}
	.eyebrow {
		color: #396b73;
		font-size: 12px;
		font-weight: 700;
	}
	h2 {
		font-size: 23px;
		margin: 8px 0;
	}
	p {
		line-height: 1.65;
	}
	fieldset {
		border: 1px solid #d6e0e1;
		border-radius: 8px;
		margin: 16px 0;
		padding: 12px;
	}
	legend {
		font-weight: 700;
	}
	input,
	select,
	button {
		font: inherit;
		border: 1px solid #cbd8db;
		border-radius: 5px;
		padding: 9px;
		box-sizing: border-box;
	}
	input,
	select {
		width: 100%;
		min-width: 0;
		background: #fff;
		color: #20333a;
	}
	button {
		cursor: pointer;
		background: #f0f5f4;
		color: #346671;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.active,
	.primary {
		background: #346671;
		color: white;
	}
	.pair {
		display: flex;
		gap: 8px;
		margin: 8px 0;
	}
	.pair > * {
		flex: 1;
		min-width: 0;
	}
	label {
		display: block;
		font-size: 12px;
	}
	small {
		font-size: 12px;
		line-height: 1.5;
	}
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: #101927;
		color: #d8e8ee;
		overflow: auto;
		padding: 24px 4%;
		scrollbar-gutter: stable;
		overflow-anchor: none;
		font-size: 14px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #344754;
		padding-bottom: 16px;
	}
	header h2 {
		margin-top: 4px;
	}
	.progress {
		min-height: 42px;
		padding: 10px 0;
	}
	.verdicts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.verdicts article {
		border: 1px solid #3c5660;
		padding: 18px;
		border-left: 4px solid #91c9ba;
	}
	.verdicts h3 {
		font-size: 24px;
		margin: 6px 0;
	}
	h3 small {
		font-weight: 400;
		font-size: 12px;
	}
	.sectors {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.sectors button,
	.windows button {
		background: #172736;
		color: #d8e8ee;
		text-align: left;
		border-color: #39535f;
	}
	.sectors span,
	.sectors small,
	.windows span {
		display: block;
		margin-top: 6px;
	}
	.sectors .blocked {
		border-left: 4px solid #e2aa71;
	}
	.sectors .selected {
		outline: 2px solid #a4d5c3;
	}
	.amber {
		color: #eeb66d;
	}
	.green {
		color: #9cda79;
	}
	.windows {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.windows button {
		flex: 1;
		min-width: 250px;
	}
	details {
		border-top: 1px solid #344754;
		padding: 14px 0;
	}
	summary {
		cursor: pointer;
	}
	aside {
		border: 1px solid #55606c;
		padding: 16px;
		margin: 24px 0;
		color: #bdced7;
	}
	@media (max-width: 700px) {
		.verdicts {
			grid-template-columns: 1fr;
		}
		.sectors {
			grid-template-columns: 1fr;
		}
		.viewer {
			padding: 16px;
		}
	}
</style>
