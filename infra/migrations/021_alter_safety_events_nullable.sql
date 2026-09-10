-- Migration: 021_alter_safety_events_nullable_level_event_type.sql
-- The SafetyClassifier may produce benign classifications where level and
-- event_type are NULL (e.g., action='none'). The original schema declared
-- both as NOT NULL, causing INSERT failures for benign events. Make both
-- columns nullable so audit rows can be persisted without forcing every
-- classification to invent a fake level/event_type.

ALTER TABLE safety_events
  ALTER COLUMN level DROP NOT NULL;

ALTER TABLE safety_events
  ALTER COLUMN event_type DROP NOT NULL;

COMMENT ON COLUMN safety_events.level IS
  'Safety level (1=benign, 2=welfare check-in, 3=crisis). NULL when classification was inconclusive or benign.';
COMMENT ON COLUMN safety_events.event_type IS
  'Event type tag (crisis, inappropriate_response, adversarial_pattern, welfare_concern, benign). NULL when no safety action was taken.';
