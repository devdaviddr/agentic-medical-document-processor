import dotenv from 'dotenv';
import { initRabbit, closeRabbit } from './queue';

dotenv.config({ path: '../../.env' });

const PROCESSING_DELAY_MS = Number(process.env.PROCESS_SIMULATE_DELAY_MS ?? 300);

async function startWorker() {
  const { channel, queue } = await initRabbit();

  await channel.consume(queue, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      const { jobId, filePath, originalName, mimetype } = payload;

      console.log(`Processing job ${jobId} with file ${originalName} (${mimetype})`);
      // TODO: implement actual download + OCR + Copilot SDK logic
      await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));

      const result = {
        jobId,
        status: 'processed',
        documentType: 'unspecified',
        extractedFields: {},
        processedAt: new Date().toISOString()
      };

      console.log('Job result', result);
      channel.ack(msg);
    } catch (err) {
      console.error('Failed processing message', err);
      channel.nack(msg, false, false); // move to dead-letter if configured
    }
  }, { noAck: false });

  console.log('Document Processor Service worker started and listening...');
}

startWorker().catch((err) => {
  console.error('Worker startup failed', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down worker...');
  await closeRabbit();
  process.exit(0);
});

