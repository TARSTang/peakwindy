<script>
  import { weatherSourceDetails } from './lib/weather-source.js';
  import { frameAtTimestamp, formatForecastTime } from './lib/profile.js';
  import { heightToDisplay, heightUnit } from './lib/units.js';
  import { weatherDiagnosticLines } from './lib/weather-diagnostics.js';
  export let profile = null;
  export let provider = 'windy';
  export let model = 'ecmwf';
  export let timestampMs = null;
  export let terrainM = null;
  export let unitSystem = 'metric';
  $: source = weatherSourceDetails(profile,provider,model);
  $: frame = frameAtTimestamp(profile?.frames,timestampMs);
  $: diagnosticLines = weatherDiagnosticLines(profile,frame);
  $: ground = Number.isFinite(profile?.modelElevationM) ? Math.max(terrainM ?? -Infinity,profile.modelElevationM) : terrainM;
  $: capabilities = [['温度','temperatureC'],['湿度','relativeHumidityPct'],['风速','windSpeedMs'],['云量','cloudPct']].map(([label,field])=>{
    const heights=(frame?.levels ?? []).filter(level=>Number.isFinite(level.heightM) && Number.isFinite(level[field]) && (!Number.isFinite(ground) || level.heightM >= ground)).map(level=>level.heightM);
    return {label,count:heights.length,min:heights.length ? Math.min(...heights) : null,max:heights.length ? Math.max(...heights) : null};
  });
  const height = v => `${heightToDisplay(v,unitSystem)?.toFixed(0) ?? '—'} ${heightUnit(unitSystem)}`;
</script>
<details class="source-info">
  <summary>{source.name} · 模型网格：{source.spatial}</summary>
  <p>{source.temporal}。沿线每 5 千米取点不等于天气精度为 5 千米；相邻点可能对应同一模型网格。</p>
  {#if Number.isFinite(source.gridLatitude) && Number.isFinite(source.gridLongitude)}<p>当前点返回的模型格点中心：{source.gridLatitude.toFixed(5)}°，{source.gridLongitude.toFixed(5)}°，与输入坐标可有偏移。</p>{/if}
  {#if source.derivedCloud}<p>逐层云量由 API 根据湿度推算；不能把云量和湿度当成两项独立证据。</p>{/if}
  {#if profile}<p>返回时间轴 {profile.reportedTimestampsMs?.length ?? profile.timestampsMs?.length ?? 0} 个时次；至少一项天气有值的时次 {profile.timestampsMs?.length ?? 0} 个。各字段仍可能缺测。</p>{/if}
  {#if Number.isFinite(profile?.receivedAtMs)}<p>本机取得响应：{formatForecastTime(profile.receivedAtMs)} 北京时间；这不是模型起报时刻。</p>{/if}
  <div class="capabilities">{#each capabilities as item}<div><strong>{item.label}</strong><span>{item.count} 个当前地表以上有效气压层</span><span>{item.count ? `${height(item.min)}～${height(item.max)}` : '当前时次无有效气压层'}</span></div>{/each}</div>
  {#if diagnosticLines.length}<details><summary>缺测与解析原因</summary>{#each diagnosticLines as line}<p>{line}</p>{/each}</details>{/if}
  <p>原生起报时刻未返回时，不按分钟承诺天气变化；零值保留，缺测不外推。</p>
  <a href={source.url} target="_blank" rel="noreferrer">数据来源说明</a>
</details>
<style>
  .source-info {border:1px solid #71809a;border-radius:6px;padding:12px;margin:12px 0;line-height:1.6;}
  summary {cursor:pointer;min-height:44px;font-weight:700;} p {margin:8px 0;}
  .capabilities {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  .capabilities div {display:grid;padding:8px;border:1px solid #71809a;min-width:0;overflow-wrap:anywhere;}
  a {color:inherit;text-decoration:underline;}
  @media(max-width:420px){.capabilities{grid-template-columns:1fr;}}
</style>
