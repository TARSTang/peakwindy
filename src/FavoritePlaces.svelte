<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		favoritePlaces,
		favoriteStorageKey,
		loadFavoritePlaces,
		removeFavoritePlace,
		renameFavoritePlace,
		saveFavoritePlace,
	} from './lib/favorites.js';

	export let currentPlace = null;
	export let selectLabel = '使用此地点';

	const dispatch = createEventDispatcher();
	let notice = '';
	let storageError = false;

	$: currentIsSaved = currentPlace && $favoritePlaces.some(
		(place) => place.lat.toFixed(5) === Number(currentPlace.lat).toFixed(5)
			&& place.lon.toFixed(5) === Number(currentPlace.lon).toFixed(5),
	);

	onMount(() => {
		const loaded = loadFavoritePlaces();
		storageError = !loaded.ok;
		function handleStorage(event) {
			if (event.key === favoriteStorageKey || event.key === null) {
				const result = loadFavoritePlaces();
				storageError = !result.ok;
			}
		}
		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	});

	function saveCurrent() {
		if (!currentPlace) return;
		const result = saveFavoritePlace(currentPlace);
		storageError = !result.ok;
		notice = result.ok
			? result.updated ? '已更新这个收藏地点' : '已添加到地点收藏'
			: (result.reason ?? '浏览器无法保存收藏，请检查本地存储权限');
	}

	function rename(id, event) {
		const result = renameFavoritePlace(id, event.currentTarget.value);
		storageError = !result.ok;
		notice = result.ok ? '地点名称已保存' : (result.reason ?? '名称未能保存');
		if (!result.ok) event.currentTarget.value = $favoritePlaces.find((place) => place.id === id)?.name ?? '';
	}

	function remove(id, name) {
		const result = removeFavoritePlace(id);
		storageError = !result.ok;
		notice = result.ok ? `已删除“${name}”` : '删除失败，请检查本地存储权限';
	}
</script>

<details class="favorite-places">
	<summary>我的地点收藏 <span>{$favoritePlaces.length}</span></summary>
	<div class="favorite-content">
		<p class="favorite-note">仅保存在这台设备的 Windy 浏览器中，不会上传或同步给其他人。</p>
		{#if currentPlace}
			<div class="current-place">
				<div class="current-place-copy">
					<span>当前地点</span>
					<strong>{currentPlace.name}</strong>
					<small>{Number(currentPlace.lat).toFixed(5)}°, {Number(currentPlace.lon).toFixed(5)}°</small>
				</div>
				<button type="button" on:click={saveCurrent}>{currentIsSaved ? '更新收藏' : '收藏地点'}</button>
			</div>
		{/if}
		{#if notice}<p class:favorite-error={storageError} class="favorite-status" role={storageError ? 'alert' : 'status'}>{notice}</p>{/if}
		{#if $favoritePlaces.length}
			<ul>
				{#each $favoritePlaces as place (place.id)}
					<li>
						<label class="favorite-name">地点名称
							<input type="text" maxlength="32" value={place.name} on:change={(event) => rename(place.id, event)} aria-label={`收藏地点 ${place.name} 的名称`} />
						</label>
						<small class="favorite-coordinates">{place.lat.toFixed(5)}°, {place.lon.toFixed(5)}°{#if Number.isFinite(place.elevationM)} · 校正海拔 {Math.round(place.elevationM)} 米{/if}</small>
						<div class="favorite-actions">
							<button type="button" class="use-favorite" on:click={() => dispatch('select', place)}>{selectLabel}</button>
							<button type="button" class="remove-favorite" on:click={() => remove(place.id, place.name)} aria-label={`删除收藏地点 ${place.name}`}>删除</button>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="favorite-empty">还没有收藏地点。选好地点后，点“收藏地点”即可保存。</p>
		{/if}
	</div>
</details>

<style>
	.favorite-places { margin: 12px 0; border: 1px solid #d5e1df; border-radius: 8px; background: #fbfdfc; color: #20333a; }
	.favorite-places summary { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 11px; color: #315f66; cursor: pointer; font-weight: 700; }
	.favorite-places summary span { display: inline-grid; min-width: 26px; height: 26px; place-items: center; border-radius: 999px; background: #e6f1ee; color: #315f66; font-size: 12px; }
	.favorite-content { border-top: 1px solid #e0e9e6; padding: 10px; }
	.favorite-note, .favorite-empty, .favorite-status { margin: 0 0 9px; color: #52676a; font-size: 12px; line-height: 1.5; }
	.current-place { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; margin-bottom: 10px; border-radius: 7px; padding: 8px; background: #eff6f3; }
	.current-place-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
	.current-place-copy span, .current-place-copy small { color: #52676a; font-size: 11px; }
	.current-place-copy strong { overflow: hidden; color: #20333a; text-overflow: ellipsis; white-space: nowrap; }
	.favorite-places button, .favorite-name input { box-sizing: border-box; min-height: 44px; border: 1px solid #cbd9d7; border-radius: 6px; padding: 0 10px; font: inherit; }
	.favorite-places button { background: #fff; color: #315f66; cursor: pointer; }
	.current-place button, .use-favorite { background: #e6f1ee !important; color: #315f66; font-weight: 700; }
	.favorite-places ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.favorite-places li { min-width: 0; border: 1px solid #e0e9e6; border-radius: 7px; padding: 8px; }
	.favorite-name { display: grid; gap: 4px; color: #52676a; font-size: 11px; }
	.favorite-name input { width: 100%; background: #fff; color: #20333a; }
	.favorite-coordinates { display: block; overflow-wrap: anywhere; margin: 5px 0 7px; color: #52676a; font-family: Consolas, monospace; font-size: 11px; }
	.favorite-actions { display: flex; gap: 7px; }
	.favorite-actions button { flex: 1; }
	.favorite-actions .remove-favorite { color: #875747; }
	.favorite-status { margin-top: 8px; color: #276656; }
	.favorite-status.favorite-error { color: #a13c33; }
	@media (max-width: 360px) {
		.current-place { grid-template-columns: minmax(0, 1fr); }
		.current-place button { width: 100%; }
	}
</style>
