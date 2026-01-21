-- Remove redundant metadata fields from live_session_messages
-- The sessionId in metadata is redundant with the live_session_id foreign key

-- First, let's create a backup comment
COMMENT ON TABLE public.live_session_messages IS 'Stores individual messages in a live voice session. Related to live_sessions via live_session_id FK.';

-- We can't directly remove keys from JSONB, but we can update the metadata to remove sessionId
-- This is optional and can be done as a background task if needed
UPDATE public.live_session_messages
SET metadata = metadata - 'sessionId'
WHERE metadata ? 'sessionId';

-- Add a comment noting the cleanup
COMMENT ON COLUMN public.live_session_messages.metadata IS 'Message metadata (source, etc). Note: sessionId is redundant with live_session_id FK and should not be stored here.';
