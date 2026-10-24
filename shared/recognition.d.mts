import type {Media} from '../src/types';
export const RECOGNITION_VERSION:number;
export type RecognitionState='matched'|'pending'|'review'|'not-found'|'failed';
export function recognitionHints(media:Partial<Media>):{title:string;originalTitle:string;kind:'movie'|'tv';year:number;season?:number;episodeNumber?:number;titles:string[];queries:string[];parentConflict:boolean};
export function recognitionState(media:Partial<Media>):RecognitionState;
export function shouldRecognize(media:Partial<Media>,force?:boolean):boolean;
export function recognitionGroups(entries:{media:Media;series?:{media:Media[]};movie?:{media:Media[]}}[],demo?:boolean):{matched:Set<string>;pending:Map<string,RecognitionState>};
