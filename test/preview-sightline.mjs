// Local UI acceptance fixture. Synthetic data, never a live Windy forecast.
// Run with node test/preview-sightline.mjs, then open http://127.0.0.1:10002/.
import { rollup } from 'rollup';
import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import swc from 'rollup-plugin-swc3';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';

const buildOnly = process.argv.includes('--build-only');

const entry = `
import Sightline from './src/SightlineAnalysis.svelte';
document.body.innerHTML = '<header><strong>两点视线 UI 验收 · 合成数据</strong><label>场景 <select id="scenario"><option value="clear">未见明显遮挡</option><option value="ridge">山脊遮挡</option><option value="cloud">视线穿云</option><option value="missing">天气缺测</option><option value="slow">慢速请求与取消</option></select></label><button id="model">切换 ECMWF / ICON</button><button id="coordinate">切换目标坐标</button><output id="map">地图事件：未分析</output></header><main></main>';
let scenario = 'clear', model = 'ecmwf', longitude = 102.2;
const ts = Date.UTC(2026,9,12,0);
const app = new Sightline({target:document.querySelector('main'),props:{
 start:{lat:30,lon:102,name:'观景点',elevationM:2000},end:{lat:30,lon:longitude,name:'雪山',elevationM:6000},timestampMs:ts,
 fetchElevation: async point => {
   if(scenario==='slow') await new Promise(resolve=>setTimeout(resolve,100));
   const fraction=(point.lon-102)/(longitude-102);
   return scenario==='ridge' && fraction>.4 && fraction<.6 ? 5200 : 1000;
 },
 fetchProfile: async (point,requestedModel) => {
   if(scenario==='slow') await new Promise(resolve=>setTimeout(resolve,100));
   if(scenario==='missing') return {ok:false,error:'合成缺测场景'};
   return {ok:true,modelElevationM:1000,servedModel:requestedModel,servedModelSource:'response',
     timestampsMs:[ts,ts+10800000],frames:[ts,ts+10800000].map(timestampMs=>({timestampMs,
       levels:Array.from({length:10},(_,index)=>({heightM:index*1000,pressureLevelIndex:index,temperatureC:15-index*5,
         relativeHumidityPct:scenario==='cloud' && index>=3 && index<=5 ? 95 : 50,
         cloudPct:scenario==='cloud' && index>=3 && index<=5 ? 80 : 0,windSpeedMs:3,windDirectionDeg:90}))}))};
 }
}});
app.$on('altitude',event=>app.$set({queryAltitudeM:event.detail}));
app.$on('time',event=>app.$set({timestampMs:event.detail}));
app.$on('mapEvidence',event=>document.querySelector('#map').textContent=event.detail ? '地图事件：'+event.detail.blockers.length+' 个山脊 / '+event.detail.clouds.length+' 个云信号' : '地图事件：未分析');
document.querySelector('#scenario').onchange=event=>{scenario=event.target.value;};
document.querySelector('#model').onclick=()=>{model=model==='ecmwf'?'icon':'ecmwf';app.$set({model});};
document.querySelector('#coordinate').onclick=()=>{longitude=longitude===102.2?102.3:102.2;app.$set({end:{lat:30,lon:longitude,name:'雪山',elevationM:6000}});};
`;
const bundle = await rollup({input:'sightline-preview',plugins:[
  {name:'fixture',resolveId(id){if(id==='sightline-preview')return id;},load(id){if(id==='sightline-preview')return entry;}},
  svelte({emitCss:false}),swc({include:['**/*.ts']}),resolve({browser:true,extensions:['.mjs','.js','.json','.ts'],dedupe:['svelte']})
]});
await mkdir('dist/sightline-preview',{recursive:true});
await bundle.write({file:'dist/sightline-preview/app.js',format:'iife'});
await bundle.close();
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>两点视线本地验收</title><style>body{margin:0;font:15px system-ui;background:#eaf0ef}header{padding:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}button,select{min-height:44px}main{max-width:430px;margin:auto}label{display:flex;gap:8px}</style><script defer src="/app.js"></script></html>';
if (!buildOnly) createServer(async(req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile('dist/sightline-preview/app.js'));}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
}).listen(10002,'127.0.0.1',()=>process.stdout.write('Synthetic UI fixture: http://127.0.0.1:10002/\n'));
