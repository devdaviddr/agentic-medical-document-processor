# Agentic Medical Document Processor

A robust solution for ingesting medical PDFs, analyzing content with GitHub Copilot SDK, and executing task workflows based on computed logic.

## 🚀 About

`Agentic Medical Document Processor` takes scanned or digital medical documents (PDFs), extracts text, uses AI-driven reasoning via GitHub Copilot SDK to determine next steps, and executes actions through a queued worker pipeline.

Tech stack:
- React + TypeScript (frontend)
- Express + TypeScript (backend)
- RabbitMQ (message queue, `document-processing` queue)
- PostgreSQL (job state store) via `pg`
- GitHub Copilot SDK (AI-driven instruction / action composition)
- Docker (container builds)
- Cloudflare (edge, CDN, routing, security)

## 📦 Features

- PDF upload endpoint with multipart/form-data support
- OCR and structured extraction from medical PDFs
- Document classification (e.g., lab report, discharge summary, clinical note)
- Action inference using Copilot SDK: summarize, triage risk, generate follow-up items, route alerts
- RabbitMQ job queue for resiliency/scaling (replace prior BullMQ approach)
- Worker process for detached, reliable processing
- API for status, result retrieval, and job management
- Dashboard with job and results view

## 🏗️ Architecture

1. Client uploads PDF to `document-ingestion-service` (`/api/documents/upload`)
2. Ingestion service stores file and writes job row to PostgreSQL `jobs` table (`status=queued`)
3. Ingestion service publishes RabbitMQ message to `document-processing` queue
4. `document-processor-service` consumer dequeues job, updates `status=processing`, runs OCR/Copilot logic, updates PostgreSQL `status=processed` + results
5. Client polls `/api/documents/:jobId/status` and receives final output
6. Optional notifications / audit trail / downstream integration

### Architecture Diagram (ASCII)

```
+----------+     +---------+     +---------------------------+     +----------------------+
| Browser  | --> | Frontend| --> | document-ingestion-service | --> | RabbitMQ queue      |
| (React)  |     | (React) |     | (Express)                 |     | document-processing |
+----------+     +---------+     +---------------------------+     +----------------------+
                                                      |                      |
                                                      |                      v
                                                      |             +----------------------+ 
                                                      |             | document-processor-  |
                                                      |             | service             |
                                                      |             +----------------------+ 
                                                      v                      |
                                                +----------------------+   |
                                                | PostgreSQL jobs table| <---
                                                +----------------------+
```

## ⚙️ Getting Started

1. Clone repo:

```bash
git clone https://github.com/<org>/agentic-medical-document-processor.git
cd agentic-medical-document-processor
```

2. Install dependencies:

```bash
npm install
```

3. Copy `.env` template:

```bash
cp .env.example .env
```

4. Set environment variables:

- `PORT=4000`
- `QUEUE_REDIS_URL=redis://localhost:6379`
- `GITHUB_COPILOT_SDK_KEY=...`
- `CLOUD_FLARE_ACCOUNT_ID=...`
- `CLOUD_FLARE_API_TOKEN=...`
- `STORAGE_URL`, `DB_URL`, etc.

## 🧪 Local Development

- Start Redis:

```bash
docker run --name amp-redis -d -p 6379:6379 redis:7
```

- Run backend:

```bash
npm --prefix backend run dev
```

- Run frontend:

```bash
npm --prefix frontend run dev
```

- Run queue worker:

```bash
npm --prefix worker run dev
```

## 📡 API Endpoints

- `POST /api/documents/upload` (file upload)
- `GET /api/documents/:id/status`
- `GET /api/documents/:id/result`
- `GET /api/documents` (list with filters)

### Upload example

```bash
curl -F "file=@sample.pdf" http://localhost:4000/api/documents/upload
```

## 🤖 Copilot SDK Logic

- Encapsulated in `src/services/copilot.ts` (or similar)
- Core functions:
  - `analyzeDocumentText(documentText)`
  - `determineActions(parsedData)`
  - `createCopilotExecutionPlan(intent, data)`
- Prompts hold: extraction templates, compliance checks, medical context.

## 🐂 Queue + Worker

- Queue name: `agentic-med-doc-analysis`
- Worker retries: 3 attempts with backoff
- Events: `completed`, `failed`, `stalled`, `progress`

## 🐳 Docker

- `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`
- Local compose includes app, redis, optional postgres/mongo

### Docker Compose run + test URLs

1. Start services:

```bash
docker compose up --build
```

2. Upload a file (replace with your local test file):

```bash
curl -X POST -F file=@test.pdf http://localhost:4000/api/documents/upload
```

3. Check job status (replace `<jobId>` with response ID):

```bash
curl http://localhost:4000/api/documents/<jobId>/status
```

4. Health check:

```bash
curl http://localhost:4000/health
```

## ☁️ Cloudflare

- Use Cloudflare Workers or Pages
- Store artifacts in R2
- Protect API with Cloudflare Access and WAF rules

## 🧹 Testing

- Unit tests: `npm run test`
- Lint: `npm run lint`
- Type: `npm run typecheck`

## 🔒 Security & Compliance

- Encrypt PDFs at rest
- Use HTTPS for uploads
- Signed access tokens for storage
- Audit log each document action
- Follow HIPAA best practices (PII, retention, secure audit trail)

## 🤝 Contributing

1. Fork + branch naming: `feature/` or `bugfix/`
2. Open PR with description, test plan, and validations
3. Ensure all tests and lint pass
4. Use conventional commits

## 📄 License

MIT (or whatever license your org prefers)

