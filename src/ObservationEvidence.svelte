<script>
	import { onDestroy } from 'svelte';
	import { cloudAtRay, timeBracket } from './lib/observation-weather.js';
	import { directCloudLayerBands, humidityCloudBands } from './lib/profile.js';
	export let result;
	export let selected;
	let altitude = 3000,
		hoverAltitude = null,
		hoverIndex = 0,
		dragging = false,
		svg,
		frameId = null,
		pointerPending = null;
	const number = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '缺测');
	$: path = selected?.sight?.path ?? result?.sight?.path ?? [];
	$: total = path.at(-1)?.distanceM ?? 1;
	$: maxHeight = Math.max(
		9000,
		...path.map((p) =>
			Number.isFinite(p.elevationM) ? p.elevationM + 500 : 0,
		),
	);
	const x = (p) => 70 + (p.distanceM / (total || 1)) * 980;
	const y = (h) => 500 - (h / maxHeight) * 440;
	function splitTerrain(points) {
		const segments = [];
		let current = [];
		for (const p of points) {
			if (Number.isFinite(p.elevationM)) current.push(p);
			else if (current.length) {
				segments.push(current);
				current = [];
			}
		}
		if (current.length) segments.push(current);
		return segments;
	}
	$: terrainSegments = splitTerrain(path).map((segment) =>
		segment.map((p) => `${x(p)},${y(p.elevationM)}`).join(' '),
	);
	$: sight = path
		.filter((p) => Number.isFinite(p.rayM))
		.map((p) => `${x(p)},${y(p.rayM)}`)
		.join(' ');
	$: weatherPoints = selected
		? selected.weatherPoint
			? [{ ...selected.weatherPoint, distanceM: total }]
			: []
		: (result?.weatherPoints ?? []);
	$: cloudBands = weatherPoints.flatMap((p) =>
		timeBracket(p.profile, result?.config?.timestampMs).frames.flatMap((f) =>
			directCloudLayerBands(f, p.elevationM).map((b) => ({
				...b,
				distanceM: p.distanceM,
			})),
		),
	);
	$: possibleBands = weatherPoints.flatMap((p) =>
		timeBracket(p.profile, result?.config?.timestampMs).frames.flatMap((f) =>
			humidityCloudBands(f, p.elevationM, maxHeight).map((b) => ({
				...b,
				distanceM: p.distanceM,
			})),
		),
	);
	$: readout =
		weatherPoints[Math.min(hoverIndex, Math.max(0, weatherPoints.length - 1))];
	$: reading = readout
		? cloudAtRay(
				readout.profile,
				result.config.timestampMs,
				hoverAltitude ?? altitude,
				readout.elevationM,
			)
		: null;
	function pointer(event) {
		const rect = svg.getBoundingClientRect();
		pointerPending = {
			x: ((event.clientX - rect.left) / rect.width) * 1120,
			y: ((event.clientY - rect.top) / rect.height) * 560,
			drag: dragging,
		};
		if (frameId !== null) return;
		frameId = requestAnimationFrame(() => {
			frameId = null;
			const p = pointerPending;
			if (!p) return;
			if (weatherPoints.length) {
				let best = 0;
				weatherPoints.forEach((v, i) => {
					if (Math.abs(x(v) - p.x) < Math.abs(x(weatherPoints[best]) - p.x))
						best = i;
				});
				if (best !== hoverIndex) hoverIndex = best;
			}
			const h = Math.max(
				0,
				Math.min(
					maxHeight,
					Math.round((((500 - p.y) / 440) * maxHeight) / 50) * 50,
				),
			);
			if (p.drag) {
				hoverAltitude = null;
				if (h !== altitude) altitude = h;
			} else if (h !== hoverAltitude) hoverAltitude = h;
		});
	}
	function down(e) {
		dragging = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		pointer(e);
	}
	function up() {
		dragging = false;
		hoverAltitude = null;
	}
	function key(e) {
		if (
			['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(
				e.key,
			)
		) {
			e.preventDefault();
			altitude =
				e.key === 'Home'
					? 0
					: e.key === 'End'
						? maxHeight
						: Math.max(
								0,
								Math.min(
									maxHeight,
									altitude +
										(e.key.includes('Up') ? 1 : -1) *
											(e.key.startsWith('Page') ? 500 : 50),
								),
							);
		}
	}

	onDestroy(() => {
		if (frameId !== null) cancelAnimationFrame(frameId);
	});
</script>

<div class="readout">
	<label
		>查询海拔 <input
			type="number"
			min="0"
			max={maxHeight}
			step="50"
			bind:value={altitude}
		/> m</label
	><span
		>当前点 {number(readout?.distanceM / 1000, 1)} km · 读数海拔 {number(
			hoverAltitude ?? altitude,
		)} m · 地形 {number(readout?.elevationM)} m</span
	><span
		>云 {number(reading?.cloudPct)}% · 湿度 {number(reading?.humidityPct)}% ·
		温度 {number(reading?.values?.[0]?.temperatureC, 1)}°C · 风 {number(
			reading?.values?.[0]?.windSpeedMs,
			1,
		)} m/s · 来向 {number(reading?.values?.[0]?.windDirectionDeg)}°</span
	><small
		>{reading?.reason ??
			'天气尚未读取'}；温风显示左侧有效时次，云湿采用两侧保守值。</small
	>
</div>
<svg
	bind:this={svg}
	viewBox="0 0 1120 560"
	preserveAspectRatio="none"
	role="img"
	aria-label="地形、真实视线与可拖动查询海拔线"
	on:pointermove={pointer}
	on:pointerup={up}
	on:pointercancel={up}
	on:pointerleave={() => {
		if (!dragging) hoverAltitude = null;
	}}
>
	<defs
		><pattern
			id="observation-humidity"
			width="6"
			height="6"
			patternUnits="userSpaceOnUse"
			><path d="M0 6 L6 0" stroke="#a4d5c3" stroke-width="1" /></pattern
		></defs
	>
	{#each [0, 3000, 6000, 9000] as h}<line
			x1="70"
			x2="1050"
			y1={y(h)}
			y2={y(h)}
			stroke="#2d4256"
			stroke-dasharray="3 6"
		/><text x="12" y={y(h) + 5}>{h} m</text>{/each}
	{#each terrainSegments as terrain}<polyline
			points={terrain}
			fill="none"
			stroke="#87c9bd"
			stroke-width="3"
			stroke-dasharray="4 3"
		/>{/each}
	{#each cloudBands as b}<rect
			x={x(b) - 7}
			y={y(Math.min(maxHeight, b.highHeightM))}
			width="14"
			height={Math.max(
				0,
				y(Math.max(0, b.lowHeightM)) - y(Math.min(maxHeight, b.highHeightM)),
			)}
			fill="#efae72"
			opacity="0.6"
		/>{/each}
	{#each possibleBands as b}<rect
			x={x(b) - 9}
			y={y(Math.min(maxHeight, b.highHeightM))}
			width="18"
			height={Math.max(
				0,
				y(Math.max(0, b.lowHeightM)) - y(Math.min(maxHeight, b.highHeightM)),
			)}
			fill="url(#observation-humidity)"
		/>{/each}
	{#each weatherPoints as p, i}
		{#if Number.isFinite(p.rayM)}<line
				x1={x(p)}
				x2={x(p)}
				y1="60"
				y2="500"
				stroke="#344958"
				stroke-dasharray="2 6"
			/><circle
				cx={x(p)}
				cy={y(p.rayM)}
				r="5"
				fill={p.cloud?.status === 'blocked'
					? '#efae72'
					: p.cloud?.status === 'clear'
						? '#91d79d'
						: '#788595'}
			/>{/if}
	{/each}
	<polyline points={sight} fill="none" stroke="#eeb66d" stroke-width="3" />
	<g
		role="slider"
		tabindex="0"
		aria-label="查询海拔"
		aria-valuenow={altitude}
		aria-valuemin="0"
		aria-valuemax={maxHeight}
		on:keydown={key}
		on:pointerdown={down}
		on:lostpointercapture={up}
		style="cursor:ns-resize;touch-action:none"
	>
		<line
			x1="70"
			x2="1050"
			y1={y(altitude)}
			y2={y(altitude)}
			stroke="transparent"
			stroke-width="28"
		/><line
			x1="70"
			x2="1050"
			y1={y(altitude)}
			y2={y(altitude)}
			stroke="#9cda79"
			stroke-width="2"
			stroke-dasharray="6 4"
		/><text x="870" y={y(altitude) - 10}>查询 {number(altitude)} m ↕</text>
	</g><text x="70" y="535">0 km</text><text x="950" y="535"
		>{number(total / 1000, 1)} km</text
	>
</svg>

<style>
	.readout {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 16px;
		height: 130px;
		box-sizing: border-box;
		overflow: auto;
		align-items: center;
		background: #182736;
		padding: 12px;
		font-variant-numeric: tabular-nums;
	}
	.readout label {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.readout input {
		width: 100px;
		padding: 8px;
	}
	.readout small {
		flex-basis: 100%;
	}
	svg {
		width: 100%;
		min-height: 280px;
		background: #0c1420;
		margin-top: 8px;
	}
	svg text {
		fill: #cadce9;
		font-size: 14px;
		font-family: monospace;
	}
	svg g:focus {
		outline: none;
	}
	svg g:focus-visible line {
		stroke-width: 4;
	}
</style>
