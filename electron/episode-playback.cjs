const {nextEpisode,episodeIdentity}=require('../shared/series.mjs');
const label=media=>{const i=episodeIdentity(media);return i?{...media,title:`${i.title}${i.number!==null?` · 第 ${i.season??1} 季 · 第 ${i.number} 集`:''}`}:media;};
class EpisodePlayback {
  constructor({player,getMedia,getSettings,readable,notice}){
    Object.assign(this,{player,getMedia,getSettings,readable,notice});this.generation=0;
    player.on('ended',()=>{void this.advance(true);});
    player.on('next-requested',()=>{void this.advance(false);});
    player.on('state',state=>{if(!state.active)this.cancel();});
  }
  cancel(){this.generation++;}
  async open(executable,media,options={}){
    this.cancel();const ticket=this.generation;await this.readable(media);
    if(ticket!==this.generation)return this.player.state;
    const state=await this.player.start(executable,label(media),{...options,episodeChain:Boolean(episodeIdentity(media))});
    await this.refresh();return state;
  }
  async refresh(){
    if(!this.player.state.active)return;
    const current=this.getMedia().find(m=>m.id===this.player.state.mediaId),next=current&&nextEpisode(this.getMedia(),current).media;
    await this.player.command(['set_property','user-data/luma-osc/next-title',next?label(next).title:'']).catch(()=>{});
  }
  async advance(automatic=false){
    if(this.pending)return this.pending;
    const work=(async()=>{
      const ticket=this.generation,id=this.player.state.mediaId;
      if(!this.player.state.active||(automatic&&this.getSettings().autoplay===false))return;
      const current=this.getMedia().find(m=>m.id===id);if(!current)return;
      const next=nextEpisode(this.getMedia(),current);
      if(!next.media){if(next.reason==='gap'||next.reason==='offline')this.show(next.reason==='gap'?'下一集尚未加入影音库，已停止连播。':'下一集片源离线，已停止连播。');return;}
      try{
        await this.readable(next.media);
        if(ticket!==this.generation||!this.player.state.active||this.player.state.mediaId!==id||(automatic&&this.getSettings().autoplay===false))return;
        await this.player.loadNext(label({...next.media,progress:0}));await this.refresh();
      }catch(error){if(ticket===this.generation)this.show('无法打开下一集，已停止连播。请检查片源连接。');}
    })();
    this.pending=work;try{return await work;}finally{if(this.pending===work)this.pending=null;}
  }
  show(message){this.notice(message);void this.player.command(['show-text',message,4000]).catch(()=>{});}
}
module.exports={EpisodePlayback};
