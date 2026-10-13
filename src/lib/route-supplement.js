import { mapWithConcurrency } from './async.js';
import { nearestForecastTimestamp } from './profile.js';
import { loadExternalWeather, needsExternalWeather } from './external-weather.js';

// A separate phase: no main-source weather or terrain is held while GFS loads.
export async function runRouteSupplements(samples, {days,timestampMs,heightForSample,signal,onSample,onProgress,bypassCache=false}) {
  const pending = samples.filter((sample,index) => needsExternalWeather(sample.profile,
    timestampMs ?? nearestForecastTimestamp(sample.profile?.timestampsMs,Date.now()),heightForSample(index),sample.terrainElevationM));
  let completed = 0;
  onProgress(0,pending.length);
  pending.forEach(sample => onSample(sample.key,{supplementStatus:'loading',supplementError:''}));
  await mapWithConcurrency(pending,3,async sample => {
    if (signal.aborted) return;
    try {
      const supplement = await loadExternalWeather(sample,days,signal,'gfs',bypassCache);
      if (!signal.aborted) onSample(sample.key,{supplement,supplementStatus:supplement.ok ? 'complete' : 'error',supplementError:supplement.ok ? '' : supplement.error});
    } catch (error) {
      if (!signal.aborted) onSample(sample.key,{supplementStatus:'error',supplementError:error?.message || '补查失败'});
    } finally {if (!signal.aborted) onProgress(++completed,pending.length);}
  },()=>signal.aborted);
}
