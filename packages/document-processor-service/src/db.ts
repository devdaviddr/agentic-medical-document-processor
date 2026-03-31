import { Pool } from 'pg';
import { DocumentProcessingResult } from './types';

const connectionString = process.env.POSTGRES_URL ?? 'postgres://postgres:postgres@postgres:5432/jobs';
const pool = new Pool({ connectionString });

const initDDL = `
CREATE TABLE IF NOT EXISTS jobs (
  jobId TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  filePath TEXT,
  originalName TEXT,
  mimetype TEXT,
  size INTEGER,
  createdAt TIMESTAMPTZ,
  updatedAt TIMESTAMPTZ,
  resultData JSONB,
  errorInfo TEXT
);
`;

async function initDb(): Promise<void> {
  await pool.query(initDDL);
}

initDb().catch((err) => {
  console.error('Failed to initialize PostgreSQL jobs table', err);
  process.exit(1);
});

export async function setJobProcessing(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, updatedAt = $2 WHERE jobId = $3', ['processing', now, jobId]);
}

export async function setJobProcessed(jobId: string, result: DocumentProcessingResult | Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, resultData = $2, updatedAt = $3 WHERE jobId = $4', [
    'processed',
    result,
    now,
    jobId
  ]);
}

export async function setJobFailed(jobId: string, error: string) {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, errorInfo = $2, updatedAt = $3 WHERE jobId = $4', [
    'failed',
    error,
    now,
    jobId
  ]);
}
