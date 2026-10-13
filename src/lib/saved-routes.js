import { isValidCoordinate } from './route.js';

export const savedRoutesKey='high-altitude-profile:saved-routes:v1';
export const savedRoutesEvent='high-altitude-profile:saved-routes-changed';
const type='windy-high-altitude-routes';
const maxRoutes=50,maxPoints=100;
const id=()=>globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const text=(value,limit)=>typeof value==='string' ? value.replace(/\s+/gu,' ').trim().slice(0,limit) : '';
const fingerprint=route=>JSON.stringify({name:route.name,points:route.points,settings:route.settings});
function number(value,min,max,label,optional=false) {
  if(optional && value == null) return null;
  if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max) throw new Error(`${label}须为 ${min}～${max} 的数值`);
  return value;
}
export function cleanSavedRoute(value) {
  if(!value || !Array.isArray(value.points) || value.points.length<2 || value.points.length>maxPoints) throw new Error('每条路线需要 2～100 个点');
  const points=value.points.map((point,index)=>{
    if(!isValidCoordinate(point)) throw new Error(`路线第 ${index+1} 点经纬度无效，必须是 WGS-84 数值`);
    const elevationM=number(point.elevationM,-500,10000,`第 ${index+1} 点校正海拔`,true);
    return {name:text(point.name,32) || (index===0 ? '起点' : index===value.points.length-1 ? '终点' : `转折点 ${index}`),nameSource:point.nameSource==='automatic' ? 'automatic' : 'custom',lat:point.lat,lon:point.lon,...(elevationM===null ? {} : {elevationM})};
  });
  const s=value.settings ?? {};
  if(typeof s!=='object' || Array.isArray(s)) throw new Error('路线设置必须是对象');
  const provider=s.provider ?? 'windy',model=s.model ?? 'ecmwf',samplingMode=s.samplingMode ?? 'spacing';
  if(!['windy','open-meteo'].includes(provider) || !['ecmwf','icon'].includes(model) || !['spacing','count'].includes(samplingMode)) throw new Error('路线天气来源、模式或采样设置无效');
  const spacingM=s.spacingM ?? 5000,count=s.count ?? 5;
  if(![2000,5000,10000].includes(spacingM) || !Number.isInteger(count) || count<2 || count>61) throw new Error('路线天气采样间距或点数无效');
  return {id:text(value.id,128) || id(),name:text(value.name,64) || `${points[0].name} → ${points.at(-1).name}`,points,
    settings:{provider,model,samplingMode,spacingM,count,
      startElevationM:number(s.startElevationM,-500,10000,'机位校正海拔',true),targetElevationM:number(s.targetElevationM,-500,10000,'目标校正海拔',true),
      eyeHeightM:number(s.eyeHeightM ?? 1.6,0,100,'视点离地高度'),queryHeightM:number(s.queryHeightM ?? 5000,0,20000,'查询海拔'),
      sightlineEnabled:s.sightlineEnabled===true}};
}
export function readSavedRoutes() {
  try {
    const raw=localStorage.getItem(savedRoutesKey);
    if(!raw) return {ok:true,routes:[]};
    const value=JSON.parse(raw);
    if(!Array.isArray(value) || value.length>maxRoutes) throw new Error('本地路线格式无效');
    const routes=value.map(cleanSavedRoute);
    if(new Set(routes.map(route=>route.id)).size!==routes.length) throw new Error('本地路线标识重复');
    return {ok:true,routes};
  } catch(error) {return {ok:false,routes:[],reason:error?.message || '浏览器本地存储不可用'};}
}
function persist(routes) {
  if(routes.length>maxRoutes) throw new Error('最多保存 50 条路线，请先导出备份并删除不需要的路线');
  const cleaned=routes.map(cleanSavedRoute);
  localStorage.setItem(savedRoutesKey,JSON.stringify(cleaned));
  if(typeof window!=='undefined') window.dispatchEvent(new Event(savedRoutesEvent));
  return cleaned;
}
function current() {const result=readSavedRoutes();if(!result.ok)throw new Error(result.reason);return result.routes;}
export function saveNewRoute(candidate) {
  const route=cleanSavedRoute({...candidate,id:id()});
  const existing=current(),same=existing.find(item=>fingerprint(item)===fingerprint(route));
  if(same) return {route:same,routes:existing,duplicate:true};
  return {route,routes:persist([...existing,route]),duplicate:false};
}
export function deleteSavedRoute(routeId) {
  const routes=current(),route=routes.find(item=>item.id===routeId);
  if(!route) throw new Error('这条路线已被其他窗口删除，请刷新列表');
  return {route,routes:persist(routes.filter(item=>item.id!==routeId))};
}
export function restoreSavedRoute(route) {
  const routes=current();
  if(routes.some(item=>item.id===route.id)) return routes;
  return persist([...routes,route]);
}
export function encodeRoutes(routes) {
  return JSON.stringify({type,version:1,coordinateSystem:'WGS-84',routes:routes.map(cleanSavedRoute)},null,2);
}
export function importSavedRoutes(raw) {
  if(typeof raw!=='string' || new TextEncoder().encode(raw).byteLength>2*1024*1024) throw new Error('路线文件超过 2 MB 或不是文本');
  const value=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(value?.type!==type || value.version!==1 || value.coordinateSystem!=='WGS-84') throw new Error('请导入本插件导出的 WGS-84 路线文件；不自动猜测或转换其他坐标系');
  if(!Array.isArray(value.routes) || !value.routes.length || value.routes.length>maxRoutes) throw new Error('文件需要包含 1～50 条路线');
  // Validate every entry before any write, and never overwrite existing user routes.
  const incoming=value.routes.map(cleanSavedRoute),routes=current();
  const keys=new Set(routes.map(fingerprint));let added=0;
  for(const route of incoming) if(!keys.has(fingerprint(route))) {keys.add(fingerprint(route));routes.push({...route,id:id()});added++;}
  return {routes:persist(routes),added,duplicates:incoming.length-added};
}
