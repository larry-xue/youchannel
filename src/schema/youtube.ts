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
  analysis_prompt: string;
  last_synced_at: string | null;
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
  created_at: string;
  updated_at: string;
};

export type VideoAnalysis = {
  id: string;
  video_id: string;
  playlist_id: string;
  user_id: string;
  prompt: string;
  prompt_hash: string;
  analysis_text: string;
  model: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};
