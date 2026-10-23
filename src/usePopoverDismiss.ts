import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';

// A short grace period lets the pointer cross the gap between a trigger and its menu.
export function usePopoverDismiss(open:boolean|string|null,root:RefObject<HTMLElement|null>,onClose:()=>void,selector?:string) {
  const close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{
    if(!open)return;
    const anchor=selector?root.current?.querySelector<HTMLElement>(selector):root.current;
    const menu=anchor?.querySelector<HTMLElement>('.cinema-menu');
    if(menu){menu.style.setProperty('--popover-shift','0px');const box=menu.getBoundingClientRect();const shift=box.left<12?12-box.left:box.right>innerWidth-12?innerWidth-12-box.right:0;menu.style.setProperty('--popover-shift',`${shift}px`);}
  },[open,root,selector]);
  useEffect(()=>{
    if(!open)return;
    const openedAt=performance.now();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const anchor=selector?root.current?.querySelector<HTMLElement>(selector):root.current;
    const cancel=()=>{clearTimeout(timer);timer=undefined;};
    const outside=(event:PointerEvent)=>{
      if(anchor?.contains(event.target as Node)){cancel();return;}
      if(event.type==='pointerdown'){if((event.target as HTMLElement).closest('[data-back-control]'))return;cancel();close.current();return;}
      if(!timer)timer=setTimeout(()=>close.current(),180);
    };
    const other=(event:Event)=>{if((event as CustomEvent).detail!==anchor)close.current();};
    const resized=()=>close.current();
    const back=(event:Event)=>{event.preventDefault();close.current();};
    const scrolled=(event:Event)=>{if(performance.now()-openedAt>120&&!anchor?.contains(event.target as Node))close.current();};
    document.dispatchEvent(new CustomEvent('luma:popover-open',{detail:anchor}));
    document.addEventListener('luma:popover-open',other);document.addEventListener('luma:back',back);window.addEventListener('blur',resized);document.addEventListener('pointermove',outside);document.addEventListener('pointerdown',outside);
    window.addEventListener('resize',resized);window.addEventListener('scroll',scrolled,true);
    return()=>{cancel();document.removeEventListener('luma:popover-open',other);document.removeEventListener('luma:back',back);window.removeEventListener('blur',resized);document.removeEventListener('pointermove',outside);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resized);window.removeEventListener('scroll',scrolled,true);};
  },[open,root,selector]);
}
