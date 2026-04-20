-- Add event_id back to channels table.
-- The schema rebuild dropped this column but the event chat feature uses it
-- to find or create a per-event channel for team communication.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_channels_event_id ON public.channels(event_id) WHERE event_id IS NOT NULL;
