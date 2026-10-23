const aliases: Record<string,string>={eng:'en',zho:'zh',chi:'zh',cmn:'zh',yue:'yue',jpn:'ja',kor:'ko',fra:'fr',fre:'fr',deu:'de',ger:'de',spa:'es',por:'pt',rus:'ru',ita:'it',ara:'ar',hin:'hi',tha:'th',vie:'vi'};
const names=new Intl.DisplayNames(['zh-CN'],{type:'language'});
export function languageName(language?:string) {
  if(!language || ['und','unknown'].includes(language.toLowerCase()))return '';
  const code=aliases[language.toLowerCase()]||language;
  try{return names.of(code)||language;}catch{return language;}
}
export function trackName(track:{title?:string;lang?:string;language?:string;id?:number;index?:number},kind:'audio'|'subtitle') {
  const language=languageName(track.lang||track.language);
  const title=track.title?.trim();
  return [language,title && title.toLowerCase()!==language.toLowerCase()?title:''].filter(Boolean).join(' · ') || `${kind==='audio'?'音轨':'字幕'} ${track.id??((track.index??0)+1)}`;
}
