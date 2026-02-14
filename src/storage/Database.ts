import Database from "better-sqlite3";

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      funnel_id   TEXT    NOT NULL,
      stage       TEXT    NOT NULL CHECK(stage IN ('impression','click','landing','lead','purchase')),
      count       INTEGER NOT NULL CHECK(count >= 0),
      source      TEXT    DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, funnel_id, stage, source)
    );

    CREATE INDEX IF NOT EXISTS idx_events_funnel_date
      ON events(funnel_id, date);

    CREATE INDEX IF NOT EXISTS idx_events_date
      ON events(date);

    CREATE TABLE IF NOT EXISTS changes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT    NOT NULL,
      funnel_id       TEXT    NOT NULL,
      category        TEXT    NOT NULL CHECK(category IN ('ad','site','external','tracking','pricing','audience')),
      description     TEXT    NOT NULL,
      severity        INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),
      affected_stages TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_changes_funnel_date
      ON changes(funnel_id, date);

    CREATE TABLE IF NOT EXISTS breaks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      funnel_id       TEXT    NOT NULL,
      from_stage      TEXT    NOT NULL,
      to_stage        TEXT    NOT NULL,
      detected_date   TEXT    NOT NULL,
      baseline_rate   REAL    NOT NULL,
      current_rate    REAL    NOT NULL,
      absolute_drop   REAL    NOT NULL,
      relative_drop   REAL    NOT NULL,
      z_score         REAL    NOT NULL,
      severity        TEXT    NOT NULL CHECK(severity IN ('warning','significant','critical')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(funnel_id, from_stage, to_stage, detected_date)
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      break_id          INTEGER NOT NULL REFERENCES breaks(id),
      diagnosis_status  TEXT    NOT NULL CHECK(diagnosis_status IN ('identified','uncertain','unknown')),
      summary           TEXT    NOT NULL,
      generated_at      TEXT    NOT NULL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cause_candidates (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnosis_id      INTEGER NOT NULL REFERENCES diagnoses(id),
      change_id         INTEGER REFERENCES changes(id),
      confidence        REAL    NOT NULL,
      temporal_score    REAL    NOT NULL,
      category_score    REAL    NOT NULL,
      severity_score    REAL    NOT NULL,
      stage_match_bonus REAL    NOT NULL,
      rank_position     INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cause_candidates_diagnosis
      ON cause_candidates(diagnosis_id);
  `);

  return db;
}
