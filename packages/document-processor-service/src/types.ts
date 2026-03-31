export interface DocumentJobPayload {
  jobId: string;
  filePath: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt?: string;
}

export interface DocumentProcessingResult {
  jobId: string;
  status: 'processed' | 'failed';
  documentType: string;
  extractedFields: Record<string, unknown>;
  processedAt: string;
  errors?: string[];
}

export type JobStatus = 'queued' | 'processing' | 'processed' | 'failed';

export interface JobRecord {
  jobid: string;
  status: JobStatus;
  filepath: string;
  originalname: string;
  mimetype: string;
  size: number;
  createdat: string;
  updatedat: string;
  resultdata: DocumentProcessingResult | null;
  errorinfo: string | null;
}
