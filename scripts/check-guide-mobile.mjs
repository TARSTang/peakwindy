// Local component fixture only; no Windy account, map or weather requests.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { rollup } from 'rollup';
import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
const playwright = await import(process.env.BROWSER_TEST_MODULE ? pathToFileURL(process.env.BROWSER_TEST_MODULE).href : 'playwright');
const recordOnly = process.argv.includes('--record-only');
const root = new URL('../',import.meta.url), out = new URL('dist/mobile-guide-check/',root);
await mkdir(out,{recursive:true});
const source = await readFile(new URL('src/plugin.svelte',root),'utf8');
const title = source.match(/<div class="title-row">[\s\S]*?<\/button><\/div>/)?.[0];
if (!title) throw new Error('Cannot locate the actual plugin title markup');
const css = source.match(/<style>([\s\S]*)<\/style>/)?.[1];
const fixture = `<script>import UserGuide from '../../src/UserGuide.svelte';let guideOpen=false,guideTrigger=null;const config={version:'local'};function closePlugin(){}</script><div class="plugin-shell"><section class="plugin__content">${title}<input aria-label="保留草稿" value="原路线"/></section></div>{#if guideOpen}<UserGuide version={config.version} trigger={guideTrigger} on:close={()=>guideOpen=false}/>{/if}<style>${css}</style>`;
await writeFile(new URL('Fixture.svelte',out),fixture);
await writeFile(new URL('entry.js',out),`import Fixture from './Fixture.svelte';new Fixture({target:document.getElementById('app')});`);
const bundle = await rollup({input:new URL('entry.js',out).pathname.replace(/^\/([A-Z]:)/,'$1'),plugins:[svelte({emitCss:false}),resolve({browser:true,dedupe:['svelte']})],onwarn:(warning,handler)=>{if(warning.code!=='css-unused-selector') handler(warning);}});
await bundle.write({file:new URL('bundle.js',out).pathname.replace(/^\/([A-Z]:)/,'$1'),format:'iife'});await bundle.close();
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#app{max-width:430px;transform:translateZ(0);overflow:hidden;height:100vh}.plugin__content{padding:20px}.plugin__title{margin:0}.plugin__title--chevron-back:before{content:'‹';margin-right:8px}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`;
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?await readFile(new URL('bundle.js',out)):html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results=[];
try{
  browser=await playwright.chromium.launch({headless:true,...(process.env.BROWSER_TEST_EXECUTABLE?{executablePath:process.env.BROWSER_TEST_EXECUTABLE}:{})});
  for(const [width,height,largeText] of [[320,568,false],[375,667,false],[390,844,false],[430,932,false],[844,390,false],[568,320,false],[320,568,true]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin);
    const titlePass=await page.evaluate(()=>{const row=document.querySelector('.title-row'),buttons=[...row.querySelectorAll('button')].map(e=>e.getBoundingClientRect());return row.scrollWidth<=row.clientWidth+1&&buttons.every(r=>r.height>=44&&r.x>=0&&r.right<=innerWidth)&&buttons[0].right<=buttons[1].left;});
    await page.getByRole('button',{name:'使用说明',exact:true}).click();
    if(largeText) await page.addStyleTag({content:'.guide{font-size:24px!important} .guide button{font-size:20px!important} .guide header span{font-size:20px!important}'});
    const measurements=await page.evaluate(()=>{const d=document.querySelector('.guide'),m=d.querySelector('main'),nav=d.querySelector('nav');const r=m.getBoundingClientRect();return{bodyOverflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:d.scrollWidth>d.clientWidth,mainHeight:r.height,mainBottom:r.bottom,viewportHeight:innerHeight,tableOverflow:[...d.querySelectorAll('.table-wrap')].some(e=>e.scrollWidth>e.clientWidth+1),navHeight:nav.getBoundingClientRect().height};});
    await page.screenshot({path:new URL(`${recordOnly?'before':'after'}-${width}x${height}${largeText?'-large-text':''}-start.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:false});
    const toggle=page.getByRole('button',{name:/展开目录/});if(await toggle.isVisible())await toggle.click();
    await page.getByRole('button',{name:'12. 缺测诊断与常见问题',exact:true}).click();
    const heading=page.getByRole('heading',{name:'12. 缺测诊断与常见问题',exact:true});const box=await heading.boundingBox();
    const mainBox=await page.locator('.guide main').boundingBox();
    const jumped=box.y>=mainBox.y-2 && box.y<mainBox.y+mainBox.height;
    await page.screenshot({path:new URL(`${recordOnly?'before':'after'}-${width}x${height}${largeText?'-large-text':''}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:false});
    await page.getByRole('button',{name:'返回插件',exact:true}).first().click();
    const restored=await page.getByRole('textbox',{name:'保留草稿'}).inputValue()==='原路线';
    const focusReturned=await page.getByRole('button',{name:'使用说明',exact:true}).evaluate(e=>e===document.activeElement);
    await page.getByRole('button',{name:'使用说明',exact:true}).click();
    await page.keyboard.press('Shift+Tab');const keyboardTrap=await page.locator('.guide').evaluate(e=>e.contains(document.activeElement));
    await page.keyboard.press('Escape');
    const closed=await page.getByRole('dialog').count()===0;
    const pass=titlePass&&!measurements.bodyOverflow&&!measurements.dialogOverflow&&!measurements.tableOverflow&&measurements.mainHeight>=180&&measurements.mainBottom<=height+1&&jumped&&restored&&closed&&focusReturned&&keyboardTrap&&!errors.length;
    results.push({width,height,largeText,...measurements,titlePass,jumped,restored,closed,focusReturned,keyboardTrap,errors,pass});await page.close();
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
await writeFile(new URL(`${recordOnly?'before':'after'}-results.json`,out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
if(!recordOnly&&results.some(result=>!result.pass))process.exitCode=1;
