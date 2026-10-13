<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { savedRoutesKey,savedRoutesEvent,readSavedRoutes,saveNewRoute,deleteSavedRoute,restoreSavedRoute,encodeRoutes,importSavedRoutes,cleanSavedRoute } from './lib/saved-routes.js';
  export let draft;
  let routes=[],name='',search='',page=0,status='',storageError='',deleted=[],importing=false;
  const dispatch=createEventDispatcher();
  const pageSize=10;
  $: filtered=routes.filter(route=>!search || route.name.toLowerCase().includes(search.trim().toLowerCase()));
  $: if(page>Math.max(0,Math.ceil(filtered.length/pageSize)-1)) page=0;
  $: visible=filtered.slice(page*pageSize,(page+1)*pageSize);
  function refresh(){const result=readSavedRoutes();routes=result.routes;storageError=result.ok ? '' : `本地路线未读取成功：${result.reason}；尚未覆盖存储。`;}
  function save(){try{const result=saveNewRoute({...draft,name:name.trim() || draft?.name || ''});routes=result.routes;status=`${result.duplicate ? '这条路线已保存，未重复添加' : '已保存「'+result.route.name+'」'}；记录的是路线配置，天气需重新分析。`;name='';dispatch('saved',result.route);}catch(error){status=error.message;}}
  function use(route){name='';status=`已使用「${route.name}」；请点击分析取得最新天气。`;dispatch('use',route);}
  function download(data,filename){const url=URL.createObjectURL(new Blob([data],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportCurrent(){try{download(encodeRoutes([cleanSavedRoute({...draft,name:name.trim() || draft?.name || ''})]),'高海拔天气剖面-当前路线.json');status='已导出当前路线；文件包含地点坐标和海拔设置，可手动发给朋友。';}catch(error){status=error.message;}}
  function exportAll(){try{download(encodeRoutes(routes),'高海拔天气剖面-路线备份.json');status='已导出本浏览器保存的路线；不包含天气或账号数据。';}catch(error){status=error.message;}}
  async function importFile(event){const input=event.currentTarget,file=input.files?.[0];if(!file)return;importing=true;try{if(file.size>2*1024*1024)throw new Error('路线文件超过 2 MB');const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());const result=importSavedRoutes(raw);routes=result.routes;status=`追加 ${result.added} 条路线，跳过 ${result.duplicates} 条相同路线；未替换当前分析。`;}catch(error){status=`导入失败：${error.message}；请使用本插件导出的 UTF-8 JSON，已有路线未被覆盖。`;}finally{importing=false;input.value='';}}
  function remove(route){try{const result=deleteSavedRoute(route.id);routes=result.routes;deleted=[...deleted.slice(-9),result.route];status=`已删除「${route.name}」，本次打开期间可撤销。`;}catch(error){status=error.message;}}
  function undo(){try{routes=restoreSavedRoute(deleted.at(-1));deleted=deleted.slice(0,-1);status='已恢复删除的路线。';}catch(error){status=error.message;}}
  onMount(()=>{refresh();const storage=event=>{if(event.key===savedRoutesKey)refresh();};window.addEventListener('storage',storage);window.addEventListener(savedRoutesEvent,refresh);return()=>{window.removeEventListener('storage',storage);window.removeEventListener(savedRoutesEvent,refresh);};});
</script>
<details class="route-library">
  <summary>我的路线 · 保存与分享（{routes.length}）</summary>
  <p>保存机位、目标、名称和海拔设置，支持手机与电脑导入同一个路线文件。本地保存不跨设备自动同步；天气需重新分析。使用保存的路线会替换当前草稿，可先保存当前路线。</p>
  <label>路线名称（可留空）<input bind:value={name} maxlength="64" placeholder={draft?.name || '默认使用起点 → 终点'} /></label>
  <div class="actions"><button disabled={!(draft?.points?.length>=2) || !!storageError} on:click={save}>保存当前路线</button><button disabled={!(draft?.points?.length>=2)} on:click={exportCurrent}>导出当前路线</button><button disabled={!routes.length} on:click={exportAll}>导出全部路线</button></div>
  <label class="import">导入路线文件（JSON，最多 2 MB）<input type="file" accept=".json,application/json" disabled={importing || !!storageError} on:change={importFile}/></label>
  {#if storageError}<p role="alert">{storageError}</p>{/if}{#if status}<p role="status">{status}</p>{/if}
  {#if deleted.length}<button on:click={undo}>撤销上次删除</button>{/if}
  <label>搜索保存的路线<input type="search" bind:value={search} on:input={()=>page=0} placeholder="路线名称"/></label>
  <div class="routes">{#each visible as route (route.id)}<article><strong>{route.name}</strong><span>{route.points.length} 个点 · {route.settings.provider==='windy' ? 'Windy' : 'Open-Meteo'} {route.settings.model.toUpperCase()}</span><span>{route.points[0].name} → {route.points.at(-1).name} · WGS-84</span><small>起点：经度 {route.points[0].lon.toFixed(5)}，纬度 {route.points[0].lat.toFixed(5)}；终点：经度 {route.points.at(-1).lon.toFixed(5)}，纬度 {route.points.at(-1).lat.toFixed(5)}</small><small>视点离地 {route.settings.eyeHeightM} 米 · 机位校正 {route.settings.startElevationM ?? route.points[0].elevationM ?? '自动读取'} · 目标校正 {route.settings.targetElevationM ?? route.points.at(-1).elevationM ?? '自动读取'}</small><div class="actions"><button on:click={()=>use(route)}>使用此路线</button><button on:click={()=>remove(route)}>删除</button></div></article>{/each}</div>
  {#if filtered.length>pageSize}<div class="actions"><button disabled={page===0} on:click={()=>page--}>上一页</button><span>{page+1}/{Math.ceil(filtered.length/pageSize)}</span><button disabled={(page+1)*pageSize>=filtered.length} on:click={()=>page++}>下一页</button></div>{/if}
  <p>导入只追加，不覆盖现有路线；所有坐标均为已转换的 WGS-84。使用路线会取消旧分析，但不会自动联网读取天气。</p>
</details>
<style>
  .route-library {border:1px solid #71809a;border-radius:6px;margin:14px 0;padding:12px;line-height:1.6;}
  summary {min-height:44px;font-weight:700;cursor:pointer;} p {margin:8px 0;}
  label {display:grid;gap:5px;margin:10px 0;} input {box-sizing:border-box;width:100%;min-height:44px;padding:8px;background:#f4f8f7;color:#213b43;border:1px solid #71809a;border-radius:4px;}
  .actions {display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;} button {min-height:44px;padding:8px 12px;background:#e8f1ef;color:#214d58;border:1px solid #71809a;border-radius:4px;font-weight:700;cursor:pointer;}
  button:disabled {opacity:.55;cursor:default;} button:focus-visible {outline:3px solid #31d4e5;outline-offset:2px;}
  .routes {display:grid;gap:8px;} article {display:grid;gap:5px;border:1px solid #71809a;border-radius:4px;padding:10px;overflow-wrap:anywhere;}
</style>
