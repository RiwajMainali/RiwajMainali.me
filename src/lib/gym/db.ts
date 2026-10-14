import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import catalogue from '../../data/gym-exercises.json';
export const dataDir = () =>
  path.resolve(
    process.env.GYM_DATA_DIR ?? path.join(process.cwd(), '.gym-data')
  );
let database: Database.Database | undefined;
export function db() {
  if (database) return database;
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  database = new Database(path.join(dataDir(), 'gym.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pairs(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts(user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exercises(id TEXT PRIMARY KEY, name TEXT NOT NULL, equipment TEXT NOT NULL, muscle TEXT NOT NULL, bodyPart TEXT NOT NULL, category TEXT NOT NULL, owner_id TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS exercise_search_preferences(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE, demoted INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id, exercise_id));
    CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), exercise_id TEXT NOT NULL REFERENCES exercises(id), content TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS entries_owner ON entries(user_id, exercise_id, created_at);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS media_owner ON media(user_id);
  `);
  const count = database
    .prepare('SELECT count(*) n FROM exercises WHERE owner_id IS NULL')
    .get() as { n: number };
  if (count.n !== catalogue.length) {
    const insert = database.prepare(
      'INSERT OR IGNORE INTO exercises(id,name,equipment,muscle,bodyPart,category) VALUES(@id,@name,@equipment,@muscle,@bodyPart,@category)'
    );
    database.transaction(() => {
      for (const e of catalogue) insert.run(e);
    })();
  }
  return database;
}
export type GymUser = {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
};
