<script>
	import { createEventDispatcher } from 'svelte';
	import { heightToDisplay, heightUnit, distanceToDisplay, distanceUnit } from './lib/units.js';
	const formatHeight = (value, digits, system) => `${heightToDisplay(value, system)?.toFixed(digits) ?? '—'} ${heightUnit(system)}`;
	const formatDistance = (value, digits, system) => `${distanceToDisplay(value, system)?.toFixed(digits) ?? '—'} ${distanceUnit(system)}`;
	export let enabled = false;
	export let startText = '';
	export let targetText = '';
	export let eyeHeightM = 1.6;
	export let analysis;
	export let unitSystem = 'metric';
	export let selectedIndex = 0;
	const dispatch = createEventDispatcher();
	$: selected = analysis?.marks?.find(mark => mark.index === selectedIndex);
</script>

<section class="cloud-sightline">
	<label class="toggle"><input type="checkbox" bind:checked={enabled}/>机位—雪山视线云层检查</label>
	{#if enabled}
		<p>路线首点是机位，末点是目标。白线为真实视线；绿线仍用于查询海拔。复用当前路线天气，不额外请求沿途地形。</p>
		<div class="inputs">
			<label>机位地面海拔（米）<input type="number" min="-500" max="10000" step="any" placeholder="留空使用端点地形" bind:value={startText}/></label>
			<label>目标海拔（米）<input type="number" min="-500" max="10000" step="any" placeholder="留空使用端点地形" bind:value={targetText}/></label>
			<label>视点离地（米）<input type="number" min="0" max="100" step="0.1" bind:value={eyeHeightM}/></label>
		</div>
		{#if analysis?.ok}
			<strong>{analysis.cloudCount ? '存在云层相交信号' : analysis.humidCount ? '存在高湿可能云区信号' : analysis.unknownCount || !analysis.marks.length ? '资料不足' : '已采样位置未发现云层相交信号'}</strong>
			<p>云信号 {analysis.cloudCount} 点 · 高湿 {analysis.humidCount} 点 · 缺测 {analysis.unknownCount} 点 ／ 共 {analysis.marks.length} 点</p>
			<div class="legend"><span>白线：视线</span><span>红点：云信号</span><span>紫点：高湿</span><span>灰点：缺测</span><span>白点：模式零云量</span></div>
			{#if selected}<div class="detail"><strong>{selected.name} · {formatDistance(selected.distanceM, 1, unitSystem)} · 视线 {formatHeight(selected.heightM, 0, unitSystem)}</strong><p>{selected.text}</p><p>云量 {Number.isFinite(selected.values.cloudPct) ? `${Math.round(selected.values.cloudPct)}%` : '缺测'} · 相对湿度 {Number.isFinite(selected.values.humidityPct) ? `${Math.round(selected.values.humidityPct)}%` : '缺测'}</p></div>{/if}
			<details><summary>逐点视线云层依据</summary><div class="points">{#each analysis.marks as mark}<button type="button" on:click={() => dispatch('select', mark.index)}>{mark.name} · {formatDistance(mark.distanceM, 1, unitSystem)}：{mark.text}</button>{/each}</div></details>
			{#if analysis.outsideChart}<p>部分视线超出当前 0–9000 米图框；图中只显示范围内的线段，缺失部分不代表无云。</p>{/if}
		{:else}<p role="status">{analysis?.reason}</p>{/if}
		<p class="limit">仅检查视线云层信号，不判断地形遮挡。考虑几何曲率，未校正大气折射；点间云区仍是估算，缺测不代表无云。云量不是遮挡概率；雾、霾和实际透明度仍需人工判断。</p>
	{/if}
</section>

<style>
	.cloud-sightline { border: 1px solid #536079; background: #121a2b; padding: 16px; margin: 16px 0; color: #eef3fa; line-height: 1.6; }
	.toggle { display: flex; align-items: center; gap: 10px; font-weight: 700; min-height: 44px; }
	p { margin: 8px 0; }
	.inputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
	.inputs label { display: grid; gap: 5px; }
	.inputs input { width: 100%; box-sizing: border-box; min-height: 44px; background: #080e1b; border: 1px solid #71809a; color: #fff; padding: 8px; }
	.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; color: #d8e3f4; }
	.detail { border-left: 3px solid #fff; padding: 10px 14px; margin: 12px 0; background: #1c273a; }
	.points { display: grid; gap: 8px; padding-top: 10px; }
	.points button { text-align: left; min-height: 44px; padding: 8px; color: #eef3fa; background: #1c273a; border: 1px solid #71809a; }
	.limit { color: #bdc9da; font-size: 14px; }
	@media(max-width: 600px) { .inputs { grid-template-columns: 1fr; } }
</style>
