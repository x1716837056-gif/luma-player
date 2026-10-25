import type {AudioOutput,Media} from '../src/types';
export const audioCodecs:string[][];
export function normalizeAudioOutput(value?:unknown):AudioOutput;
export function needsNativeAudio(value?:unknown):boolean;
export function browserPlaybackCompatible(media:Partial<Media>):boolean;
export function codecLabel(codec?:string):string;
