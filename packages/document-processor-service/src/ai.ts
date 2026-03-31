import fs from 'fs/promises';
import { DocumentProcessingResult } from './types';

export async function extractTextFromPdf(filePath: string): Promise<string> {
  // TODO: replace this stub with real PDF text extraction (pdf-parse/pdfjs-dist)
  const raw = await fs.readFile(filePath, 'utf-8');
  return raw;
}

export async function analyzeDocumentWithAI(text: string, jobId: string): Promise<DocumentProcessingResult> {
  // TODO: Replace with real Copilot/LLM call.
  const extractedFields: Record<string, unknown> = {
    textLength: text.length,
    hasMedicalTerms: /patient|diagnosis|treatment/i.test(text)
  };

  return {
    jobId,
    status: 'processed',
    documentType: 'unspecified',
    extractedFields,
    processedAt: new Date().toISOString()
  };
}
