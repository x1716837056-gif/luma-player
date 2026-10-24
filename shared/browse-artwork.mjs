import {libraryEntries} from './series.mjs';
import {facetNames} from './movies.mjs';
export function browseGroups(media,kind){
  const groups=new Map(),role=kind==='directors'?'director':'actor';
  for(const entry of libraryEntries(media))for(const m of entry.series?.media||entry.movie?.media||[entry.media])for(const name of facetNames(m,kind)){
    if(!groups.has(name))groups.set(name,{name,works:new Set(),images:new Set(),fallbacks:new Set()});const g=groups.get(name);g.works.add(entry.id);
    if(kind==='collections'){
      if(name===m.collection?.name){if(m.collection.backdrop)g.images.add(m.collection.backdrop);else if(m.collection.poster)g.images.add(m.collection.poster);}
      if(m.poster)g.fallbacks.add(m.poster);
    }else for(const person of m.people||[])if(person.name===name&&person.role===role&&person.photo)g.images.add(person.photo);
  }
  return [...groups.values()].map(g=>({name:g.name,count:g.works.size,images:[...new Set([...g.images,...g.fallbacks])].slice(0,4),collage:kind==='collections'&&!g.images.size})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
}
