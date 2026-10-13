<script>
	import { createEventDispatcher } from 'svelte';
	import { formatForecastTime } from './lib/profile.js';
	import CloudPositionDetails from './CloudPositionDetails.svelte';
	import { heightToDisplay, heightUnit, distanceToDisplay, distanceUnit } from './lib/units.js';
	const formatHeight = (value, digits, system) => `${heightToDisplay(value, system)?.toFixed(digits) ?? '—'} ${heightUnit(system)}`;
	const formatDistance = (value, digits, system) => `${distanceToDisplay(value, system)?.toFixed(digits) ?? '—'} ${distanceUnit(system)}`;
	export let enabled = false;
	export let startText = '';
	export let targetText = '';
	export let eyeHeightM = 1.6;
	export let analysis;
	export let sourceLabel = 'Windy';
	export let externalEvidence = [];
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
			<strong>{sourceLabel}：{analysis.cloudCount ? '存在云层相交信号' : analysis.humidCount ? '存在高湿可能云区信号' : analysis.incompleteCount || analysis.positionCounts.unknown || !analysis.marks.length ? '资料不足' : '已采样位置未发现云层相交信号'}</strong>
			<p>机位：{analysis.observerName}（视点 {formatHeight(analysis.observerM, 0, unitSystem)}） → 目标：{analysis.targetName}（{formatHeight(analysis.targetM, 0, unitSystem)}）</p>
			<p>模式零云量 {analysis.zeroCloudCount} 点 · 云信号 {analysis.cloudCount} 点 · 高湿 {analysis.humidCount} 点 ／ 共 {analysis.marks.length} 点</p>
			<p>视线高度云量有效 {analysis.cloudValidCount}/{analysis.marks.length} 点 · 湿度有效 {analysis.humidityValidCount}/{analysis.marks.length} 点 · 云或湿度不完整 {analysis.incompleteCount} 点。零云量不是缺测，单项有值也不代表资料完整。</p>
			<div class="position-summary" aria-label="云区相对视线位置"><span>在视线上方 {analysis.positionCounts.above} 点</span><span>在视线下方 {analysis.positionCounts.below} 点</span><span>上下都有 {analysis.positionCounts.between} 点</span><span>云量／估算云区相交 {analysis.positionCounts.intersect} 点</span><span>高湿可能云区相交 {analysis.positionCounts.possible} 点</span><span>位置资料不足 {analysis.positionCounts.unknown} 点</span><span>已返回层无云区信号 {analysis.positionCounts['none-detected']} 点</span></div>
			<p class="limit">以上是逐点已识别云区的位置；多个高度层属于同一位置的模式剖面，不增加独立样本数量。云区上下边界按相邻层估算，未返回高度仍未知。</p>
			<details><summary>沿线数据与未知距离段</summary><p>以下只表示间隔两端的样本是否有云量和湿度，不代表整个区间已直接采样；点间云区仍为估算。</p><div class="points">{#each analysis.intervals as interval}<button type="button" on:click={()=>dispatch('select',interval.index)}>{formatDistance(interval.startM,1,unitSystem)}～{formatDistance(interval.endM,1,unitSystem)}：{interval.complete ? interval.positionKnown ? '两端样本可判读位置，区间仍未直接采样' : '两端云湿有值，但云区边界不足，该段不能排除相交' : '至少一端云湿缺测，该段不能排除云遮挡'}</button>{/each}</div></details>
			{#each analysis.correctionWarnings as warning}<p class="sightline-warning">{warning}</p>{/each}
			<div class="cloud-sightline-legend"><span>白线：视线</span><span>云信号颜色与主图云量色阶相同</span><span>紫点：高湿／估算云区</span><span>灰点：缺测</span><span>白点：模式零云量且湿度有值</span></div>
			{#if selected}<div class="detail"><strong>{selected.name} · {formatDistance(selected.distanceM, 1, unitSystem)} · 视线 {formatHeight(selected.heightM, 0, unitSystem)}</strong><p>{selected.text}</p><p>云量 {Number.isFinite(selected.values.cloudPct) ? `${selected.values.cloudPct > 0 && selected.values.cloudPct < 0.1 ? '小于 0.1' : selected.values.cloudPct.toFixed(1)}%（色阶 ${selected.cloudIntensity}）` : '缺测'} · 相对湿度 {Number.isFinite(selected.values.humidityPct) ? `${Math.round(selected.values.humidityPct)}%` : '缺测'}</p><small>云量多少与光路遮挡概率不同；本功能不输出“能看见／看不见”的确定结论。</small></div>{/if}
			{#if selected}<CloudPositionDetails position={selected.position} derivedCloud={selected.derivedCloud} {unitSystem}/>{/if}
			<details><summary>逐点云层相对视线 · 点击定位</summary><div class="points">{#each analysis.marks as mark}<button type="button" aria-pressed={selectedIndex === mark.index} on:click={()=>dispatch('select',mark.index)}><strong>{mark.name} · {formatDistance(mark.distanceM,1,unitSystem)} · {mark.position.label}</strong><span>视线 {formatHeight(mark.heightM,0,unitSystem)}；{mark.position.reason}</span></button>{/each}</div></details>
			<details><summary>逐点视线云层依据</summary><div class="points">{#each analysis.marks as mark}<button type="button" on:click={() => dispatch('select', mark.index)}>{mark.name} · {formatDistance(mark.distanceM, 1, unitSystem)}：{mark.text}</button>{/each}</div></details>
			{#if analysis.outsideChart}<p>部分视线超出当前 0–9000 米图框；图中只显示范围内的线段，缺失部分不代表无云。</p>{/if}
		{:else}<p role="status">{analysis?.reason}</p>{/if}
		{#if externalEvidence.length}
			<details><summary>Open-Meteo GFS · 独立视线云层参考</summary>
				<p>与上方 {sourceLabel} 判断分开；不同模式之间不拼接成一条确定的无云光路。</p>
				<div class="points">{#each externalEvidence as point,index}<button type="button" on:click={() => dispatch('select',index)}>{point.name}：{Number.isFinite(point.values.cloudPct) ? point.values.cloudPct > 0 ? `云量 ${Math.round(point.values.cloudPct)}% · 云层相交信号` : '云量 0% · 不能保证实况可见' : '云量缺测'} · {Number.isFinite(point.values.humidityPct) ? `湿度 ${Math.round(point.values.humidityPct)}%${point.values.humidityPct >= 90 ? ' · 高湿可能云区' : ''}` : '湿度缺测'} · {point.times.length ? point.times.map(t=>formatForecastTime(t)).join(' ～ ') + ' 北京时间' : '无匹配有效时次'}{point.times.length > 1 ? ' · 两侧时次保守值' : ''}{point.error ? ` · ${point.error}` : ''}</button>{/each}</div>
				{#if externalEvidence[selectedIndex]?.position}<p>GFS 所选点：{externalEvidence[selectedIndex].name}</p><CloudPositionDetails position={externalEvidence[selectedIndex].position} {unitSystem}/>{/if}
			</details>
		{/if}
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
	.cloud-sightline-legend { position: static; display: flex; flex-wrap: wrap; gap: 6px 16px; color: #d8e3f4; margin: 12px 0; }
	.cloud-sightline-legend span { position: static; display: inline-block; color: #d8e3f4; background: transparent; padding: 0; }
	.sightline-warning { color: #ffd166; }
	.detail { border-left: 3px solid #fff; padding: 10px 14px; margin: 12px 0; background: #1c273a; }
	.points { display: grid; gap: 8px; padding-top: 10px; }
	.points button { text-align: left; min-height: 44px; padding: 8px; color: #eef3fa; background: #1c273a; border: 1px solid #71809a; }
	.points button span {display:block;margin-top:5px;}
	.points button[aria-pressed="true"] {border-color:#31d4e5;box-shadow:inset 0 0 0 1px #31d4e5;}
	.position-summary {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;}
	.position-summary span {padding:8px;border:1px solid #71809a;background:#1c273a;}
	.limit { color: #bdc9da; font-size: 14px; }
	@media(max-width: 600px) { .inputs { grid-template-columns: 1fr; } .position-summary {grid-template-columns:repeat(2,minmax(0,1fr));} }
</style>
