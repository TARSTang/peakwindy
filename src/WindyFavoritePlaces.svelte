<script>
	import { createEventDispatcher } from 'svelte';
	export let places = [];
	export let loading = false;
	export let status = '';
	let query = '', page = 0;
	const dispatch = createEventDispatcher();
	$: filtered = places.filter(place => place.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
	$: resetPage(query, places);
	function resetPage() { page = 0; }
	$: visible = filtered.slice(page * 20, (page + 1) * 20);
</script>

<details class="windy-favorite-selector">
	<summary>使用 Windy 收藏地点（{places.length}）</summary>
	<p>电脑按住 Alt＋左键点击地图爱心，可把收藏的精确坐标添加到路线。重叠标记或标签未匹配时，请从下方列表添加。</p>
	<button type="button" disabled={loading} on:click={() => dispatch('refresh')}>{loading ? '读取中…' : '刷新 Windy 收藏'}</button>
	{#if status}<p role="status">{status}</p>{/if}
	{#if places.length}
		<label>搜索收藏<input type="search" bind:value={query} placeholder="输入地点名称"/></label>
		<div class="windy-favorite-list">{#each visible as place (place.id)}<div><strong>{place.name}</strong><small>{place.lat.toFixed(5)}°, {place.lon.toFixed(5)}° · WGS-84</small><button type="button" on:click={() => dispatch('select', place)}>添加到路线</button></div>{/each}</div>
		{#if filtered.length > 20}<div class="windy-favorite-pages"><button type="button" disabled={page === 0} on:click={() => page--}>上一页</button><span>{page + 1} / {Math.ceil(filtered.length / 20)}</span><button type="button" disabled={(page + 1) * 20 >= filtered.length} on:click={() => page++}>下一页</button></div>{/if}
		{#if !filtered.length}<p>没有匹配的地点。</p>{/if}
	{/if}
</details>

<style>
	.windy-favorite-selector { margin: 12px 0; border: 1px solid #cbd8d7; border-radius: 8px; padding: 12px; }
	summary { font-weight: 700; color: #426574; cursor: pointer; }
	p { margin: 10px 0; line-height: 1.6; }
	label { display: grid; gap: 6px; margin: 12px 0; }
	input { min-height: 44px; min-width: 0; padding: 8px; box-sizing: border-box; }
	button { min-height: 44px; padding: 8px 12px; background: #eaf2f0; color: #426574; border: 1px solid #cbd8d7; border-radius: 6px; cursor: pointer; }
	button:disabled { opacity: .6; cursor: default; }
	.windy-favorite-list { display: grid; gap: 12px; }
	.windy-favorite-list > div { display: grid; gap: 6px; border-top: 1px solid #cbd8d7; padding-top: 12px; }
	small { color: #566a73; overflow-wrap: anywhere; }
	.windy-favorite-pages { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
</style>
