import { createMemoryCache, withWindyRequestLimit } from './async.js';
import { frameAtTimestamp, interpolateAtHeight } from './profile.js';
import { withWeatherCapabilities } from './weather-capabilities.js';

const pressures = [1000,925,850,800,750,700,650,600,550,500,450,400,350,300,250,200];
const models = {gfs:'gfs_global',ecmwf:'ecmwf_ifs025',icon:'icon_global'};
const modelPressures = {gfs:pressures,ecmwf:[1000,925,850,700,600,500,400,300,250,200],icon:[1000,975,950,925,900,850,800,700,600,500,400,300,250,200,150,100,70,50,30]};
const cache = createMemoryCache({ ttlMs: 300000, maxEntries: 96 });
let limitedUntil = 0;
const fields = ['temperature','relative_humidity','cloud_cover','wind_speed','wind_direction','geopotential_height'];
export function needsExternalWeather(profile, timestampMs, heightM, terrainM) {
  if (!profile?.ok) return true;
  const frame = frameAtTimestamp(profile.frames,timestampMs);
  if (!frame) return true;
  const modelGround = profile.modelElevationM;
  const ground = Number.isFinite(modelGround) ? Math.max(terrainM ?? -Infinity,modelGround) : terrainM;
  const values = interpolateAtHeight(frame,heightM,ground);
  return !Number.isFinite(values.cloudPct) || !Number.isFinite(values.humidityPct)
    || !Number.isFinite(frame.surfaceVisibilityM) || !Number.isFinite(frame.precipSnowAmountMm);
}

// Separate profiles: no Windy field, zero value, model ground or native layer is overwritten.
export function parseExternalWeather(raw, model = 'gfs') {
  if (raw?.error || !Array.isArray(raw?.hourly?.time)) throw new Error(raw?.reason || 'Open-Meteo 未返回时次');
  if (!models[model]) throw new Error('不支持的 Open-Meteo 模式');
  const selectedPressures = modelPressures[model];
  const units = raw.hourly_units ?? {}, h = raw.hourly;
  const diagnostics = h.time.map(() => ({}));
  const val = (key,i,unit,min=-Infinity,max=Infinity) => {
    const value = h[key]?.[i];
    const reason = !Object.prototype.hasOwnProperty.call(h,key) ? 'not-provided'
      : !Array.isArray(h[key]) ? 'invalid-shape'
      : i >= h[key].length ? 'missing-time'
      : value === null || value === undefined ? 'empty-value'
      : units[key] !== unit ? 'unit-mismatch'
      : typeof value !== 'number' || !Number.isFinite(value) ? 'invalid-number'
      : value < min || value > max ? 'out-of-range' : null;
    // Repeated dew-point inputs count once; store reasons, never raw weather values.
    if (reason) diagnostics[i][key] = reason;
    return reason ? null : value;
  };
  const elevation = typeof raw.elevation === 'number' && Number.isFinite(raw.elevation) ? raw.elevation : null;
  const frames = h.time.map((t,i) => ({
    timestampMs: typeof t === 'number' ? t*1000 : NaN, sourceTimeIndex:i, fieldDiagnostics:diagnostics[i], cloudBaseM: null,
    timeAlignmentNotice: '', surfaceWeatherWarningCode: val('weather_code',i,'wmo code',0,99),
    lowCloudPct:val('cloud_cover_low',i,'%',0,100),mediumCloudPct:val('cloud_cover_mid',i,'%',0,100),highCloudPct:val('cloud_cover_high',i,'%',0,100),
    surfaceVisibilityM: val('visibility',i,'m',0), precipSnowAmountMm: val('snowfall_water_equivalent',i,'mm',0),
    precipAmountMm: val('precipitation',i,'mm',0), surfaceWindGustMs: val('wind_gusts_10m',i,'m/s',0),
    surfaceLevel: elevation === null ? null : {source:'model-surface',heightM:elevation,pressureHPa:null,
      temperatureC:val('temperature_2m',i,'°C'),relativeHumidityPct:val('relative_humidity_2m',i,'%',0,100),
      dewPointC:val('dew_point_2m',i,'°C'),windSpeedMs:val('wind_speed_10m',i,'m/s',0),
      windDirectionDeg:val('wind_direction_10m',i,'°',0,360),cloudPct:null},
    levels: selectedPressures.map((p,pressureLevelIndex) => ({source:'pressure-level',pressureHPa:p,pressureLevelIndex,
      heightM:val(`geopotential_height_${p}hPa`,i,'m'),temperatureC:val(`temperature_${p}hPa`,i,'°C'),dewPointC:externalDewPoint(val(`temperature_${p}hPa`,i,'°C'),val(`relative_humidity_${p}hPa`,i,'%',0,100)),
      relativeHumidityPct:val(`relative_humidity_${p}hPa`,i,'%',0,100),cloudPct:val(`cloud_cover_${p}hPa`,i,'%',0,100),
      windSpeedMs:val(`wind_speed_${p}hPa`,i,'m/s',0),windDirectionDeg:val(`wind_direction_${p}hPa`,i,'°',0,360)
    })).filter(l => l.heightM !== null && (elevation === null || l.heightM >= elevation)).sort((a,b) => a.heightM-b.heightM)
  })).filter(f => Number.isFinite(f.timestampMs)).sort((a,b) => a.timestampMs-b.timestampMs);
  return withWeatherCapabilities({ok:false,frames,timestampsMs:frames.map(f => f.timestampMs),modelElevationM:elevation,
    dataSource:'open-meteo',servedModel:model,requestedModel:model,servedModelSource:'request',
    error:frames.some(f=>f.levels.length) ? '' : 'Open-Meteo 未提供有效高度层',
    hasSurfaceData:elevation !== null,hasDirectCloud:frames.some(f=>f.levels.some(l=>l.cloudPct!==null)),
    referenceTime:null,updateTime:null,responseArrays:{},fieldDiagnostics:diagnostics,pressureLevels:selectedPressures,availableLevelNames:selectedPressures.map(p=>p+'h'),
    verticalDataNotice: (model === 'ecmwf' ? 'Open-Meteo ECMWF IFS 0.25°（气压层来源，非 Windy ECMWF）。' : model === 'icon' ? 'Open-Meteo ICON Global。' : 'Open-Meteo GFS Global。')
      + (model === 'gfs' ? '气压层模式云量。' : '气压层云量由 API 根据湿度推算，不是与湿度独立的证据。')
      + '位势高度作为高度轴；小时接口序列包含时间插值，不代表模式小时分辨率；起报时间未返回。逐层露点由温湿度估算。完整云底与逐层能见度未提供，地面值不代替高空。',
    gridLatitude:typeof raw.latitude === 'number' ? raw.latitude : null,gridLongitude:typeof raw.longitude === 'number' ? raw.longitude : null,
    hasVerticalLayers:false});
}

export async function loadExternalWeather(point, days, signal, model = 'gfs', bypassCache = false) {
  if (!models[model]) throw new Error('不支持的 Open-Meteo 模式');
  const selectedPressures = modelPressures[model];
  const requestedDays = Math.min(model === 'icon' ? 7 : 15,Math.max(1,days));
  const key = `external-v3:${model}:${point.lat}:${point.lon}:${requestedDays}`;
  if (signal?.aborted) throw new DOMException('已取消','AbortError');
  const old = bypassCache ? null : cache.get(key); if (old) return old;
  if (Date.now() < limitedUntil) throw new Error('Open-Meteo 限流，暂停新请求一分钟；保留已有数据');
  return withWindyRequestLimit(async requestSignal => {
    if (Date.now() < limitedUntil) throw new Error('Open-Meteo 限流，暂停新请求一分钟；保留已有数据');
    const controller = new AbortController();
    const abort = () => controller.abort(); requestSignal.addEventListener('abort',abort,{once:true});
    if (requestSignal.aborted) controller.abort();
    const timer = setTimeout(abort,20000);
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      const surface = ['temperature_2m','relative_humidity_2m','dew_point_2m','wind_speed_10m','wind_direction_10m','wind_gusts_10m','precipitation','snowfall_water_equivalent','visibility','weather_code','cloud_cover_low','cloud_cover_mid','cloud_cover_high'];
      for (const [k,v] of Object.entries({latitude:point.lat,longitude:point.lon,models:models[model],forecast_days:requestedDays,timezone:'UTC',timeformat:'unixtime',wind_speed_unit:'ms',elevation:'nan',hourly:[...surface,...selectedPressures.flatMap(p=>fields.map(f=>`${f}_${p}hPa`))].join(',')})) url.searchParams.set(k,String(v));
      const response = await fetch(url,{signal:controller.signal,credentials:'omit',cache:bypassCache ? 'no-store' : 'default'});
      if (response.status === 429) limitedUntil = Date.now()+60000;
      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
      const profile = parseExternalWeather(await response.json(),model);
      if (requestSignal.aborted) throw new DOMException('已取消','AbortError');
      if (profile.ok) cache.set(key,profile); return profile;
    } catch (error) {
      if (requestSignal.aborted) throw error;
      throw new Error(error?.name === 'AbortError' ? 'Open-Meteo 超过 20 秒未响应' : error?.message || 'Open-Meteo 连接失败（可能受网络、CORS 或 CSP 限制）');
    } finally {clearTimeout(timer);requestSignal.removeEventListener('abort',abort);}
  },key,signal);
}

export function externalValuesAt(profile,timestampMs,heightM,terrainM) {
  const ground = Number.isFinite(profile?.modelElevationM) ? Math.max(terrainM ?? -Infinity,profile.modelElevationM) : terrainM;
  const exact = frameAtTimestamp(profile?.frames,timestampMs);
  if (exact) return {values:interpolateAtHeight(exact,heightM,ground),frame:exact,times:[timestampMs]};
  const before = profile?.frames?.filter(f=>f.timestampMs < timestampMs).at(-1);
  const after = profile?.frames?.find(f=>f.timestampMs > timestampMs);
  if (!before || !after || after.timestampMs-before.timestampMs > 10800000) return {values:{},frame:null,times:[]};
  const a=interpolateAtHeight(before,heightM,ground), b=interpolateAtHeight(after,heightM,ground);
  const max = key => Number.isFinite(a[key]) && Number.isFinite(b[key]) ? Math.max(a[key],b[key]) : null;
  return {values:{cloudPct:max('cloudPct'),humidityPct:max('humidityPct')},frame:null,times:[before.timestampMs,after.timestampMs]};
}

function externalDewPoint(temperatureC,humidityPct) {
 if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPct) || humidityPct <= 0) return null;
 const a=17.625,b=243.04,g=Math.log(humidityPct/100)+a*temperatureC/(b+temperatureC);
 return b*g/(a-g);
}
