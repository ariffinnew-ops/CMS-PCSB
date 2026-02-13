-- Create cms_settings table for app-wide configuration
CREATE TABLE IF NOT EXISTS cms_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the maintenance_mode flag (off by default)
INSERT INTO cms_settings (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
