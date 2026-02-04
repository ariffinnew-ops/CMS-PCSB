-- Create login_logs table for tracking authentication attempts
CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT false
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON login_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username);
