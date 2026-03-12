-- Share links: immutable, read-only snapshots for the share link feature
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_created_at ON share_links(created_at);

-- Files associated with share links (images embedded in shared drawings)
CREATE TABLE IF NOT EXISTS share_link_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_link_files_link_file ON share_link_files(share_link_id, file_id);
