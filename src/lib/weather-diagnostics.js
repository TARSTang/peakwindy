const labels = {
  'not-provided':'接口未返回字段', 'invalid-shape':'字段不是时次数组',
  'missing-time':'数组缺少当前时次', 'empty-value':'接口返回空值',
  'unit-mismatch':'单位不符合解析约定', 'invalid-number':'不是有效有限数值',
  'out-of-range':'数值超出字段允许范围'
};

// Counts refer to source fields, including layers below the ground boundary.
export function weatherDiagnosticLines(profile, frame = null) {
  if (!profile || profile.dataSource !== 'open-meteo') return [];
  const records = frame ? [frame.fieldDiagnostics ?? {}] : profile.fieldDiagnostics ?? [];
  const counts = {};
  const affected = {};
  for (const record of records) for (const [field,reason] of Object.entries(record)) {
    counts[reason] = (counts[reason] ?? 0)+1;
    (affected[reason] ??= new Set()).add(field.replace(/_\d+hPa$/,''));
  }
  return [frame ? 'Open-Meteo 当前时次字段诊断（包含地表以下原始层）：' : 'Open-Meteo 全响应字段诊断（按字段与时次计数）：',
    ...Object.entries(counts).map(([reason,count])=>`${labels[reason] ?? reason}：${count} 项；涉及 ${[...affected[reason]].join('、')}`),
    ...(!Object.keys(counts).length ? ['请求字段未发现上述解析异常；查询高度仍可能不在有效层范围内。'] : []),
    '完整云底与逐层能见度：当前接入未提供，不用地面值补作高空值。',
    '查询缺测另有原因：低于有效地表、超出已返回高度范围，或相邻有效层之间存在缺口；均不外推。'];
}
