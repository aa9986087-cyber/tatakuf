CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL
);
CREATE INDEX rooms_expires_at ON rooms(expires_at);
