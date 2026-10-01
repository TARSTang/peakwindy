<script>
	import { createEventDispatcher } from 'svelte';
	import { BUILT_IN_PLACES } from './lib/built-in-places.js';

	export let selectLabel = '使用此地点';

	const dispatch = createEventDispatcher();
</script>

<details class="built-in-places">
	<summary>插件内置地点 <span>所有用户 · {BUILT_IN_PLACES.length}</span></summary>
	<div class="built-in-content">
		<p>坐标已从奥维 GCJ‑02 转为 Windy 使用的 WGS‑84；带“校正海拔”的点使用提供的高度修正地形值。</p>
		<ul>
			{#each BUILT_IN_PLACES as place (place.id)}
				<li>
					<div class="built-in-copy">
						<strong>{place.name}</strong>
						{#if Number.isFinite(place.elevationM)}<span>校正海拔 {place.elevationM.toLocaleString('zh-CN')} 米</span>{/if}
						<small>经度 {place.lon.toFixed(5)}°，纬度 {place.lat.toFixed(5)}° · WGS‑84</small>
					</div>
					<button type="button" on:click={() => dispatch('select', place)}>{selectLabel}</button>
				</li>
			{/each}
		</ul>
	</div>
</details>

<style>
	.built-in-places { margin: 10px 0; border: 1px solid #d5e1df; border-radius: 8px; background: #fbfdfc; color: #20333a; }
	.built-in-places summary { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 11px; color: #315f66; cursor: pointer; font-weight: 700; }
	.built-in-places summary span { color: #52676a; font-size: 12px; font-weight: 500; }
	.built-in-content { border-top: 1px solid #e0e9e6; padding: 10px; }
	.built-in-content > p { margin: 0 0 9px; color: #52676a; font-size: 12px; line-height: 1.5; }
	.built-in-content ul { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
	.built-in-content li { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #e0e9e6; border-radius: 7px; padding: 8px; }
	.built-in-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
	.built-in-copy strong { color: #20333a; }
	.built-in-copy span { color: #a35b28; font-size: 12px; font-weight: 650; }
	.built-in-copy small { color: #52676a; font-family: Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
	.built-in-content button { flex: 0 0 auto; min-height: 44px; border: 1px solid #cbd9d7; border-radius: 6px; padding: 0 10px; background: #e6f1ee; color: #315f66; cursor: pointer; font: inherit; font-weight: 700; }
	@media (max-width: 420px) {
		.built-in-content li { align-items: stretch; flex-direction: column; }
		.built-in-content button { width: 100%; }
	}
</style>
