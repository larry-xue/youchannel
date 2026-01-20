-- Live voice sessions (separate from conversations, which were removed)
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX live_sessions_user_id_idx ON public.live_sessions (user_id);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their live sessions"
  ON public.live_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their live sessions"
  ON public.live_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their live sessions"
  ON public.live_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their live sessions"
  ON public.live_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_live_sessions_updated_at
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Live session messages
CREATE TABLE public.live_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT live_session_messages_role_check CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX live_session_messages_session_id_idx
  ON public.live_session_messages (live_session_id);

ALTER TABLE public.live_session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their live session messages"
  ON public.live_session_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_messages.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their live session messages"
  ON public.live_session_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_messages.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their live session messages"
  ON public.live_session_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_messages.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_messages.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their live session messages"
  ON public.live_session_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE live_sessions.id = live_session_messages.live_session_id
        AND live_sessions.user_id = auth.uid()
    )
  );
