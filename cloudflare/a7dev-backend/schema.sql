PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS script_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_key TEXT NOT NULL,
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('staging', 'active', 'archived')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_script_versions_game
  ON script_versions(game_key, id DESC);

CREATE INDEX IF NOT EXISTS idx_script_versions_state
  ON script_versions(game_key, state, id DESC);

CREATE TABLE IF NOT EXISTS active_scripts (
  game_key TEXT PRIMARY KEY,
  version_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(version_id) REFERENCES script_versions(id)
);

CREATE TABLE IF NOT EXISTS manual_grants (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  permanent INTEGER NOT NULL DEFAULT 0 CHECK (permanent IN (0, 1)),
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  label TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_grants_username
  ON manual_grants(username);

CREATE TABLE IF NOT EXISTS legacy_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_sessions_user
  ON legacy_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS migration_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  game_key TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
