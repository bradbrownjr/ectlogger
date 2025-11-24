-- Add prefer_utc column to users table
ALTER TABLE users ADD COLUMN prefer_utc BOOLEAN DEFAULT 0;
