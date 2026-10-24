import type {Media} from '../src/types';
export type BrowseGroup={name:string;count:number;images:string[];collage:boolean};
export function browseGroups(media:Media[],kind:string):BrowseGroup[];
