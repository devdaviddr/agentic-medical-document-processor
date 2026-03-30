import dotenv from 'dotenv';
import { initRabbit, closeRabbit } from './queue';
import { setJobProcessing, setJobProcessed, setJobFailed } from './db';

dotenv.config({ path: '../../.env' });

const PROCESSING_DELAY_MS = Number(process.env.PROCESS_SIMULATE_DELAY_MS ?? 300);
const MAX_RETRIES = 12;

async function runWorker() {
  const { channel, queue } = await initRabbit();

  await channel.consume(
    queue,
    async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        const { jobId, filePath, originalName, mimetype } = payload;

        console.log(`Processing job ${jobId} with file ${originalName} (${mimetype})`);
        setJobProcessing(jobId);

        // TODO: implement actual download + OCR + Copilot SDK logic
        await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));

        const result = {
          jobId,
          status: 'processed',
          documentType: 'unspecified',
          extractedFields: {},
          processedAt: new Date().toISOString()
        };

        setJobProcessed(jobId, result);
        console.log('Job result', result);
        channel.ack(msg);
      } catch (err) {
        console.error('Failed processing message', err);
        channel.nack(msg, false, false); // move to dead-letter if configured
      }
    },
    { noAck: false }
  );

  console.log('Document Processor Service worker started and listening...');
}

async function startWorker() {
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

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down worker...');
  await closeRabbit();
  process.exit(0);
});

