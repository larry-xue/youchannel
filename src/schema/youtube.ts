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
