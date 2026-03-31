import { enqueueDocumentJob } from '../utils/queue';
import { createJob, getJobStatus, JobRecord } from '../utils/db';

export interface JobPayload {
  jobId: string;
  filePath: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt?: string;
}

export async function createDocumentJob(payload: JobPayload): Promise<void> {
  await createJob({
    jobId: payload.jobId,
    filePath: payload.filePath,
    originalName: payload.originalName,
    mimetype: payload.mimetype,
    size: payload.size
  });

  await enqueueDocumentJob(payload);
}

export async function fetchJobStatus(jobId: string): Promise<JobRecord | undefined> {
  return getJobStatus(jobId);
}
