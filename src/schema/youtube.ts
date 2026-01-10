export type VideoAnalysisStatus =
  | "pending"
  | "completed"
  | "failed";

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

export type VideoAnalysis = {
  id: string;
  video_id: string;
  user_id: string;
  prompt: string;
  prompt_hash: string;
  analysis_text: string;
  model: string;
  status: VideoAnalysisStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};
