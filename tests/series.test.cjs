const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {groupSeries,libraryEntries,nextEpisode,resumeEpisode,episodeIdentity}=require('../shared/series.mjs');
const {scanFolder}=require('../electron/library.cjs');
const episode=(id,season,number,extra={})=>({id,title:'A Show',originalTitle:'A Show',kind:'tv',seriesTitle:'A Show',season,episodeNumber:number,path:`C:/TV/A Show/S${season}E${number}-${id}.mkv`,sourceId:'nas',...extra});
test('series / seasons / episodes sort numerically, merge versions and keep progress on original files',()=>{
  const items=[episode('ten',1,10),episode('two',1,2,{progress:.4,lastPlayedAt:99}),episode('one-b',1,1,{sourceId:'usb'}),episode('one-a',1,1),episode('special',0,1),episode('s2',2,1),{id:'movie',kind:'movie',title:'A Show',path:'C:/A Show.2024.mp4'}];
  const series=groupSeries(items)[0];assert.equal(groupSeries(items).length,1);assert.deepEqual(series.seasons.map(s=>s.number),[0,1,2]);assert.deepEqual(series.seasons[1].episodes.map(e=>e.number),[1,2,10]);assert.equal(series.seasons[1].episodes[0].media.length,2);assert.equal(series.episodeCount,5);assert.equal(libraryEntries(items).length,2);assert.equal(resumeEpisode(series).id,'two');assert.equal(nextEpisode(items,items[3]).media.id,'two');
});
test('next episode stops on gaps / offline, crosses consecutive seasons, isolates specials and never loops',()=>{
  const a=episode('a',1,1),b=episode('b',1,2),c=episode('c',2,1),s=episode('special',0,1);
  assert.equal(nextEpisode([a,b,c],b).media.id,'c');assert.equal(nextEpisode([a,b,c],c).reason,'end');assert.equal(nextEpisode([a,episode('gap',1,3),c],a).reason,'gap');assert.equal(nextEpisode([a,{...b,missing:true}],a).reason,'offline');assert.equal(nextEpisode([s,a],s).reason,'end');assert.equal(nextEpisode([a,{...b,missing:true},{...b,id:'local',sourceId:'usb'}],a).media.id,'local');
  assert.equal(nextEpisode([a,episode('s3',3,1)],a).reason,'gap');
  assert.equal(resumeEpisode(groupSeries([s,{...a,watched:true,progress:.3,lastPlayedAt:100},b])[0]).id,'a');
});
test('folder-only episodes, specials zero, unknown records and stable TMDB identity do not mix unrelated shows',()=>{
  const media={id:'old',title:'S04E03.2024',kind:'tv',path:'Z:/A.Show 第四季 (2024) 4K HDR/S04E03.2024.2160p.mkv'};
  assert.equal(episodeIdentity(media).title,'A Show');assert.equal(episodeIdentity(media).season,4);assert.equal(episodeIdentity(media).number,3);
  const bare={id:'x',kind:'movie',title:'01',path:'Z:/A Show/Season 02/01.mkv'};assert.equal(episodeIdentity(bare).number,1);assert.equal(episodeIdentity(bare).season,2);
  assert.equal(episodeIdentity({id:'s',kind:'tv',path:'Z:/A Show/S00E01.mkv'}).season,0);
  assert.equal(groupSeries([episode('a',1,1,{tmdbId:1}),episode('b',2,1,{tmdbId:1,title:'不同语言'}),episode('c',1,1,{tmdbId:2})]).length,2);
  assert.equal(nextEpisode([{id:'unknown',kind:'tv',title:'Unnumbered'}],{id:'unknown',kind:'tv',title:'Unnumbered'}).reason,'unidentified');
});
test('TV NFO inheritance and episode sidecars retain show identity, numbering and artwork',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-series-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'Season 02'));await fs.writeFile(path.join(root,'tvshow.nfo'),'<tvshow><title>测试剧集</title><originaltitle>Test Show</originaltitle><year>2020</year><plot>整部剧简介</plot></tvshow>');await fs.writeFile(path.join(root,'poster.jpg'),'image');
  await fs.writeFile(path.join(root,'Season 02','01.mkv'),'video');await fs.writeFile(path.join(root,'Season 02','01.nfo'),'<episodedetails><title>第一集标题</title><season>2</season><episode>1</episode><plot>单集简介</plot></episodedetails>');
  const media=(await scanFolder(root)).media[0];assert.equal(media.title,'测试剧集');assert.equal(media.seriesTitle,'测试剧集');assert.equal(media.episodeTitle,'第一集标题');assert.equal(media.season,2);assert.equal(media.episodeNumber,1);assert.equal(media.description,'单集简介');assert.equal(media.seriesDescription,'整部剧简介');assert.match(media.poster,/poster.jpg/);
});
