-- 心動 reactions: one row per (segment, reader).
CREATE TABLE IF NOT EXISTS reactions (
  segment_id TEXT NOT NULL,
  uid        TEXT NOT NULL,
  intensity  INTEGER NOT NULL,        -- 1..5
  ip_hash    TEXT,
  slug       TEXT,                     -- reader handle if logged in
  name       TEXT,                     -- display name if logged in
  book       TEXT NOT NULL DEFAULT 'zphlm',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (segment_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_reactions_segment ON reactions(segment_id);
CREATE INDEX IF NOT EXISTS idx_reactions_ip_time ON reactions(ip_hash, updated_at);

-- Denormalised aggregate per segment
CREATE TABLE IF NOT EXISTS segment_stats (
  segment_id TEXT PRIMARY KEY,
  voters     INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  book       TEXT NOT NULL DEFAULT 'zphlm',
  segment_id TEXT NOT NULL,
  parent_id  TEXT,
  slug       TEXT,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT,
  status     TEXT NOT NULL DEFAULT 'visible',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_seg    ON comments(book, segment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_recent ON comments(book, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  uid        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, uid)
);
