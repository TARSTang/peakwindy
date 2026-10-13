<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { guideSections } from './lib/user-guide.js';
  export let version;
  export let trigger = null;
  const dispatch = createEventDispatcher();
  let dialog, closeButton, scrollArea;
  let contentsOpen = false;
  async function jump(id) {
    contentsOpen = false;
    await tick();
    const heading = dialog?.querySelector(`#guide-${id}`);
    heading?.scrollIntoView({behavior:'auto',block:'start'});
    heading?.focus({preventScroll:true});
  }
  function keydown(event) {
    if (!dialog) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();dispatch('close');return;}
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) {event.preventDefault();return;}
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {event.preventDefault();first.focus();}
  }
  onMount(()=>{
    // Escape the Windy pane's clipping/transform and cover the whole viewport.
    document.body.appendChild(dialog);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown',keydown,true);
    closeButton?.focus();
    return ()=>{window.removeEventListener('keydown',keydown,true);document.body.style.overflow=previousOverflow;dialog?.remove();trigger?.focus({preventScroll:true});};
  });
</script>

<div class="guide" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="guide-title">
  <header><div><span>高海拔天气剖面 · 版本 {version}</span><h1 id="guide-title">使用说明</h1></div><button class="return" bind:this={closeButton} on:click={()=>dispatch('close')}>返回插件</button></header>
  <div class="mobile-contents"><span>操作指南 · {guideSections.length} 个章节</span><button aria-expanded={contentsOpen} aria-controls="guide-contents" on:click={()=>contentsOpen=!contentsOpen}>{contentsOpen ? '收起目录' : '展开目录'}</button></div>
  <div class="layout">
    <nav id="guide-contents" class:contents-open={contentsOpen} aria-label="使用说明目录"><strong>目录</strong>{#each guideSections as section}<button on:click={()=>jump(section.id)}>{section.title}</button>{/each}</nav>
    <main bind:this={scrollArea}>
      <div class="intro"><p>先选机位与目标，沿途看天气，再检查视线。这里说明每一步怎么操作，以及哪些结论仍然未知。</p><p>说明适配当前版本；打开此页不会发起天气请求，关闭后返回原有路线。</p></div>
      {#each guideSections as section}
        <section aria-labelledby={`guide-${section.id}`}><h2 id={`guide-${section.id}`} tabindex="-1">{section.title}</h2>
          {#each section.blocks as block}
            {#if block.type === 'steps'}<ol>{#each block.items as item}<li>{item}</li>{/each}</ol>
            {:else if block.type === 'items'}<ul>{#each block.items as item}<li>{item}</li>{/each}</ul>
            {:else if block.type === 'table'}
              <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
              <!-- The named scroll region must be keyboard reachable on narrow screens. -->
              <div class="table-wrap" tabindex="0" role="region" aria-label={`${section.title}对照表`}><table><thead><tr>{#each block.headers as text}<th scope="col">{text}</th>{/each}</tr></thead><tbody>{#each block.rows as row}<tr>{#each row as text,index}<td data-label={block.headers[index]}>{text}</td>{/each}</tr>{/each}</tbody></table></div>
            {:else if block.type === 'note'}<aside>{block.text}</aside>
            {:else}<p>{block.text}</p>{/if}
          {/each}
        </section>
      {/each}
      <footer><p>当前版本 {version} · 内容随插件维护更新</p><button on:click={()=>{scrollArea?.scrollTo({top:0,behavior:'auto'});closeButton?.focus({preventScroll:true});}}>回到顶部</button><button on:click={()=>dispatch('close')}>返回插件</button></footer>
    </main>
  </div>
</div>

<style>
  .guide{position:fixed;inset:0;z-index:2147483500;height:100vh;height:100dvh;width:100%;display:flex;flex-direction:column;background:#fff;color:#182e36;color-scheme:light;font:16px/1.75 "Segoe UI","Microsoft YaHei",sans-serif;box-sizing:border-box;overflow:hidden;text-align:left;}
  .guide :global(*){box-sizing:border-box;}
  header{display:flex;flex:none;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #ccd9db;padding:16px max(20px,env(safe-area-inset-right)) 16px max(20px,env(safe-area-inset-left));padding-top:max(16px,env(safe-area-inset-top));background:#f4f8f7;}
  header>div{min-width:0;}header span{font-size:13px;color:#50636b;overflow-wrap:anywhere;}h1{margin:0;font-size:25px;line-height:1.4;font-weight:750;}
  button{min-height:44px;border:1px solid #bcced0;border-radius:6px;background:#fff;color:#244f5b;padding:9px 14px;font:inherit;line-height:1.45;cursor:pointer;text-align:left;}
  button:hover{background:#edf5f3;}button:focus-visible,.table-wrap:focus-visible,h2:focus-visible{outline:3px solid #007b8b;outline-offset:2px;}
  .return{flex:none;font-weight:700;} .layout{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0;flex:1;}
  nav{overflow-y:auto;overscroll-behavior:contain;background:#f4f8f7;border-right:1px solid #ccd9db;padding:20px 16px;display:flex;flex-direction:column;gap:7px;}
  nav strong{font-size:14px;color:#50636b;margin-bottom:5px;}nav button{font-size:14px;}
  main{overflow:auto;overscroll-behavior:contain;padding:24px max(clamp(20px,4vw,64px),env(safe-area-inset-right)) max(32px,env(safe-area-inset-bottom)) max(clamp(20px,4vw,64px),env(safe-area-inset-left));min-width:0;min-height:0;overflow-wrap:anywhere;}
  .mobile-contents{display:none;}
  main>*{max-width:880px;margin-left:auto;margin-right:auto;}.intro{border-left:4px solid #247985;padding:4px 20px;background:#f1f7f6;margin-bottom:32px;}
  section{border-top:1px solid #d6e1e2;padding:28px 0;}h2{margin:0 0 18px;font-size:22px;line-height:1.5;scroll-margin-top:12px;color:#1e5664;}p{margin:12px 0;}ul,ol{padding-left:26px;margin:16px 0;}li{margin:10px 0;padding-left:3px;}
  aside{border-left:4px solid #b87d21;background:#fff7e7;padding:14px 18px;margin:18px 0;}.table-wrap{overflow:auto;margin:20px 0;}table{width:100%;border-collapse:collapse;font:inherit;line-height:1.6;font-size:15px;}th,td{border:1px solid #d0dddf;padding:12px;text-align:left;vertical-align:top;min-width:130px;}th{background:#eaf3f1;}footer{border-top:1px solid #ccd9db;padding-top:20px;}footer button{margin-right:10px;}footer p{font-size:14px;color:#50636b;}
  @media(max-width:760px),(max-height:500px){
    header{padding:10px max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left));padding-top:max(10px,env(safe-area-inset-top));}h1{font-size:22px;}
    .mobile-contents{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;padding:6px max(16px,env(safe-area-inset-right)) 6px max(16px,env(safe-area-inset-left));border-bottom:1px solid #ccd9db;}.mobile-contents span{font-size:13px;min-width:0;}
    .layout{display:flex;flex-direction:column;}nav{display:none;flex:none;max-height:min(180px,30dvh);border-right:0;border-bottom:1px solid #ccd9db;padding:10px max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left));gap:8px;}
    nav.contents-open{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));}nav strong{grid-column:1/-1;margin:0;}nav button{font-size:14px;min-width:0;padding:8px;}
    main{flex:1;padding:18px max(18px,env(safe-area-inset-right)) max(32px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));}h2{font-size:20px;}section{padding:24px 0;}
  }
  @media(max-width:600px){table,tbody,tr,td{display:block;min-width:0;width:100%;}thead{display:none;}tr{margin:12px 0;border:1px solid #ccd9db;border-radius:6px;padding:10px;background:#f5f9f8;}td{border:0;padding:6px;font-size:16px;}td::before{content:attr(data-label) '：';display:block;font-weight:700;color:#244f5b;margin-bottom:3px;}}
</style>
