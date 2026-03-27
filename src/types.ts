export interface Asset {
  id: string;
}

export type PhotoStatus = "pick" | "reject" | "unreviewed";

export type Direction = "left" | "right" | null;

export interface Month {
  year: number;
  month: number;
  count: number;
  label: string;
}

export interface PendingMonth {
  monthObj: Month;
  monthIdx: number;
}

export type HistoryEntry =
  | { type: "status"; index: number; from: PhotoStatus; to: PhotoStatus }
  | { type: "tag"; index: number; tag: string; action: "add" | "remove" };

export type IndexedMonth = Month & {
  idx: number;
};

export interface Photo {
  id: string;
  src: string;
  thumb: string;
  videoSrc?: string;
  status: PhotoStatus;
  initialStatus: PhotoStatus;
  isVideo: boolean;
  tags: string[];
  initialTags: string[];
}

export interface TagBinding {
  key: string;
  name: string;
  color: string;
}
