-- Migration: Add available_frequencies column to check_ins table
-- This column stores a JSON array of frequency IDs that a station can reach
-- Used for SKYWARN nets where operators indicate which frequencies they can monitor

ALTER TABLE check_ins ADD COLUMN available_frequencies TEXT DEFAULT '[]';
