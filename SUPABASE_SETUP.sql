-- Supabase Database Setup Script
-- Run this in your Supabase SQL Editor

-- Create the feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  feedback TEXT NOT NULL,
  additional_text TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_email ON feedback(email);
CREATE INDEX IF NOT EXISTS idx_feedback_submitted_at ON feedback(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_batch_number ON feedback(batch_number);

-- Optional: Enable Row Level Security (RLS) if you want to restrict access
-- ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy to allow inserts (if RLS is enabled)
-- CREATE POLICY "Allow anonymous inserts" ON feedback
--   FOR INSERT
--   TO anon
--   WITH CHECK (true);

-- Optional: Create a policy to allow service role to read all (if RLS is enabled)
-- CREATE POLICY "Allow service role full access" ON feedback
--   FOR ALL
--   TO service_role
--   USING (true)
--   WITH CHECK (true);

