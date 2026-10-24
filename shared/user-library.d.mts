import type {Media,PersonalPatch} from '../src/types';
export const personalFields:string[];
export const userFields:string[];
export function workMembers(items:Media[],id:string):Media[];
export function itemVersions(items:Media[],id:string):Media[];
export function validatePersonal(patch:PersonalPatch):PersonalPatch;
export function applyPersonal(items:Media[],id:string,patch:PersonalPatch,now?:number):Media[];
export function metadataOnly(value:Partial<Media>):Partial<Media>;
