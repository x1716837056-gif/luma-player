export type Media = {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  kind: 'movie' | 'tv';
  genre: string[];
  duration: number;
  rating: string;
  certification: string;
  certificationRegion?: string;
  minimumAge?: number;
  certificationCheckedAt?: number;
  certificationError?: string;
  poster: string;
  backdrop: string;
  description: string;
  director?: string;
  cast?: string[];
  progress?: number;
  episode?: string;
  sourceId: string;
  path?: string;
  fileSize?: number;
  modifiedAt?: number;
  videoUrl?: string;
  quality: string;
  favorite?: boolean;
  watched?: boolean;
  addedAt: number;
  tmdbId?: number;
  imported?: boolean;
  season?: number;
  episodeNumber?: number;
  missing?: boolean;
  metadataOrigin?: 'nfo' | 'tmdb' | 'manual';
  metadataStatus?: 'matched' | 'needs-token' | 'review' | 'failed';
  metadataError?: string;
  probeError?: string;
  technical?: { container?: string; videoCodec?: string; width?: number; height?: number; hdr: boolean; colorTransfer?: string; durationSeconds: number; tracks: {index: number; type: string; codec?: string; language?: string; title?: string; channels?: number}[]; probedAt: number };
};

export type Source = {
  id: string;
  name: string;
  path: string;
  type: 'local' | 'nas';
  status: 'online' | 'offline';
};

export type Library = { media: Media[]; sources: Source[]; demo: boolean };
export type ColorMapping = {output:'auto'|'sdr'|'hdr';curve:'auto'|'spline'|'bt.2390'|'bt.2446a'|'st2094-40'|'st2094-10';peakNits:number;dynamicPeak:boolean};
export type Settings = { theme: 'dark' | 'light'; tmdbToken: string; metadataLanguage: string; autoplay: boolean; defaultPlayer: 'auto' | 'native' | 'mpv'; mpvPath: string; autoScrape: boolean; watchFolders: boolean; colorMapping?:ColorMapping; };
export type ScanResult = { media: Media[]; source: Source; warnings: string[] };
export type TaskStatus = { running: boolean; completed: number; total: number; matched: number; review: number; failed: number; queued: number; active?: number };
export type PlayerState = { active: boolean; error?: string; mediaId?: string; title?: string; position?: number; duration?: number; paused?: boolean; tracks?: {id: number; type: string; title?: string; lang?: string; selected?: boolean}[] };

declare global {
  interface Window {
    __LUMA_ASSETS?: Record<string, string>;
    desktop?: {
      ready(): void;
      loadLibrary(): Promise<Library | null>;
      saveLibrary(library: Library): Promise<void>;
      loadSettings(): Promise<Partial<Settings>>;
      saveSettings(settings: Settings): Promise<void>;
      selectFolder(): Promise<string | null>;
      scanFolder(path: string, type: Source['type']): Promise<ScanResult>;
      scrape(media: Media, query: string, kind: Media['kind']): Promise<Media[]>;
      playMpv(media: Media): Promise<PlayerState>;
      updateMedia(id: string, patch: Partial<Media>): Promise<Media>;
      applyMetadata(id: string, candidate: Media): Promise<Media>;
      probeMedia(id: string): Promise<Media>;
      startTasks(): Promise<TaskStatus>;
      cancelTasks(): Promise<void>;
      taskStatus(): Promise<TaskStatus>;
      playerState(): Promise<PlayerState>;
      playerControl(action: 'pause' | 'seek' | 'aid' | 'sid' | 'stop', value?: number | boolean | 'no'): Promise<void>;
      onLibraryChanged(callback: (library: Library) => void): () => void;
      onTasksChanged(callback: (status: TaskStatus) => void): () => void;
      onPlayerChanged(callback: (state: PlayerState) => void): () => void;
      revealFile(path: string): Promise<void>;
      windowAction(action: 'minimize' | 'maximize' | 'close'): void;
    };
  }
}
