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
    await channel.prefetch(1);
  }

  return channel;
}

export async function closeRabbit(): Promise<void> {
  if (channel) {
    await channel.close();
    channel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
}
