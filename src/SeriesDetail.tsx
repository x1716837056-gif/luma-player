import {ArrowLeft,Check,ChevronRight,Film,Play,Tv} from 'lucide-react';
import {episodeIdentity,preferredVersion,resumeEpisode,type SeriesGroup} from '../shared/series.mjs';
import type {Media} from './types';
import {useLayoutEffect,useRef} from 'react';
export const seasonName=(number:number|null)=>number===null?'季数未识别':number===0?'特别篇':`第 ${number} 季`;
export function SeriesDetail({series,season,onSeason,onPlay,onDetails}:{series:SeriesGroup;season:number|null|undefined;onSeason:(season:number|null|undefined)=>void;onPlay:(media:Media)=>void;onDetails:(media:Media)=>void}){
  const media=series.representative,resume=resumeEpisode(series),active=series.seasons.find(s=>s.number===season),image=media.backdrop||media.poster;
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{if(root.current&&!root.current.contains(document.activeElement))root.current.querySelector<HTMLButtonElement>('.series-breadcrumb button')?.focus();},[season]);
  return <div className="series-detail" ref={root}>
    <header className="series-header">{image&&<img className="series-backdrop" src={window.__LUMA_ASSETS?.[image]||image} alt=""/>}<div className="series-vignette"/>
      <div className="series-intro"><span className="series-eyebrow"><Tv size={14}/>电视剧</span><h1>{series.title}</h1><p className="series-original">{series.originalTitle!==series.title?series.originalTitle:''}</p>
        <div className="series-facts"><span>{series.year||'年份未识别'}</span><span>{series.seasons.length} 季 · {series.episodeCount} 集已入库</span>{media.genre.length>0&&<span>{media.genre.join(' / ')}</span>}</div>
        <p className="series-description">{media.seriesDescription||(media.metadataOrigin?media.description:'')||'还没有剧集简介，可以在剧集资料中匹配或补充。'}</p>
        <div className="series-actions">{resume&&<button className="button-primary" onClick={()=>onPlay(resume)}><Play size={15} fill="currentColor"/>{resume.progress&&resume.progress<.96?'继续播放':resume.watched||(resume.progress||0)>=.96?'重新观看':'开始观看'}<small>{seasonName(episodeIdentity(resume)?.season??null)} · 第 {episodeIdentity(resume)?.number??'—'} 集</small></button>}<button className="button-glass" onClick={()=>onDetails(media)}>剧集资料<ChevronRight size={14}/></button></div>
      </div>
    </header>
    <section className="series-browser" aria-label="剧集季集浏览">
      <div className="series-breadcrumb"><button onClick={()=>onSeason(undefined)} aria-current={season===undefined?'page':undefined}>{season===undefined?<Tv size={16}/>:<ArrowLeft size={16}/>}全部季</button>{season!==undefined&&<><ChevronRight size={13}/><span>{seasonName(season)}</span></>}</div>
      {season===undefined?<div className="series-seasons">{series.seasons.map(s=>{
        const watched=s.episodes.filter(e=>e.media.some(m=>m.watched||(m.progress||0)>=.96)).length;
        return <button className="season-card" key={s.number??'unknown'} aria-label={`查看${seasonName(s.number)}`} onClick={()=>onSeason(s.number)}><span className="season-number">{s.number===null?'?':s.number===0?'SP':String(s.number).padStart(2,'0')}</span><strong>{seasonName(s.number)}</strong><small>{s.episodes.length} 集已入库{watched?` · 已看 ${watched} 集`:''}</small><ChevronRight size={18}/></button>;
      })}</div>:<>
        <div className="season-switch"><label htmlFor="series-season">选择季</label><select id="series-season" value={season===null?'unknown':season} onChange={e=>onSeason(e.target.value==='unknown'?null:Number(e.target.value))}>{series.seasons.map(s=><option key={s.number??'unknown'} value={s.number??'unknown'}>{seasonName(s.number)}</option>)}</select><span>{active?.episodes.length||0} 集</span></div>
        <div className="episode-list">{active?.episodes.map(episode=>{
          const file=preferredVersion(episode),watched=episode.media.some(m=>m.watched||(m.progress||0)>=.96),progress=watched?1:Math.max(...episode.media.map(m=>m.progress||0));
          const unavailable=episode.media.every(m=>m.missing),title=file.episodeTitle||`第 ${episode.number??'未识别'} 集`;
          return <article className={`episode-row ${unavailable?'is-missing':''}`} key={episode.id} data-media-id={file.id}>
            <span className="episode-number">{episode.number===null?'—':String(episode.number).padStart(2,'0')}</span><div className="episode-copy"><strong>{title}{watched&&<Check size={13} aria-label="已看"/>}</strong><span>{unavailable?'片源离线 · 已保留进度':`${Math.round(file.duration)||'—'} 分钟 · ${file.quality}${episode.media.length>1?` · ${episode.media.length} 个版本`:''}`}</span>{file.episodeDescription&&<p className="episode-description">{file.episodeDescription}</p>}{Boolean(progress)&&<div className="episode-progress"><i style={{width:`${progress*100}%`}}/></div>}</div>
            {episode.media.length>1?<select aria-label={`第 ${episode.number} 集片源`} defaultValue={file.id} onChange={e=>{const chosen=episode.media.find(m=>m.id===e.target.value);if(chosen)onPlay(chosen);}}>{episode.media.map(m=><option key={m.id} value={m.id}>{m.missing?'离线 · ':''}{m.quality} · {m.path?.split(/[\\/]/).at(-1)}</option>)}</select>:null}
            <button className="episode-info" aria-label={`第 ${episode.number??'未识别'} 集信息`} onClick={()=>onDetails(file)}><Film size={17}/></button><button className="episode-play" disabled={unavailable} aria-label={`播放第 ${episode.number??'未识别'} 集`} onClick={()=>onPlay(file)}><Play size={18} fill="currentColor"/></button>
          </article>;
        })}</div>
      </>}
    </section>
  </div>;
}
