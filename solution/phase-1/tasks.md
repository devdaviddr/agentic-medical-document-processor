# Phase 1 Task List for Agentic Medical Document Processor

## 1. Bootstrap repository

- [ ] Initialize project folders: `api`, `worker`, `shared`, `solution/phase-1`
- [ ] Create base `package.json` with TypeScript, ESLint, Prettier
- [ ] Add `README.md`, `solution/architecture.md`, and `solution/phase-1/architecture.md`

## 2. Deploy infrastructure

- [ ] Add `docker-compose.yml` for local dev: `redis`, `postgres` (or `mongo`), `api`, `worker`
- [ ] Setup `.env.example` with keys: `PORT`, `REDIS_URL`, `DB_URL`, `COPILOT_API_KEY`, `STORAGE_URL`
- [ ] Provision storage: local `uploads/` and optional `R2/S3` config

## 3. API implementation

- [ ] Create Express server in `api/src/app.ts`
- [ ] Implement `POST /api/documents/upload` multipart handling
- [ ] Upload file to storage and persist `DocumentJob` record in DB
- [ ] Enqueue BullMQ job in `document-processing` queue
- [ ] Implement `GET /api/documents/:id/status` and `GET /api/documents/:id/result`

## 4. Queue & BullMQ

- [ ] Create queue config in `api/src/queue.ts` and `worker/src/queue.ts`
- [ ] Configure retries (3 attempts), backoff, and failure handling
- [ ] Add event listeners: `completed`, `failed`, `stalled`, `progress`

## 5. Worker implementation

- [ ] Worker bootstrap: connect to Redis and queue
- [ ] Fetch job payload and download PDF from storage
- [ ] Extract text via OCR or PDF parser (minimal path: PDF text layer + optional OCR fallback)
- [ ] Chunk text for Copilot processing
- [ ] Implement Copilot SDK call (analysis/extraction/action plan)
- [ ] Normalize results to JSON schema and write to DB
- [ ] Update job status (`processing`, `completed`, `failed`)

## 6. Copilot SDK integration

- [ ] Create service `src/services/copilotAgent.ts`
- [ ] Implement prompt templates for `classification`, `extraction`, and `action recommendations`
- [ ] Parse Copilot output and map to structured schema
- [ ] Add validation and fallback when structure is invalid

## 7. Observability & monitoring

- [ ] Add logging (winston/pino) with request/job context
- [ ] Expose metrics for job counts and latencies
- [ ] Implement progress updates via `job.progress()`

## 8. Testing

- [ ] Add unit tests for upload API, queue enqueue, PDF parser, copilot service
- [ ] Add integration tests for end-to-end job lifecycle
- [ ] Add lint and typecheck commands

## 9. Deployment & docs

- [ ] Add phase1 runbook to `solution/phase-1/tasks.md` (this file)
- [ ] Create `Dockerfile` for API and worker
- [ ] Document Cloudflare worker usage, API security, and variables
- [ ] Document with `solution/phase-1/architecture.md`
