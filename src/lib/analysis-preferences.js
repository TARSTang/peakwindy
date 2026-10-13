const key = 'high-altitude-profile:weather-preferences:v1';
export function readWeatherPreferences() {
  try {
    const raw = localStorage.getItem(key); if(!raw) return null;
    const value = JSON.parse(raw);
    return {provider:value.provider === 'open-meteo' ? 'open-meteo' : 'windy',model:value.model === 'icon' ? 'icon' : 'ecmwf',
      supplement:value.supplement !== false,step:value.step === 3 ? 3 : 1};
  } catch { return null; }
}
export function saveWeatherPreferences(value) {
  try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Storage unavailable: current controls still work. */ }
}
