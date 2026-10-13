const verticalFields = ['temperatureC','relativeHumidityPct','cloudPct','windSpeedMs','windDirectionDeg'];
const surfaceFields = ['surfaceVisibilityM','surfaceWindGustMs','precipAmountMm','precipSnowAmountMm','surfaceWeatherWarningCode','lowCloudPct','mediumCloudPct','highCloudPct'];
const hasValue = level => verticalFields.some(field => Number.isFinite(level?.[field]));

export function frameHasWeather(frame) {
  return frame?.levels?.some(level => Number.isFinite(level.heightM) && hasValue(level))
    || (Number.isFinite(frame?.surfaceLevel?.heightM) && hasValue(frame.surfaceLevel))
    || surfaceFields.some(field => Number.isFinite(frame?.[field]));
}

// Preserve empty frames for diagnostics, but never offer them as available forecast times.
export function withWeatherCapabilities(profile) {
  if (!profile) return profile;
  const frames = profile.frames ?? [];
  const timestampsMs = frames.filter(frame => Number.isFinite(frame.timestampMs) && frameHasWeather(frame)).map(frame => frame.timestampMs);
  const hasVerticalLayers = frames.some(frame => frame.levels?.some(level => Number.isFinite(level.heightM) && hasValue(level)));
  const hasSurfaceData = frames.some(frame => hasValue(frame.surfaceLevel) || surfaceFields.some(field => Number.isFinite(frame[field])));
  return {...profile,reportedTimestampsMs:profile.reportedTimestampsMs ?? profile.timestampsMs ?? [],
    receivedAtMs:profile.receivedAtMs ?? Date.now(),
    timestampsMs,hasVerticalLayers,hasSurfaceData,ok:timestampsMs.length > 0,
    error:timestampsMs.length ? '' : profile.error || '响应只有高度或空字段，没有可用天气数值',
    fieldCapabilities: Object.fromEntries(verticalFields.map(field => {
      const valid = frames.flatMap(frame => (frame.levels ?? []).filter(level => Number.isFinite(level.heightM) && Number.isFinite(level[field])).map(level => ({heightM:level.heightM,timestampMs:frame.timestampMs})));
      return [field,{validLayerCount:valid.length,validTimeCount:new Set(valid.map(item=>item.timestampMs)).size,
        minHeightM:valid.length ? Math.min(...valid.map(item=>item.heightM)) : null,
        maxHeightM:valid.length ? Math.max(...valid.map(item=>item.heightM)) : null}];
    }))};
}
