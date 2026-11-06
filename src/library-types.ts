import type { Paper } from './types';

export type PdfJob = {
  id: string;
  documentId: string;
  filename: string;
  status: 'queued' | 'extracting' | 'ocr' | 'ready' | 'failed' | 'cancelled' | 'imported';
  createdAt: string;
  updatedAt?: string;
  currentPage?: number;
  pageCount?: number;
  ocrPages?: number;
  revision: number;
  document: NonNullable<Paper['document']>;
  warnings: string[];
  error?: string;
  draft?: Paper;
  pages?: { number: number; text: string; method: 'text' | 'ocr' }[];
  stats?: { questionCount: number; manualGraded: number; autoGraded: number };
  importedPaperId?: string;
};
export type Share = {
  id: string;
  title: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  paperCount: number;
};
export type SharePreview = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  expiresAt: string | null;
  papers: {
    id: string;
    title: string;
    questionCount: number;
    imported: boolean;
    document: { filename: string; pages: number; size: number };
  }[];
};
export const pdfStatus: Record<PdfJob['status'], string> = {
  queued: '排队中',
  extracting: '提取文字',
  ocr: 'OCR 识别',
  ready: '待校对',
  failed: '识别失败',
  cancelled: '已取消',
  imported: '已入库',
};
export const processingPdf = (job: PdfJob | null) =>
  Boolean(job && ['queued', 'extracting', 'ocr'].includes(job.status));
