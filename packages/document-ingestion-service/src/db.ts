import { Pool } from 'pg';

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

export type JobStatus = 'queued' | 'processing' | 'processed' | 'failed';

export interface JobRecord {
  jobid: string;
  status: JobStatus;
  filepath: string;
  originalname: string;
  mimetype: string;
  size: number;
  createdat: string;
  updatedat: string;
  resultdata: Record<string, unknown> | null;
  errorinfo: string | null;
}

export interface CreateJobPayload {
  jobId: string;
  filePath: string;
  originalName: string;
  mimetype: string;
  size: number;
}

export async function createJob(job: CreateJobPayload): Promise<void> {
  const now = new Date().toISOString();
  const query = `
    INSERT INTO jobs (jobId, status, filePath, originalName, mimetype, size, createdAt, updatedAt)
    VALUES ($1, 'queued', $2, $3, $4, $5, $6, $6)
    ON CONFLICT (jobId) DO UPDATE
      SET filePath = EXCLUDED.filePath, originalName = EXCLUDED.originalName,
          mimetype = EXCLUDED.mimetype, size = EXCLUDED.size, updatedAt = EXCLUDED.updatedAt;
  `;

  await pool.query(query, [job.jobId, job.filePath, job.originalName, job.mimetype, job.size, now]);
}

export async function getJobStatus(jobId: string): Promise<JobRecord | undefined> {
  const result = await pool.query('SELECT * FROM jobs WHERE jobId = $1', [jobId]);
  if (result.rowCount === 0) return undefined;
  return result.rows[0] as JobRecord;
}

export async function setJobProcessing(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, updatedAt = $2 WHERE jobId = $3', ['processing', now, jobId]);
}

export async function setJobProcessed(jobId: string, result: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, resultData = $2, updatedAt = $3 WHERE jobId = $4', [
    'processed',
    result,
    now,
    jobId
  ]);
}

export async function setJobFailed(jobId: string, error: string): Promise<void> {
  const now = new Date().toISOString();
  await pool.query('UPDATE jobs SET status = $1, errorInfo = $2, updatedAt = $3 WHERE jobId = $4', [
    'failed',
    error,
    now,
    jobId
  ]);
}

