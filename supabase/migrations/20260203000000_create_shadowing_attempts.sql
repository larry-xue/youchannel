CREATE TABLE public.shadowing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.live_sessions (id) ON DELETE SET NULL,
  language text NOT NULL,
  drill_key text NOT NULL,
  drill_id text,
  drill_kind text NOT NULL DEFAULT 'shadowing'
    CONSTRAINT shadowing_attempts_drill_kind_check CHECK (drill_kind IN ('shadowing')),
  target_text text NOT NULL,
  heard_text text NOT NULL,
  overall integer NOT NULL CONSTRAINT shadowing_attempts_overall_check CHECK (overall BETWEEN 0 AND 100),
  accuracy integer NOT NULL CONSTRAINT shadowing_attempts_accuracy_check CHECK (accuracy BETWEEN 0 AND 100),
  pronunciation integer NOT NULL CONSTRAINT shadowing_attempts_pronunciation_check CHECK (pronunciation BETWEEN 0 AND 100),
  fluency integer NOT NULL CONSTRAINT shadowing_attempts_fluency_check CHECK (fluency BETWEEN 0 AND 100),
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX shadowing_attempts_user_language_created_at_idx
  ON public.shadowing_attempts (user_id, language, created_at DESC);

CREATE INDEX shadowing_attempts_user_language_drill_key_created_at_idx
  ON public.shadowing_attempts (user_id, language, drill_key, created_at DESC);

CREATE INDEX shadowing_attempts_user_language_overall_created_at_idx
  ON public.shadowing_attempts (user_id, language, overall DESC, created_at DESC);

ALTER TABLE public.shadowing_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their shadowing attempts"
  ON public.shadowing_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their shadowing attempts"
  ON public.shadowing_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their shadowing attempts"
  ON public.shadowing_attempts FOR DELETE
  USING (auth.uid() = user_id);
