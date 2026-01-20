-- Add sequence_number column for message ordering
-- and client_message_id for deduplication
ALTER TABLE public.live_session_messages
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

-- Add unique constraint on (live_session_id, client_message_id) to prevent duplicates
-- Using a partial unique index to allow NULL values (backward compatibility)
CREATE UNIQUE INDEX IF NOT EXISTS live_session_messages_client_id_unique
  ON public.live_session_messages (live_session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Add composite index for efficient ordering by sequence_number
CREATE INDEX IF NOT EXISTS live_session_messages_session_sequence_idx
  ON public.live_session_messages (live_session_id, sequence_number)
  WHERE sequence_number IS NOT NULL;

-- Add index on created_at for fallback ordering
CREATE INDEX IF NOT EXISTS live_session_messages_session_created_idx
  ON public.live_session_messages (live_session_id, created_at);

COMMENT ON COLUMN public.live_session_messages.sequence_number IS 'Client-assigned monotonically increasing sequence number for message ordering';
COMMENT ON COLUMN public.live_session_messages.client_message_id IS 'Client-generated UUID for deduplication';
