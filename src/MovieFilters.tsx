import {CalendarDays, ChevronDown, Clapperboard, RotateCcw, Users} from 'lucide-react';
import {ageGroup,ageGroups,genreGroups,matchesGenre,type CatalogFilters} from '../shared/catalog.mjs';
import type {Media} from './types';
export const emptyCatalogFilters:CatalogFilters={genre:'all',age:'all',year:'all'};
export function MovieFilters({media,value,onChange}:{media:Media[];value:CatalogFilters;onChange:(next:CatalogFilters)=>void}) {
  const years=[...new Set(media.map(m=>m.year).filter(y=>y>0))].sort((a,b)=>b-a);
  const decades=[...new Set(years.filter(y=>y>=1980).map(y=>Math.floor(y/10)*10))].sort((a,b)=>b-a);
  const active=value.genre!=='all'||value.age!=='all'||value.year!=='all';
  const countGenre=(id:string)=>media.filter(m=>matchesGenre(m,id)).length;
  const countAge=(id:string)=>media.filter(m=>ageGroup(m)===id).length;
  return <section className="movie-browse" aria-label="电影分类">
    <div className="movie-browse-fields">
      <label><span><Clapperboard size={13}/>影片类型</span><div><select aria-label="影片类型分类" value={value.genre} onChange={e=>onChange({...value,genre:e.target.value})}><option value="all">全部类型 · {media.length}</option>{genreGroups.map(g=><option key={g.id} value={g.id}>{g.label} · {countGenre(g.id)}</option>)}</select><ChevronDown size={13}/></div></label>
      <label><span><Users size={13}/>建议观看年龄</span><div><select aria-label="建议观看年龄分类" value={value.age} onChange={e=>onChange({...value,age:e.target.value})}><option value="all">全部年龄</option>{ageGroups.map(g=><option key={g.id} value={g.id}>{g.label} · {countAge(g.id)}</option>)}</select><ChevronDown size={13}/></div></label>
      <label><span><CalendarDays size={13}/>上映年份</span><div><select aria-label="上映年份分类" value={value.year} onChange={e=>onChange({...value,year:e.target.value})}><option value="all">全部年份</option><option value="recent">近 5 年</option><optgroup label="按年代">{decades.map(year=><option key={year} value={`decade:${year}`}>{year} 年代</option>)}{years.some(y=>y<1980)&&<option value="before-1980">1980 年以前</option>}</optgroup><optgroup label="具体年份">{years.map(year=><option key={year} value={year}>{year} 年</option>)}</optgroup><option value="unknown">年份未知</option></select><ChevronDown size={13}/></div></label>
      <button className="movie-filter-reset" disabled={!active} onClick={()=>onChange(emptyCatalogFilters)}><RotateCcw size={13}/>重置分类</button>
    </div>
    <div className="movie-genre-shortcuts" aria-label="常用影片类型"><button aria-label="全部类型" aria-pressed={value.genre==='all'} onClick={()=>onChange({...value,genre:'all'})}>全部</button>{genreGroups.filter(g=>countGenre(g.id)>0).map(g=><button key={g.id} aria-label={g.label} aria-pressed={value.genre===g.id} onClick={()=>onChange({...value,genre:g.id})}>{g.label}<small aria-hidden="true">{countGenre(g.id)}</small></button>)}</div>
    <p className="movie-rating-note">年龄分组参考影片的地区分级；没有可靠分级资料的影片归入“未分级”。</p>
  </section>;
}
