<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatForecastTime } from './lib/profile.js';
  import { buildSightlineOverview, beijingDate } from './lib/sightline-overview.js';
  export let points = [];
  export let samples = [];
  export let timestamps = [];
  export let startText = '';
  export let targetText = '';
  export let eyeHeightM = 1.6;
  export let selectedTimestampMs = null;
  export let sourceLabel = 'Windy';
  let opened=false,loading=false,progress=0,total=0,rows=[],reason='',date='',generation=0;
  let signature='',profiles=[];
  let lastSelectedTimestamp=null;
  const dispatch=createEventDispatcher();
  $: update(opened,points,samples,timestamps,startText,targetText,eyeHeightM);
  $: dates=[...new Set(rows.map(row=>beijingDate(row.timestampMs)))];
  $: syncDate(selectedTimestampMs,dates);
  $: dayRows=rows.filter(row=>beijingDate(row.timestampMs)===date);
  function syncDate(timestamp,available) {
    if(!available.length)return;
    const day=beijingDate(timestamp ?? Date.now());
    if(timestamp!==lastSelectedTimestamp || !available.includes(date)) {date=available.includes(day) ? day : available[0];lastSelectedTimestamp=timestamp;}
  }
  function update(open,route,data,times,start,target,eye) {
    const key=JSON.stringify([route.map(point=>[point.lat,point.lon,point.elevationM]),data.map(sample=>[sample.key,sample.terrainElevationM]),times,start,target,eye]);
    if(open && signature===key && profiles.length===data.length && data.every((sample,index)=>sample.profile===profiles[index])) return;
    const id=++generation;signature=open ? key : '';profiles=data.map(sample=>sample.profile);
    rows=[];reason='';progress=0;total=times.length;loading=false;
    if(!open) return;
    if(!times.length) {reason='请先分析路线，取得有效预报时次。';return;}
    if(!data.some(sample=>sample.profile?.ok)) {reason='主来源没有可用天气剖面；GFS 独立补充请在单独面板查看。';return;}
    if(route.length!==2) {reason='视线概览需要两个路线点：机位与目标。';return;}
    loading=true;
    void buildSightlineOverview({points:route,samples:data,timestamps:times,startText:start,targetText:target,eyeHeightM:eye,
      isCancelled:()=>id!==generation,onProgress:(done,count)=>{if(id===generation){progress=done;total=count;}}
    }).then(result=>{if(id===generation && result){rows=result.rows;reason=result.reason;loading=false;}})
      .catch(()=>{if(id===generation){reason='概览计算未完成，请关闭后重新展开。';loading=false;}});
  }
  onDestroy(()=>{generation++;});
</script>
<details class="overview" on:toggle={event=>opened=event.currentTarget.open}>
  <summary>预报时段概览 · {sourceLabel}</summary>
  {#if opened}
    <p>复用主来源已下载的数据，不发新请求；GFS 独立补充不混入本表。未知不能当作无云，点间仍未直接采样，数量不是可见概率。Open-Meteo 时次只切换插件图表，Windy 背景地图的时间另行控制。</p>
    {#if loading}<p role="status">正在计算 {progress}/{total} 个时次；关闭本区可停止计算。</p>
    {:else if reason}<p role="status">{reason}</p>
    {:else}
      <label>日期（北京时间）<select bind:value={date}>{#each dates as value}<option value={value}>{value}</option>{/each}</select></label>
      <div class="rows">{#each dayRows as row (row.timestampMs)}
        <button class:active={row.timestampMs===selectedTimestampMs} aria-pressed={row.timestampMs===selectedTimestampMs} on:click={()=>dispatch('select',row.timestampMs)}>
          <strong>{formatForecastTime(row.timestampMs)} · {row.label}</strong>
          <span>云信号 {row.cloudCount} 点 · 高湿 {row.humidCount} 点 · 未知 {row.unknownCount}/{row.totalCount} 点</span>
          <span>云量有效 {row.cloudValidCount}/{row.totalCount} · 湿度有效 {row.humidityValidCount}/{row.totalCount} · 资料完整 {row.completeCount}/{row.totalCount}</span>
        </button>
      {/each}</div>
      <p>点击时次切换主图。小时 API 序列可能经过时间插值，不代表原始模型每小时独立预报。</p>
    {/if}
  {/if}
</details>
<style>
  .overview {margin:16px 0;padding:12px;border:1px solid #71809a;background:#152039;color:#eef4ff;line-height:1.6;}
  summary {min-height:44px;cursor:pointer;font-weight:700;} p {margin:8px 0;}
  label {display:flex;align-items:center;gap:10px;flex-wrap:wrap;} select {min-height:44px;padding:8px;background:#10192c;color:#eef4ff;border:1px solid #71809a;}
  .rows {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;}
  button {display:grid;gap:5px;min-height:44px;text-align:left;padding:10px;background:#10192c;color:#eef4ff;border:1px solid #71809a;cursor:pointer;overflow-wrap:anywhere;}
  button.active {border-color:#31d4e5;box-shadow:inset 0 0 0 1px #31d4e5;} button:focus-visible {outline:3px solid #31d4e5;outline-offset:2px;}
  @media(max-width:600px){.rows{grid-template-columns:1fr;}}
</style>
