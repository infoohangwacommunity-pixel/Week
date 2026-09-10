-- =============================================================================
-- Migration: 013_add_phone_hash_to_students
-- =============================================================================
-- Add phone_hash column to students table for identity resolution
-- 
-- This column stores the HMAC hash of the student's phone number.
-- Used to look up WaxID without storing plaintext phone numbers.
-- =============================================================================

-- Add phone_hash column to students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS phone_hash TEXT;

-- Add unique constraint to ensure one WaxID per phone hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_phone_hash 
ON students(phone_hash) 
WHERE phone_hash IS NOT NULL AND deleted_at IS NULL;

-- Add check constraint to ensure phone_hash is 64 characters (SHA256 hex)
ALTER TABLE students 
ADD CONSTRAINT students_phone_hash_length 
CHECK (phone_hash IS NULL OR LENGTH(phone_hash) = 64);
