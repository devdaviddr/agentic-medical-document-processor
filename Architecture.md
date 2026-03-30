# Architecture Overview

This document describes the architecture of `agentic-medical-document-processor`.
It includes the Docker Compose setup, the ingestion service (`document-ingestion-service`),
the processing service (`document-processor-service`), and the RabbitMQ queue flow.

## Components

- `rabbitmq`: RabbitMQ message broker (management UI on 15672, AMQP on 5672)
- `document-ingestion-service`: Express API that accepts PDF uploads, persists job metadata in SQLite, and enqueues jobs in RabbitMQ.
  - `/api/documents/upload` (POST): accepts `multipart/form-data` with `file`.
  - `/api/documents/:jobId/status` (GET): returns status from SQLite jobs table.
- `document-processor-service`: worker that consumes RabbitMQ queue, updates SQLite status, and writes processing results.

## Environment

Common:
- `RABBITMQ_URL=amqp://rabbitmq`
- `SQLITE_DB_PATH=/data/jobs.db` (shared volume for job status)

Ingestion:
- `PORT=4000`

Processing:
- `PROCESS_SIMULATE_DELAY_MS=300`

## Diagram: request -> queue -> worker

```
+-------------------+      HTTP      +-----------------------+      AMQP      +----------------------+
| Client / UI       |  ---------->  | ingestion-service     |  ---------->  | RabbitMQ queue       |
| (upload PDF)      |               | (Express)             |               | document-processing  |
+-------------------+               +-----------------------+               +----------------------+
         |                                    |                                    |
         |                                    | 1. store job in SQLite jobs table    |
         |                                    |    status=queued                    |
         |                                    | 2. publish job message              |
         |                                    |    {jobId, filePath, ...}           |
         v                                    v                                    |
+-------------------+               +-----------------------+                  +----------------------+
| status poll       | <-----------> | ingestion-service     |                  | consumer(s)          |
| /api/documents/...|               | /api/documents/:id    |                  | document-processor   |
+-------------------+               +-----------------------+                  +----------------------+
                                                                              | 
                                                                              | consume + set status=processing
                                                                              | simulate OCR / processing
                                                                              | set status=processed + resultData
                                                                              | ack
                                                                              v
                                                                      +---------------------------+
                                                                      | SQLite jobs table         |
                                                                      | (shared / /data/jobs.db)  |
                                                                      +---------------------------+
```

## Detailed process steps

1. Client POSTs PDF to `/api/documents/upload` in `document-ingestion-service`.
2. Service stores file in `packages/document-ingestion-service/uploads` via `multer`.
3. Service creates a job record in SQLite `jobs` table with status `queued`.
4. Service publishes RabbitMQ message to queue `document-processing`.
5. `document-processor-service` bootstraps and connects to RabbitMQ.
6. Worker consumes one message at a time (`channel.consume`).
7. Worker sets `jobs.status = processing` and sleeps `PROCESS_SIMULATE_DELAY_MS` as placeholder work.
8. Worker writes result JSON to `jobs.resultData` and sets `status = processed`.
9. Worker acknowledges (`channel.ack`) RabbitMQ message; if error fallback `nack`.
10. Client polls `/api/documents/:jobId/status` to track progress.

## Helpful file references

- `docker-compose.yml`
- `packages/document-ingestion-service/src/app.ts`
- `packages/document-ingestion-service/src/queue.ts`
- `packages/document-ingestion-service/src/db.ts`
- `packages/document-processor-service/src/worker.ts`
- `packages/document-processor-service/src/queue.ts`
- `packages/document-processor-service/src/db.ts`

## Notes

- This architecture allows horizontal scaling of `document-processor-service` by running multiple instances.
- Shared `jobs.db` must be on a shared volume for all service nodes to read/write status. Docker Compose mounts `./data:/data` accordingly.
- `rabbitmq` healthcheck and `depends_on` ensure broker readiness before services start.
