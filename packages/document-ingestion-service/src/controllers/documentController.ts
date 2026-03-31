import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createDocumentJob, fetchJobStatus } from '../services/documentService';

export async function handleUpload(req: Request, res: Response): Promise<Response> {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const jobId = uuidv4();

  try {
    await createDocumentJob({
      jobId,
      filePath: req.file.path,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    });

    return res.status(202).json({ jobId, status: 'queued' });
  } catch (error) {
    console.error('Upload or queue error:', error);
    return res.status(500).json({ error: 'Failed to create or queue job' });
  }
}

export async function handleStatus(req: Request, res: Response): Promise<Response> {
  const job = await fetchJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({
    jobId: job.jobid,
    status: job.status,
    filePath: job.filepath,
    originalName: job.originalname,
    mimetype: job.mimetype,
    size: job.size,
    createdAt: job.createdat,
    updatedAt: job.updatedat,
    resultData: job.resultdata || null,
    errorInfo: job.errorinfo || null
  });
}
