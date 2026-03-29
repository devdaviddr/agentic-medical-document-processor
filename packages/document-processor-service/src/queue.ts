import * as amqplib from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq';
const QUEUE_NAME = 'document-processing';

let connection: amqplib.ChannelModel | null = null;
let channel: amqplib.Channel | null = null;

export async function initRabbit() {
  if (!connection) {
    connection = await amqplib.connect(RABBITMQ_URL);
  }

  if (!channel) {
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
  }

  return { connection, channel, queue: QUEUE_NAME };
}

export async function closeRabbit() {
  if (channel) {
    await channel.close();
    channel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
}

