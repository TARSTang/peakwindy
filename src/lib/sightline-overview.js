import { buildCloudSightline } from './cloud-sightline.js';

// Same classification as the current-time panel, without chart paths or network requests.
export async function buildSightlineOverview({points,samples,timestamps,startText,targetText,eyeHeightM,isCancelled,onProgress}) {
  const rows=[];
  for(let index=0;index<timestamps.length;index++) {
    if(isCancelled()) return null;
    const timestampMs=timestamps[index];
    const result=buildCloudSightline(points,samples,timestampMs,startText,targetText,eyeHeightM,{maxHeightM:9000},true);
    if(!result.ok) return {rows:[],reason:result.reason};
    const unknownCount=result.marks.filter(mark=>!mark.cloudKnown || !mark.humidityKnown || mark.position.relation==='unknown').length;
    const completeCount=result.marks.length-unknownCount;
    rows.push({timestampMs,cloudCount:result.cloudCount,humidCount:result.humidCount,unknownCount,completeCount,totalCount:result.marks.length,
      cloudValidCount:result.cloudValidCount,humidityValidCount:result.humidityValidCount,
      label:result.cloudCount ? '云层相交信号' : result.humidCount ? '高湿可能云区' : unknownCount ? '资料不足' : '已采样位置未发现相交信号'});
    if(index%8===7 || index===timestamps.length-1) {
      onProgress(index+1,timestamps.length);
      // Let user input and cancellation run between batches on mobile browsers too.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return isCancelled() ? null : {rows,reason:''};
}

export function beijingDate(timestampMs) {
  return new Date(timestampMs+8*3600000).toISOString().slice(0,10);
}
