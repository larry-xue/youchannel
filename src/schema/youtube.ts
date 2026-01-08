export type YoutubeAccount = {
  id: string;
  user_id: string;
  provider: string;
  expires_at: string | null;
  scope: string | null;
  token_type: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistEntryStatus = "active" | "lost" | "auth_invalid";

export type Playlist = {
  id: string;
  user_id: string;
  youtube_account_id: string | null;
  playlist_id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  custom_url: string | null;
  is_active: boolean;
  entry_status: PlaylistEntryStatus;
  analysis_prompt: string;
  last_synced_at: string | null;
  next_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Video = {
  id: string;
  playlist_id: string;
  youtube_video_id: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoAnalysisStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"
  | "queued";

export type VideoAnalysisSkipReason =
  | "quota_exceeded"
  | "duration_exceeded"
  | "video_unavailable";

export type VideoAnalysis = {
  id: string;
  video_id: string;
  playlist_id: string;
  user_id: string;
  prompt: string;
  prompt_hash: string;
  analysis_text: string;
  model: string;
  status: VideoAnalysisStatus;
  skip_reason: VideoAnalysisSkipReason | null;
  error: string | null;
  failed_count: number;
  created_at: string;
  updated_at: string;
};

export type UserQuota = {
  id: string;
  user_id: string;
  analysis_count: number;
  max_analyses: number;
  created_at: string;
  updated_at: string;
};

export type SyncLogStatus = "running" | "completed" | "failed";

export type SyncLog = {
  id: string;
  user_id: string | null;
  playlist_id: string | null;
  status: SyncLogStatus;
  videos_added: number;
  videos_removed: number;
  analyses_triggered: number;
  analyses_skipped: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};
