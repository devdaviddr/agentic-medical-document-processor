import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { enqueueDocumentJob } from './queue';
import { createJob, getJobStatus, JobRecord } from './db';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: './uploads/' });

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await createJob({
    jobId,
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });

  await enqueueDocumentJob({
    jobId,
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  });

  return res.status(202).json({ jobId, status: 'queued' });
});

app.get('/api/documents/:jobId/status', async (req, res) => {
  const job = await getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const response = {
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
  };

  return res.json(response);
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Document Ingestion Service running on port ${PORT}`);
});
// eslint-disable-next-line no-console
console.log('RabbitMQ queue configured for document-processing');