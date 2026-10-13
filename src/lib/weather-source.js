export function weatherSourceDetails(profile, provider = 'windy', selectedModel = 'ecmwf') {
  const external = profile?.dataSource === 'open-meteo' || provider === 'open-meteo';
  const model = profile?.servedModel ?? selectedModel;
  if (!external) return {name:`Windy · ${String(model).toUpperCase()}`,spatial:'当前响应未明确提供网格分辨率',
    temporal:'以实际返回时次为准；请求间隔不等于模型原生分辨率',url:'https://docs.windy-plugins.com/'};
  const result = model === 'icon' ? {name:'Open-Meteo · ICON Global',spatial:'约 11 千米（0.1°）',temporal:'原始时步前段约 1 小时、78 小时后约 3 小时；API 提供小时插值序列',url:'https://open-meteo.com/en/docs/dwd-api'}
    : model === 'gfs' ? {name:'Open-Meteo · GFS Global',spatial:'气压层约 25 千米（0.25°）；地面约 13 千米',temporal:'原始时步前段约 1 小时、120 小时后约 3 小时；API 提供小时插值序列',url:'https://open-meteo.com/en/docs/gfs-api'}
    : {name:'Open-Meteo · ECMWF IFS 0.25°',spatial:'约 25 千米（0.25°）',temporal:'原始时步约 3 小时，144 小时后约 6 小时；API 提供小时插值序列',url:'https://open-meteo.com/en/docs/ecmwf-api'};
  return {...result,derivedCloud:model !== 'gfs',gridLatitude:profile?.gridLatitude,gridLongitude:profile?.gridLongitude};
}
