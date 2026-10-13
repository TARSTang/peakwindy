<script>
  import { createEventDispatcher } from 'svelte';
  export let running = false;
  export let completed = 0;
  export let total = 0;
  export let notice = '';
  export let available = false;
  const dispatch = createEventDispatcher();
</script>
<div class="supplement-progress">
  <p role="status">{running ? `GFS 独立补查 ${completed}/${total}，主结果可先查看。` : notice || 'GFS 在主天气与地形完成后独立补查。'}</p>
  {#if running}<button on:click={()=>dispatch('cancel')}>取消补查</button>
  {:else if available}<button on:click={()=>dispatch('retry')}>补查／重试 GFS</button>{/if}
</div>
<style>
  .supplement-progress {border:1px solid #71809a;border-radius:6px;padding:10px 12px;margin:12px 0;line-height:1.5;}
  p {margin:0 0 8px;color:inherit;} button {min-height:44px;padding:8px 12px;border:1px solid #71809a;border-radius:5px;background:#e8f1ef;color:#214d58;font-weight:700;cursor:pointer;}
  button:focus-visible {outline:3px solid #31d4e5;outline-offset:2px;}
</style>
