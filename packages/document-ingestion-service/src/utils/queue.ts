import * as amqplib from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq';
const QUEUE_NAME = 'document-processing';

let connection: amqplib.ChannelModel | null = null;
let channel: amqplib.Channel | null = null;

export async function initRabbit(): Promise<amqplib.Channel> {
  if (!connection) {
    connection = await amqplib.connect(RABBITMQ_URL);
  }

  if (!channel) {
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
  }

  return channel;
}

export async function enqueueDocumentJob(payload: object): Promise<boolean> {
  const ch = await initRabbit();
  const body = Buffer.from(JSON.stringify(payload));
  return ch.sendToQueue(QUEUE_NAME, body, { persistent: true });
}

export async function closeRabbit(): Promise<void> {
  if (channel) await channel.close();
  if (connection) await connection.close();
}
