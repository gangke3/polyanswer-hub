export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  selected_providers_json TEXT NOT NULL,
  auto_synthesize INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS task_providers (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  elapsed_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  requires_user_action INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  task_provider_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_text TEXT,
  answer_markdown TEXT,
  raw_text TEXT,
  raw_html_path TEXT,
  screenshot_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_provider_id) REFERENCES task_providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS syntheses (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  final_answer TEXT NOT NULL,
  consensus_points_json TEXT NOT NULL,
  conflict_points_json TEXT NOT NULL,
  provider_summaries_json TEXT NOT NULL,
  follow_up_questions_json TEXT NOT NULL,
  method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_sessions (
  provider_id TEXT PRIMARY KEY,
  profile_path TEXT NOT NULL,
  storage_state_path TEXT,
  status TEXT NOT NULL,
  last_validated_at TEXT,
  last_login_at TEXT,
  last_error_message TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_provider_id TEXT,
  provider_id TEXT,
  level TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
`;

