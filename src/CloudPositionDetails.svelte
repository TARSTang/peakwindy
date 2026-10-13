<script>
  import { heightToDisplay, heightUnit } from './lib/units.js';
  export let position;
  export let unitSystem = 'metric';
  export let derivedCloud = false;
  const height = value => {
    const display = heightToDisplay(value,unitSystem);
    const step = unitSystem === 'imperial' ? 500 : 100;
    return Number.isFinite(display) ? `${Math.round(display/step)*step} ${heightUnit(unitSystem)}` : '—';
  };
  const gap = value => heightToDisplay(value,unitSystem) < (unitSystem === 'imperial' ? 500 : 100)
    ? `不足 ${unitSystem === 'imperial' ? 500 : 100} ${heightUnit(unitSystem)}` : `约 ${height(value)}`;
</script>
{#if position}
  <div class="position-detail">
    <strong>{position.label}</strong><p>{position.reason}</p>
    {#if derivedCloud}<p>当前 API 云量由湿度推算，下面云带与高湿区不是两项独立证据。</p>{/if}
    {#if position.cloudBands.length || position.humidityBands.length}
      <div class="bands">
        {#each [...position.cloudBands,...position.humidityBands] as band}
          <article><strong>{band.type === 'cloud' ? derivedCloud ? 'API 湿度推算云带' : '模式云带' : '高湿可能云区'} · {band.label}</strong>
            <span>下界：{band.lowerBoundaryKnown ? `约 ${height(band.lowHeightM)}` : '未确定'} · 上界：{band.upperBoundaryKnown ? `约 ${height(band.highHeightM)}` : '未确定'}</span>
            {#if Number.isFinite(band.gapM)}<span>与所用估算层界相差{gap(band.gapM)}，不代表实际云底／云顶精度。</span>{/if}
            {#if Number.isFinite(band.layerSpacingM)}<span>此云区附近返回高度层的最大间距约 {height(band.layerSpacingM)}；层界显示取整不代表该精度。</span>{/if}
            {#if Number.isFinite(band.peakCloudPct)}<span>已返回层最高云量 {band.peakCloudPct > 0 && band.peakCloudPct < 0.1 ? '小于 0.1' : band.peakCloudPct.toFixed(1)}%</span>{/if}
          </article>
        {/each}
      </div>
    {/if}
  </div>
{/if}
<style>
  .position-detail {margin:12px 0;padding:12px;border:1px solid #71809a;line-height:1.6;}
  p {margin:8px 0;}
  .bands {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  article {display:grid;gap:5px;border-left:3px solid #31d4e5;background:#152039;padding:10px;color:#eef4ff;min-width:0;overflow-wrap:anywhere;}
  @media(max-width:600px){.bands{grid-template-columns:1fr;}}
</style>
