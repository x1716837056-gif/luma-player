import {useEffect,useRef,type RefObject} from 'react';

// Only reposition automatic WebVTT cues; authored cue positions retain their layout.
export function useSubtitleSafeArea(video:RefObject<HTMLVideoElement|null>,active:boolean,subtitle:string) {
  const originals=useRef(new WeakMap<VTTCue,Pick<VTTCue,'line'|'snapToLines'|'lineAlign'>>());
  useEffect(()=>{
    const player=video.current;if(!player)return;
    const tracks=new Set<TextTrack>();
    const restore=()=>{
      for(const track of Array.from(player.textTracks))for(const cue of Array.from(track.cues||[])){
        if(!(cue instanceof VTTCue))continue;const original=originals.current.get(cue);
        if(original){cue.snapToLines=original.snapToLines;cue.line=original.line;cue.lineAlign=original.lineAlign;}
      }
    };
    const apply=()=>{
      const dock=player.parentElement?.querySelector<HTMLElement>('.cinema-dock');
      const rect=player.getBoundingClientRect();
      if(!active||!dock||!rect.height||!player.videoWidth){restore();return;}
      const pictureHeight=Math.min(rect.height,rect.width*player.videoHeight/player.videoWidth);
      const pictureTop=rect.top+(rect.height-pictureHeight)/2;
      const safeBottom=dock.getBoundingClientRect().top-24;
      // WebVTT percentage lines reserve space for the rendered cue box as well.
      const cueRoom=Math.max(28,rect.height*.1);
      const percent=Math.max(10,Math.min(95,(safeBottom-pictureTop-cueRoom)/pictureHeight*100));
      for(const track of Array.from(player.textTracks))for(const cue of Array.from(track.cues||[])){
        if(!(cue instanceof VTTCue))continue;
        if(!originals.current.has(cue))originals.current.set(cue,{line:cue.line,snapToLines:cue.snapToLines,lineAlign:cue.lineAlign});
        if(originals.current.get(cue)!.line==='auto'){cue.snapToLines=false;cue.lineAlign='end';cue.line=percent;}
      }
    };
    const bind=()=>{for(const track of Array.from(player.textTracks))if(!tracks.has(track)){tracks.add(track);track.addEventListener('cuechange',apply);}apply();};
    const observer=new ResizeObserver(apply);observer.observe(player);
    const dock=player.parentElement?.querySelector('.cinema-dock');if(dock)observer.observe(dock);
    player.textTracks.addEventListener('addtrack',bind);player.addEventListener('loadedmetadata',bind);bind();
    return()=>{observer.disconnect();player.textTracks.removeEventListener('addtrack',bind);player.removeEventListener('loadedmetadata',bind);for(const track of tracks)track.removeEventListener('cuechange',apply);restore();};
  },[video,active,subtitle]);
}
