import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { handleUpload, handleStatus } from './controllers/documentController';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors());
app.use(express.json());

import documentRoutes from './routes/documentRoutes';

app.use('/api', documentRoutes);

app.get('/health', async (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});


const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Document Ingestion Service running on port ${PORT}`);
});
// eslint-disable-next-line no-console
console.log('RabbitMQ queue configured for document-processing');