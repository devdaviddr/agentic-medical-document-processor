import Database from 'better-sqlite3';

const dbPath = process.env.SQLITE_DB_PATH ?? '/data/jobs.db';
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  jobId TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  filePath TEXT,
  originalName TEXT,
  mimetype TEXT,
  size INTEGER,
  createdAt TEXT,
  updatedAt TEXT,
  resultData TEXT,
  errorInfo TEXT
);
`);

export function setJobProcessing(jobId: string) {
  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, updatedAt = ? WHERE jobId = ?').run('processing', now, jobId);
}

export function setJobProcessed(jobId: string, result: object) {
  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, resultData = ?, updatedAt = ? WHERE jobId = ?')
    .run('processed', JSON.stringify(result), now, jobId);
}

export function setJobFailed(jobId: string, error: string) {
  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, errorInfo = ?, updatedAt = ? WHERE jobId = ?')
    .run('failed', error, now, jobId);
}
