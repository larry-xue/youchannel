CREATE TABLE public.live_session_observer_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  client_output_id uuid NOT NULL,
  transcript text NOT NULL,
  suggestions jsonb NOT NULL,
  confidence double precision NOT NULL,
  ui_locale text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX live_session_observer_outputs_unique
  ON public.live_session_observer_outputs (live_session_id, client_output_id);

CREATE INDEX live_session_observer_outputs_session_idx
  ON public.live_session_observer_outputs (live_session_id);

ALTER TABLE public.live_session_observer_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their live session observer outputs"
  ON public.live_session_observer_outputs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_observer_outputs.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their live session observer outputs"
  ON public.live_session_observer_outputs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_observer_outputs.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their live session observer outputs"
  ON public.live_session_observer_outputs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_observer_outputs.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_observer_outputs.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their live session observer outputs"
  ON public.live_session_observer_outputs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_observer_outputs.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_live_session_observer_outputs_updated_at
  BEFORE UPDATE ON public.live_session_observer_outputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
