import dotenv from 'dotenv';
import * as amqplib from 'amqplib';
import { initRabbit, closeRabbit } from './utils/queue';
import { setJobProcessing, setJobProcessed, setJobFailed } from './utils/db';
import { extractTextFromPdf, analyzeDocumentWithAI } from './ai';
import { DocumentJobPayload, DocumentProcessingResult } from './types';

dotenv.config({ path: '../../.env' });

const MAX_RETRIES = 12;

async function processJob(payload: DocumentJobPayload): Promise<void> {
  const { jobId, filePath, originalName, mimetype } = payload;
  console.log(`Processing job ${jobId} with file ${originalName} (${mimetype})`);

  await setJobProcessing(jobId);

  const text = await extractTextFromPdf(filePath);
  const aiResult: DocumentProcessingResult = await analyzeDocumentWithAI(text, jobId);

  await setJobProcessed(jobId, aiResult);

  console.log('Job result', aiResult);
}

async function runWorker(): Promise<void> {
  const channel = await initRabbit();

  await channel.consume(
    'document-processing',
    async (msg: amqplib.ConsumeMessage | null) => {
      if (!msg) return;
      let jobId: string | null = null;
      try {
        const payload = JSON.parse(msg.content.toString()) as DocumentJobPayload;
        jobId = payload.jobId;

        if (!jobId) throw new Error('Message missing jobId');
        await processJob(payload);

        channel.ack(msg);
      } catch (err) {
        console.error('Failed processing message', err);
        if (jobId) {
          await setJobFailed(jobId, String(err));
        }
        channel.nack(msg, false, false); // move to dead-letter if configured
      }
    },
    { noAck: false }
  );

  console.log('Document Processor Service worker started and listening...');
}

async function startWorker(): Promise<void> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await runWorker();
      return;
    } catch (err: unknown) {
      attempt += 1;
      const delayMs = Math.min(1000 * attempt, 10000);
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`RabbitMQ connect failed (attempt ${attempt}/${MAX_RETRIES}). retrying in ${delayMs}ms...`, message);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  console.error('Exceeded maximum RabbitMQ connection retries. Exiting.');
  process.exit(1);
}

startWorker();

const shutdown = async (signal: string) => {
  console.log(`Gracefully shutting down worker (${signal})...`);
  await closeRabbit();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));


