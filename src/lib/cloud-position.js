import { directCloudLayerBands, humidityCloudBands, interpolateAtHeight } from './profile.js';

// These are layer-boundary estimates, not exact cloud surfaces or visibility probabilities.
function bandPosition(band, heightM, type) {
  let relation = 'unknown', gapM = null;
  if (heightM >= band.lowHeightM && heightM <= band.highHeightM) relation = 'intersect';
  else if (heightM < band.lowHeightM && band.lowerBoundaryKnown) {relation = 'above';gapM = band.lowHeightM-heightM;}
  else if (heightM > band.highHeightM && band.upperBoundaryKnown) {relation = 'below';gapM = heightM-band.highHeightM;}
  return {...band,type,relation,gapM,
    label:relation === 'above' ? '云区在视线上方（层界估算）'
      : relation === 'below' ? '云区在视线下方（层界估算）'
      : relation === 'intersect' ? '估算云区与视线相交'
      : '云区边界不完整，不能排除与视线相交'};
}

function withLayerSpacing(band, frame) {
  const levels = (frame.levels ?? []).filter(level=>Number.isFinite(level.heightM)).sort((a,b)=>a.heightM-b.heightM);
  const spacings = levels.slice(1).flatMap((level,index)=> {
    const previous = levels[index];
    return previous.heightM <= band.highHeightM && level.heightM >= band.lowHeightM
      ? [level.heightM-previous.heightM] : [];
  }).filter(value=>value > 0);
  return {...band,layerSpacingM:spacings.length ? Math.max(...spacings) : null};
}

export function describeCloudPosition(frame, heightM, groundM, inputValues = null) {
  const unknown = reason => ({relation:'unknown',label:'资料不足',reason,cloudBands:[],humidityBands:[],
    cloudIntersects:false,humidityIntersects:false,boundariesIncomplete:false});
  if (!frame || !Number.isFinite(heightM)) return unknown('没有精确匹配的天气时次或有效视线高度。');
  const values = inputValues ?? interpolateAtHeight(frame,heightM,groundM);
  if (values.reason === 'below-terrain') return unknown('视线低于天气有效地表边界；本功能不判断地形通视。');
  const cloudBands = directCloudLayerBands(frame,groundM).map(band=>bandPosition(withLayerSpacing(band,frame),heightM,'cloud'));
  const maxReturnedHeight = Math.max(9000,...(frame.levels ?? []).map(level=>level.heightM).filter(Number.isFinite));
  const humidityBands = humidityCloudBands(frame,groundM,maxReturnedHeight).map(band=>bandPosition(withLayerSpacing(band,frame),heightM,'humidity'));
  const cloudIntersects = cloudBands.some(band=>band.relation === 'intersect');
  const humidityIntersects = humidityBands.some(band=>band.relation === 'intersect');
  const bands = [...cloudBands,...humidityBands];
  const boundariesIncomplete = bands.some(band=>!band.lowerBoundaryKnown || !band.upperBoundaryKnown);
  let relation = 'unknown',label = '资料不足',reason = '视线高度的云量或湿度缺测，不能排除云层相交。';
  if (Number.isFinite(values.cloudPct) && values.cloudPct > 0) {
    relation='intersect';label='视线高度有云量信号';reason='查询高度的模式云量大于零；不能换算成遮挡概率。';
  } else if (cloudIntersects) {
    relation='intersect';label='估算云区与视线相交';reason='按相邻高度层估算的云带覆盖视线；不是实测云层边界。';
  } else if (values.humidityPct >= 90 || humidityIntersects) {
    relation='possible';label='高湿可能云区与视线相交';reason='湿度推断信号不代表已确认有云。';
  } else if (Number.isFinite(values.cloudPct) && Number.isFinite(values.humidityPct)) {
    if (bands.some(band=>band.relation === 'unknown')) {
      reason='存在未确定的云区边界；已返回层的零云量不能排除未覆盖高度有云。';
    } else if (bands.some(band=>band.relation === 'above') && bands.some(band=>band.relation === 'below')) {
      relation='between';label='已识别云区分布在视线上下';reason='只说明该采样位置的已识别云区，不代表整条光路透明。';
    } else if (bands.some(band=>band.relation === 'above')) {
      relation='above';label='已识别云区在视线上方';reason='下界由有效相邻层估算；其他未返回高度和点间仍未知。';
    } else if (bands.some(band=>band.relation === 'below')) {
      relation='below';label='已识别云区在视线下方';reason='上界由有效相邻层估算；其他未返回高度和点间仍未知。';
    } else {
      relation='none-detected';label='已返回层未发现云区信号';reason='只针对实际返回的高度层，不能确认整层大气或整个距离区间无云。';
    }
  }
  return {relation,label,reason,cloudBands,humidityBands,cloudIntersects,humidityIntersects,boundariesIncomplete};
}
