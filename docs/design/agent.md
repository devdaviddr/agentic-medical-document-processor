
# Medical PDF Intake Agent

## Goals

- Accept PDF file input from a sequential, random-order stream
- Extract text + structure (pages, sections) via OCR or PDF extraction
- **Determine which patient each document belongs to** (new)
- Use GitHub Copilot SDK for classification, extraction, patient resolution, and action inference
- Assemble a chronological patient timeline across all arriving documents (new)
- Return structured JSON, job status, and action recommendations

---

## Data Flow

```
[User Browser]
      |
      | POST /api/documents/upload
      v
[Express API]
      |-- save PDF ---------> [S3/R2]
      |-- create job -------> [BullMQ queue]
      v
[Worker]
      |-- fetch PDF --------- [S3/R2]
      |-- OCR/text extract -- [Text Chunks]
      |
      |-- Phase 1: Classify document type
      |-- Phase 2: Patient Resolution (NEW)
      |        |-- Extract patient signals (Copilot)
      |        |-- Lookup / fuzzy match registry
      |        |-- MATCHED | PROVISIONAL | UNRESOLVED
      |
      |-- Phase 3: Clinical field extraction (Copilot)
      |-- Phase 4: Risk + action inference (timeline-aware) (Copilot)
      |-- Save document record --> [DB]
      |
      |-- Phase 5: Timeline Assembly (NEW, per-patient)
      |        |-- Load all patient docs
      |        |-- Sort by encounter.date
      |        |-- Deduplication + conflict detection (Copilot)
      |        |-- Upsert patient timeline --> [DB]
      |
      v
[API status/result endpoints]
      |
      +--> [Client UI]  (job status / extracted fields / timeline / actions)
      +--> [Webhooks]
```

---

## Agent Processing Pipeline

```
[Worker pulls job]
      |
      v
[Download PDF from S3/R2]
      |
      v
[OCR / text extraction]
   Native text layer first → OCR fallback (Tesseract / AWS Textract)
      |
      v
[Layout-aware chunking]
   Preserves tables, section headers, page boundaries
      |
      v
[Phase 1 — Classification]
   Copilot call → documentType + confidence
   confidence < 0.7 → flag for human pre-review
      |
      v
[Phase 2 — Patient Resolution]   ◄── NEW
   Copilot call → PatientSignals (name variants, DOB, MRN, insurance ID, facility)
   Registry lookup:
     MRN exact match         → MATCHED (confidence 1.0)
     Fuzzy name+DOB ≥ 0.85   → MATCHED
     Fuzzy name+DOB 0.6–0.85 → PROVISIONAL (human confirmation queued)
     < 0.6 or no signals     → UNRESOLVED (manual review)
      |
      v
[Phase 3 — Clinical Field Extraction]
   Copilot call with patient context injected
   Extracts: diagnoses (ICD-10), medications, labs, encounter, riskFlags, recommendations
   Validation prompt checks required fields and schema conformity
      |
      v
[Phase 4 — Action & Risk Inference]
   Copilot call with current fields + patientTimelineSummary   ◄── EXTENDED
   Cross-document reasoning: medication conflicts, allergy flags, lab trends
      |
      v
[Save document result → DB]
[Update job status]
      |
      v
[Phase 5 — Timeline Assembly]   ◄── NEW (non-blocking, per-patient)
   Load all documents for resolved patient
   Sort by encounter.date
   Deduplication (hash + semantic similarity)
   Conflict detection (Copilot)
   Gap detection (missing expected document types)
   Upsert patientTimeline → DB
      |
      v
[Trigger webhooks / notifications]
```

---

## Patient Resolution Layer

### The Problem

Documents arrive in random order and may carry:
- No MRN (handwritten notes, legacy scans)
- Misspelled or abbreviated names ("J Smith" vs "John R. Smith")
- Non-standard DOB formats ("01/03/1978" vs "March 1, 1978")
- No identifying information at all

### Resolution State Machine

```
Incoming document
      |
      v
Extract patient signals (Copilot)
      |
      ├─ MRN found? ──── YES ──► Exact registry lookup
      │                                 │
      │                          FOUND ─► MATCHED (score 1.0)
      │                         NOT FOUND ► create new patient
      │
      └─ No MRN ────────────────► Fuzzy name + DOB match
                                        │
                              score ≥ 0.85 ──► MATCHED
                           0.6 ≤ score < 0.85 ──► PROVISIONAL
                              score < 0.6 ──────► UNRESOLVED
```

### PatientSignals (extracted by Copilot)

```typescript
interface PatientSignals {
  // Strong identifiers (deterministic match)
  mrn?: string;
  insuranceId?: string;
  ssn_last4?: string;

  // Weak identifiers (fuzzy match)
  nameVariants: string[];    // All forms: "John Smith", "SMITH, JOHN R", "J Smith"
  dob?: string;              // Normalised to YYYY-MM-DD
  dobRaw?: string;           // Original string before normalisation

  // Contextual signals
  facility?: string;
  provider?: string;
  address?: string;
  phone?: string;
  email?: string;

  // Metadata
  extractionConfidence: number;   // 0–1
  signalCount: number;
}
```

### Fuzzy Matching Weights

| Signal | Method | Weight | Notes |
|---|---|---|---|
| MRN | Exact | 1.0 (hard match) | Overrides all other signals |
| Last name + DOB | Jaro-Winkler + exact DOB | 0.70 | Handles typos, name changes |
| First + last name | Jaro-Winkler | 0.35 | Boosts other signals; never sufficient alone |
| DOB only | Exact after normalisation | 0.25 | Never sufficient alone |
| Insurance ID | Exact | 0.60 | Strong if available |
| Facility + provider | Normalised string match | 0.10 | Tiebreaker only |

### Resolution Outcomes

| Status | Condition | Action |
|---|---|---|
| `MATCHED` | High-confidence link to existing patient | Continue pipeline normally |
| `PROVISIONAL` | Partial or low-confidence match | Link to provisional patient; queue human confirmation |
| `UNRESOLVED` | No usable signals | Save document unlinked; queue for manual patient assignment |

### Retroactive Resolution

When a MATCHED document arrives for a patient who has existing PROVISIONAL documents
in the same date/facility window, a `retroactiveResolve` background job:

1. Loads all PROVISIONAL `document_patient_links` for the provisional patient
2. Re-evaluates each against the confirmed patient
3. Migrates confirmed links; deletes provisional patient record if empty

---

## Timeline Assembler

Runs as **Phase 5** after every document is saved. Non-blocking — document processing
succeeds regardless of whether timeline assembly succeeds.

### Operations

1. **Load** all documents linked to the resolved patient from DB
2. **Sort** by `encounter.date` ascending (falls back to `processingMeta.processedAt`)
3. **Deduplication** — hash-based exact check first; semantic similarity check via Copilot for near-duplicates
4. **Conflict detection** — Copilot prompt comparing diagnoses, medications, and lab values across the timeline
5. **Gap detection** — infers missing expected document types given the care sequence
   (e.g., discharge summary present but no preceding admission note)
6. **Upsert** `patient_timelines` record in DB
7. **Trigger webhooks** for high/critical conflicts

### Conflict Severity Levels

| Severity | Example |
|---|---|
| `low` | Slightly different medication dose recorded in two notes |
| `medium` | Lab value trending abnormally across encounters |
| `high` | Contradictory diagnosis status (e.g., "resolved" vs "active") |
| `critical` | Medication prescribed that contradicts a known allergy |

---

## Copilot Prompt Strategy

### Prompt 1 — Classification (Unchanged)

```
You are a medical document classifier.
Given the following extracted text from a PDF, identify:
1. documentType: one of [discharge_summary, lab_report, clinical_note,
   prescription, radiology_report, referral_letter, other]
2. confidence: 0.0–1.0
3. classificationRationale: brief reason

Respond ONLY with valid JSON matching this schema.
***
DOCUMENT TEXT:
{{chunks[0..3]}}
```

### Prompt 2 — Patient Signal Extraction (New)

```
You are a medical record identity extractor.
From the text below, extract ALL possible patient identifiers.
Be exhaustive — include partial, ambiguous, or formatted variants.
Return every name form you encounter (e.g., "John Smith", "SMITH, JOHN R", "J Smith").
Normalise date of birth to YYYY-MM-DD where possible.

Return ONLY valid JSON matching PatientSignals schema.
extractionConfidence: your confidence that signals are correct (0.0–1.0).
***
DOCUMENT TEXT:
{{fullText}}
```

### Prompt 3 — Clinical Extraction (Extended)

```
You are a clinical data extraction agent.
Extract all medical data from the document below into strict JSON.
Document type: {{documentType}}
Patient context (resolved): {{patientContext}}   <-- NEW: injected from PatientResolver

Extract: diagnoses (with ICD-10 if determinable), medications (name/dose/freq),
labs (test/value/unit/flag), encounter date/provider/facility,
recommendations, riskFlags.

Respond ONLY with valid JSON. Mark uncertain fields with _uncertain: true.
***
DOCUMENT TEXT:
{{chunks}}
```

### Prompt 4 — Action Inference (Extended)

```
You are a clinical action planner for a medical workflow system.
Given the newly extracted document data AND the patient's existing medical timeline,
recommend follow-up actions, alerts, and clinical flags.

IMPORTANT: Cross-reference medications, allergies, diagnoses across the full timeline.
Flag: medication conflicts, abnormal lab trends, missing follow-ups, high-risk diagnoses.

Current document data: {{extractedFields}}
Patient timeline summary: {{timelineSummary}}   <-- NEW

Return actions as [{type, priority, payload, rationale}].
Respond ONLY with valid JSON.
```

### Prompt 5 — Timeline Conflict Detection (New)

```
You are a medical timeline conflict detector.
Review the following ordered list of medical documents for a single patient.
Identify:
1. Duplicate documents (same encounter, same content)
2. Conflicting diagnoses (same condition, contradictory status)
3. Medication conflicts (contradictory prescriptions, dose changes without context)
4. Missing expected documents (e.g., discharge summary without preceding admission note)
5. Temporal anomalies (document dates inconsistent with care sequence)

Return: [{type, documentIds, description, severity: low|medium|high|critical}]
TIMELINE:
{{orderedDocuments}}
```

---

## Component Map

### src/agents/

```
documentParser.ts       — original, extended
  ├─ initCopilotClient()
  ├─ parseDocument(pdfUrl)
  ├─ evaluateActionPlan(structuredData, timelineSummary)   ← extended
  └─ buildContextBundle(patientResolution, timeline)       ← new

patientResolver.ts      ← NEW
  ├─ extractPatientSignals(text): PatientSignals
  ├─ resolvePatient(signals, registry): PatientResolutionResult
  ├─ mergeOrCreatePatient(result): Patient
  └─ retroactiveResolve(confirmedPatientId): void

timelineAssembler.ts    ← NEW
  ├─ assembleTimeline(patientId): PatientTimeline
  ├─ detectConflicts(timeline): TimelineConflict[]
  ├─ detectDuplicates(timeline): DuplicateResult[]
  ├─ detectGaps(timeline): GapResult[]
  └─ saveTimeline(patientId, timeline): void
```

### src/services/

```
ocr.ts                  — unchanged
  ├─ extractTextFromPdf(pdfPath)
  └─ splitIntoChunks(text)

copilot.ts              — extended
  ├─ buildPrompt(documentText, context)
  ├─ invokeCopilot(prompt, context)
  └─ validateSchema(result)

patientRegistry.ts      ← NEW
  ├─ findByMRN(mrn): Patient | null
  ├─ fuzzyMatchByName(nameVariants, dob): MatchResult[]
  ├─ createProvisionalPatient(signals): Patient
  ├─ confirmProvisional(provisionalId, confirmedPatientId): void
  └─ mergePatientRecords(sourceId, targetId): void
```

---

## JSON Output Schema

```json
{
  "documentId": "string",
  "documentType": "discharge_summary|lab_report|clinical_note|prescription|radiology_report|referral_letter|other",
  "classificationConfidence": 0.95,

  "patientResolution": {
    "status": "MATCHED|PROVISIONAL|UNRESOLVED",
    "patientId": "string | null",
    "confidence": 0.92,
    "matchedOn": ["mrn", "name", "dob"],
    "provisionalId": "string | null",
    "requiresHumanConfirmation": false
  },

  "patient": {
    "name": "string",
    "dob": "YYYY-MM-DD",
    "mrn": "string",
    "nameVariants": ["string"]
  },

  "encounter": {
    "date": "YYYY-MM-DD",
    "provider": "string",
    "facility": "string"
  },

  "diagnoses": [
    { "code": "string", "description": "string", "_uncertain": false }
  ],
  "medications": [
    { "name": "string", "dose": "string", "freq": "string" }
  ],
  "labs": [
    { "test": "string", "value": "string", "unit": "string", "flag": "High|Low|Normal" }
  ],
  "recommendations": ["string"],
  "riskFlags": ["string"],

  "timelinePosition": {
    "sequenceIndex": 3,
    "totalDocuments": 5,
    "precedingDocumentId": "string | null",
    "followingDocumentId": "string | null",
    "encounterGaps": ["string"]
  },

  "actions": [
    {
      "type": "flag_medication|open_ticket|notify_team|request_review|alert_provider",
      "priority": "low|medium|high|critical",
      "payload": {},
      "rationale": "string",
      "crossDocumentTrigger": true
    }
  ],

  "processingMeta": {
    "jobId": "string",
    "processedAt": "ISO-8601",
    "ocrUsed": false,
    "copilotInvocations": 4,
    "timelineAssembledAt": "ISO-8601"
  }
}
```

---

## Database Schema Additions

```sql
-- Patient identity store
CREATE TABLE patients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mrn            VARCHAR UNIQUE,
  name_canonical VARCHAR NOT NULL,
  dob            DATE,
  status         VARCHAR DEFAULT 'active', -- active | provisional | merged
  merged_into    UUID REFERENCES patients(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- All name variants seen across documents
CREATE TABLE patient_name_aliases (
  patient_id    UUID REFERENCES patients(id) ON DELETE CASCADE,
  name_variant  VARCHAR NOT NULL,
  source_doc_id UUID,
  PRIMARY KEY (patient_id, name_variant)
);

-- Document ↔ patient resolution record
CREATE TABLE document_patient_links (
  document_id           UUID REFERENCES documents(id),
  patient_id            UUID REFERENCES patients(id),
  resolution_status     VARCHAR NOT NULL, -- MATCHED | PROVISIONAL | UNRESOLVED
  resolution_confidence FLOAT,
  matched_on            JSONB,            -- e.g. ["mrn","name","dob"]
  linked_at             TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id)
);

-- Assembled timeline per patient
CREATE TABLE patient_timelines (
  patient_id      UUID REFERENCES patients(id) PRIMARY KEY,
  ordered_doc_ids UUID[],
  conflicts       JSONB,  -- TimelineConflict[]
  gaps            JSONB,  -- GapResult[]
  last_assembled  TIMESTAMPTZ
);
```

---

## Error Handling & Retry

| Scenario | Response | Job Status |
|---|---|---|
| PDF ingest failure | Reject at upload (400). Log + notify. | `failed` |
| OCR timeout | Retry ×2 with exponential backoff. | `processing` |
| Copilot timeout | Retry ×2. On 3rd failure → manual review. | `requires_manual_review` |
| Classification confidence < 0.7 | Continue with low-confidence flag; queue for human review. | `low_confidence` |
| Missing mandatory fields | Return partial data with field-level error markers. | `requires_manual_review` |
| Patient resolution = UNRESOLVED | Document saved unlinked. Entered into manual patient-linking queue. | `patient_unresolved` |
| Patient resolution = PROVISIONAL | Document linked to provisional patient. Human confirmation queued. | `provisional_patient` |
| Timeline conflict detected | Conflicts stored in DB. High/critical severity triggers webhook + human review task. | `timeline_conflict` |
| Timeline assembly failure | Document processing still succeeds. Assembly retried on next document for that patient. Non-blocking. | document: `complete`, timeline: `pending` |
| Duplicate document detected | Flagged as duplicate. Original kept. No data overwrite. | `duplicate` |

> **Key principle:** Timeline Assembly failure never blocks document processing.
> Documents always save successfully to DB.

