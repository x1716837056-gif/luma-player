import {CircleHelp,RefreshCw} from 'lucide-react';
export const unmatchedTabs=[['all','全部'],['pending','待识别'],['review','待确认'],['not-found','未找到'],['failed','请求失败']] as const;
export function UnmatchedFilters({value,counts,busy,onChange,onRetry}:{value:string;counts:Record<string,number>;busy:boolean;onChange:(value:string)=>void;onRetry:()=>void}){
  return <section className="unmatched-tools" aria-label="待整理影片"><div className="unmatched-explanation"><CircleHelp size={20}/><div><strong>未匹配影片集中在这里</strong><p>可以直接播放、手动匹配，或重新尝试自动识别。匹配成功后会自动归入电影或电视剧，观影记录保持不变。</p></div><button className="button-glass" disabled={busy||!counts.all} onClick={onRetry}><RefreshCw size={14} className={busy?'spinning':''}/>重新识别全部未匹配</button></div><nav className="unmatched-tabs" aria-label="识别状态">{unmatchedTabs.map(([id,label])=><button key={id} className={value===id?'selected':''} onClick={()=>onChange(id)}>{label}<span>{counts[id]||0}</span></button>)}</nav></section>;
}
