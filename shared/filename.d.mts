export function parseRelease(filename: string): { title: string; originalTitle: string; year: number; kind: 'movie' | 'tv'; episode?: string; season?: number; episodeNumber?: number; release: {resolution?: string; videoCodec?: string; audioCodec?: string; source?: string} };
export function chineseNumber(value:string):number|undefined;
export function titleVariants(value:string):string[];
export function genericTitle(value:string):boolean;
