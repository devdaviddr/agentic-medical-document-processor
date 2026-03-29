# Agentic Document Processing Pipeline Architecture

This document defines the BullMQ pipeline for `Agentic Medical Document Processor` and how to process medical PDFs with GitHub Copilot SDK.

## 1. Goals

- Ingest PDF medical documents safely and asynchronously
- Use BullMQ queues for resilient job orchestration
- Use the GitHub Copilot SDK for content analysis and structured extraction
- Enable retries and dead-letter handling for failures
- Persist results in DB and provide status updates through API

## 2. Components

- API Server (Express + TypeScript)
- File Store (S3, Cloudflare R2, local file system)
- BullMQ queues (Redis)
- Worker service (Node + TypeScript)
- GitHub Copilot SDK integration module
- Database (Postgres/Mongo)

## 3. High-level flow

1. Client uploads PDF to API endpoint `POST /api/documents/upload`
2. API stores file URL/metadata and creates a `DocumentJob` record (status: `queued`)
3. API enqueues message in BullMQ queue `document-processing`:
   - `{ jobId, documentUrl, userId, metadata }`
4. Worker consumes `document-processing` jobs
5. Worker steps:
   a. Download PDF from storage
   b. Extract text using OCR or PDF parser
   c. chunk text for Copilot token limits
   d. Call Copilot SDK with prompt template
   e. Normalize output into structured JSON
   f. Save extracted output + `analysis` and update job status `completed`/`failed`

### Pipeline ASCII diagram

```
[Client] --> [Express API] --> [BullMQ-document-processing queue]
                 |                  |
                 v                  v
            [S3/R2 storage]      [Worker] --> [OCR/pdf extractor]
                                       |             |
                                       v             v
                                  [Text chunks] --> [Copilot SDK]
                                       |             |
                                       v             v
                                  [Structured output] --> [Database]
                                       |
                                       v
                                 [API status/result]
```

## 4. Queue topology

- Primary queue: `document-processing`
- Retry queue: BullMQ built-in retry behavior with 2 retry attempts and exponential backoff
- Dead-letter: track in `failed-jobs` list or `document-processing:failed` queue
- Event subscriptions: `completed`, `failed`, `progress` for monitoring and webhook/notification triggers

## 5. Job payload schema

```json
{
  "jobId": "string",
  "documentId": "string",
  "documentUrl": "string",
  "userId": "string",
  "source": "upload|webhook|batch",
  "metadata": {
    "contentType": "application/pdf",
    "filesize": 123456,
    "patientId": "string",
    "provider": "string"
  }
}
```

## 6. Worker processing details

- Stage 1: Download / retrieve PDF
- Stage 2: OCR (e.g., `tesseract`, `pdfjs`, `ocr.space`, or `AWS Textract`)
- Stage 3: Text split
  - Flow:
    - `splitOnPageBoundaries(text)`
    - `splitOnSectionHeadings(textChunk)`
- Stage 4: Copilot SDK call
  - Input fields:
    - `documentText` (chunk string)
    - `documentMeta` (type, source, transactionId)
  - Prompts:
    - classification prompt
    - extraction prompt (structured JSON)
    - action generation prompt
- Stage 5: Merge structured chunks and resolve dedup
- Stage 6: Persist results, set job status

## 7. Copilot SDK agent draft

- `src/services/copilotAgent.ts`
  - `analyzeDocument(documentText: string)`
  - `createPrompt(payload)`
  - `invokeCopilot(prompt)`
  - `validateResult(result)`

- `src/agents/documentParser.ts`
  - `processDocument(jobPayload)`
  - `operatePipeline` orchestrates steps and handles failures

## 8. Error and retry logic

- For transient errors (network, Copilot timeout, Redis disconnect) retry 3x with exponential backoff 30/60/120 seconds
- For permanent errors (invalid PDF, unsupported format), set job status `failed` and record `errorDetails`
- On repeated failures (>=3), send event to `document-processing:failed` and optionally trigger a human/manual review queue

## 9. Observability

- Log each job transition (queued -> processing -> completed/failed)
- `job.progress(x)` for stage-tracking in BullMQ
- Send metrics: `document.processed`, `document.failed`, `copilot.latency`, `ocr.latency`
- Optional: wire into Prometheus + Grafana or Datadog

## 10. Deployment notes

- Use Docker Compose for local: `app`, `worker`, `redis`, `db`
- For production, separate worker horizontally scaled containers with `CONCURRENCY` env
- Use Cloudflare for edge upload + API protections

## 11. Security and compliance

- Encrypted at-rest + in-transit for documents
- Access role checks before job enqueue and retrieval
- PII redaction in logs
- Retention policies and soft-delete for PHI documents
