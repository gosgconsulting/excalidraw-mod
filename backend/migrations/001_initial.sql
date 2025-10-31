-- Initial schema for persistent drawings
CREATE TABLE IF NOT EXISTS drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  encrypted_data BYTEA NOT NULL,
  encryption_key VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawings_slug ON drawings(slug);
CREATE INDEX IF NOT EXISTS idx_drawings_updated_at ON drawings(updated_at);


