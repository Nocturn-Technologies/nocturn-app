-- Add bar minimum and deposit tracking to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS bar_minimum NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_deposit NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_cost NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS estimated_bar_revenue NUMERIC(10,2);

-- Add travel cost fields to event_artists for talent cost breakdown
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS flight_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS hotel_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS transport_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS travel_notes TEXT;
