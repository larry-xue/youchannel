CREATE TABLE public.live_session_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  assessment jsonb NOT NULL,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX live_session_assessments_session_unique
  ON public.live_session_assessments (live_session_id);

ALTER TABLE public.live_session_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their live session assessments"
  ON public.live_session_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_assessments.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their live session assessments"
  ON public.live_session_assessments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_assessments.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their live session assessments"
  ON public.live_session_assessments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_assessments.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_assessments.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their live session assessments"
  ON public.live_session_assessments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_assessments.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_live_session_assessments_updated_at
  BEFORE UPDATE ON public.live_session_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
