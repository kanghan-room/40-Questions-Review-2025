export interface Question {
  id: number;
  part: number;
  text: string;
  category: string;
}

export interface Answers {
  [key: number]: string;
}

export interface SummaryContent {
  title: string;
  content: string;
  keyword: string; // e.g. "Growth"
  style: 'ticket' | 'paper' | 'polaroid' | 'note'; // Visual style of the card
}

export interface YearSummary {
  cards: SummaryContent[];
  visualTags: string[];
  poem: string;
  analysis: string;
  keyword: string;
  animal: string;
}

export interface DraggableItem {
  id: string;
  type: 'text-card' | 'image-upload';
  x: number;
  y: number;
  rotation: number;
  content?: SummaryContent;
  imageUrl?: string;
  zIndex: number;
}

export enum AppState {
  WELCOME,
  QUESTIONS,
  ANALYZING,
  SUMMARY
}