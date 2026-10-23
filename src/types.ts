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
  poster: string;
  backdrop: string;
  description: string;
  director?: string;
  cast?: string[];
  progress?: number;
  episode?: string;
  sourceId: string;
  path?: string;
  videoUrl?: string;
  quality: string;
  favorite?: boolean;
  watched?: boolean;
  addedAt: number;
  tmdbId?: number;
  imported?: boolean;
};

export type Source = {
  id: string;
  name: string;
  path: string;
  type: 'local' | 'nas';
  status: 'online' | 'offline';
};

export type Library = { media: Media[]; sources: Source[]; demo: boolean };
export type Settings = { tmdbToken: string; metadataLanguage: string; autoplay: boolean; defaultPlayer: 'native' | 'mpv'; mpvPath: string; };
export type ScanResult = { media: Media[]; source: Source; warnings: string[] };

declare global {
  interface Window {
    __LUMA_ASSETS?: Record<string, string>;
    desktop?: {
      loadLibrary(): Promise<Library | null>;
      saveLibrary(library: Library): Promise<void>;
      loadSettings(): Promise<Partial<Settings>>;
      saveSettings(settings: Settings): Promise<void>;
      selectFolder(): Promise<string | null>;
      scanFolder(path: string, type: Source['type']): Promise<ScanResult>;
      scrape(media: Media, query: string, kind: Media['kind']): Promise<Media[]>;
      playMpv(media: Media): Promise<void>;
      revealFile(path: string): Promise<void>;
      windowAction(action: 'minimize' | 'maximize' | 'close'): void;
    };
  }
}
