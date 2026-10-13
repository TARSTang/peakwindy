<script>
  import { externalValuesAt } from './lib/external-weather.js';
  import { frameAtTimestamp, interpolateAtHeight, formatForecastTime } from './lib/profile.js';
  import { heightToDisplay, heightUnit, temperatureToDisplay, temperatureUnit, windToDisplay, windUnit, precipitationToDisplay, precipitationUnit } from './lib/units.js';
  export let sample;
  export let timestampMs;
  export let heightM;
  export let unitSystem = 'metric';
  $: result = externalValuesAt(sample?.supplement,timestampMs,heightM,sample?.terrainElevationM);
  $: primaryGround = Number.isFinite(sample?.profile?.modelElevationM) ? Math.max(sample?.terrainElevationM ?? -Infinity,sample.profile.modelElevationM) : sample?.terrainElevationM;
  $: primary = interpolateAtHeight(frameAtTimestamp(sample?.profile?.frames,timestampMs),heightM,primaryGround);
  $: missing = key => !Number.isFinite(primary?.[key]);
  $: rows = [
    ['温度', 'temperatureC', temperatureToDisplay(result.values.temperatureC,unitSystem),temperatureUnit(unitSystem)],
    ['相对湿度','humidityPct',result.values.humidityPct,'%'],
    ['风速','windSpeedMs',windToDisplay(result.values.windSpeedMs,unitSystem),windUnit(unitSystem)],
    ['云量','cloudPct',result.values.cloudPct,'%']
  ];
  const show = (v,unit,digits=1) => Number.isFinite(v) ? `${v.toFixed(digits)} ${unit}` : '未提供／该高度缺测';
</script>
<section aria-label="外部缺测补充">
  <h3>{sample?.name ?? '当前点'} · 外部缺测补充</h3>
  <p class="source">Open-Meteo · GFS · 独立模式参考，不并入 Windy 图表</p>
  {#if sample?.supplement}
    <p>查询海拔 {show(heightToDisplay(heightM,unitSystem),heightUnit(unitSystem),0)} · {result.times.length ? result.times.map(t=>formatForecastTime(t)).join(' ～ ') + ' 北京时间' : '该时刻不在补充预报有效范围'}</p>
    {#if result.times.length > 1}<p>云量、湿度取两侧有效时次较大值；温度、风和地面值不跨时次补造。</p>{/if}
    <dl>{#each rows as row}<div><dt>{row[0]}{missing(row[1]) ? ' · Windy 缺测' : ' · Windy 已有值，供对照'}</dt><dd>{show(row[2],row[3])}</dd></div>{/each}
      <div><dt>地面能见度 · 非高空值</dt><dd>{show(result.frame?.surfaceVisibilityM,'米',0)}</dd></div>
      <div><dt>雪降水水当量 · 1 小时累计</dt><dd>{show(precipitationToDisplay(result.frame?.precipSnowAmountMm,unitSystem),precipitationUnit(unitSystem))}</dd></div>
    </dl>
    <p class="limit">保留 GFS 自身地表边界；有效相邻气压层之间插值，缺层不跨越。小时接口时次不代表原始模式小时分辨率，起报时间未返回。完整云底和逐层能见度未提供；缺测不代表无云。</p>
  {:else}<p>{sample?.supplementError || '无需补充或尚未读取补充数据。'}</p>{/if}
  <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">天气数据：Open-Meteo（CC BY 4.0）</a>
</section>
<style>
  section {border:1px solid #667b9e;background:#152039;color:#eef4ff;padding:16px;margin:16px 0;line-height:1.6;}
  h3 {margin:0;font-size:18px;color:#eef4ff;} p {margin:8px 0;} .source {color:#9dddf5;font-weight:700;}
  dl {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;}
  dl div {padding:10px;background:#0d1527;border:1px solid #445471;min-width:0;}
  dt {font-size:13px;color:#c4d3e7;} dd {margin:5px 0 0;font-weight:700;overflow-wrap:anywhere;}
  .limit {font-size:13px;color:#c4d3e7;} a {color:#9dddf5;}
  @media(max-width:600px){dl{grid-template-columns:repeat(2,minmax(0,1fr));}}
</style>
