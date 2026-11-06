export const PAGE_WIDTH = 720;
export const NOTE_COLORS = ['#25352e', '#246b56', '#ba4d42', '#3869ab', '#e4bc3e'] as const;
export type InkPoint = [number, number, number];
export type InkStroke = {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;
  pressure: boolean;
  points: InkPoint[];
};
export type Annotation = {
  formatVersion: 1;
  pageWidth: 720;
  revision: number;
  strokes: InkStroke[];
  textNote: string;
  updatedAt?: string;
};
export const emptyAnnotation = (): Annotation => ({
  formatVersion: 1,
  pageWidth: 720,
  revision: 0,
  strokes: [],
  textNote: '',
});
export type NotebookHandle = { flush: () => Promise<boolean> };
export function articleText(group: Group) {
  return (
    group.passage ||
    group.questions.map((question) => question.prompt).join('\n\n') ||
    group.instructions ||
    group.title
  );
}
import type { Group } from './types';
