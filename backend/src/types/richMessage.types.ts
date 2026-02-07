export type RichMessageBlockType =
  | 'status'
  | 'text'
  | 'bullets'
  | 'table'
  | 'citations'
  | 'target'
  | 'diff'
  | 'why'
  | 'proof'
  | 'actions'
  | 'choices'
  | 'preview';

export interface RichMessage {
  blocks: RichMessageBlock[];
  meta?: Record<string, unknown>;
}

export type RichMessageBlock =
  | StatusBlock
  | TextBlock
  | BulletsBlock
  | TableBlock
  | CitationsBlock
  | TargetBlock
  | DiffBlock
  | WhyBlock
  | ProofBlock
  | ActionsBlock
  | ChoicesBlock
  | PreviewBlock;

export interface StatusBlock {
  type: 'status';
  stage: string;
  message?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface BulletsBlock {
  type: 'bullets';
  items: string[];
}

export interface TableBlock {
  type: 'table';
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface CitationItem {
  sourceType: 'doc' | 'gmail' | 'outlook' | 'slack';
  sourceId: string;
  timestamp: string;
  title?: string;
  subject?: string;
  from?: string;
  channel?: string;
  threadId?: string;
  permalink?: string;
  snippet?: string;
}

export interface CitationsBlock {
  type: 'citations';
  items: CitationItem[];
}

export interface TargetCandidate {
  id: string;
  label: string;
  score: number;
  reasons?: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface TargetBlock {
  type: 'target';
  label: string;
  confidence: number;
  candidates?: TargetCandidate[];
}

export interface DiffSegment {
  type: 'unchanged' | 'inserted' | 'deleted' | 'replaced';
  before?: string;
  after?: string;
}

export interface DiffBlock {
  type: 'diff';
  kind: 'paragraph' | 'cell' | 'slide_text' | 'structural';
  summary: string;
  segments: DiffSegment[];
  before?: string;
  after?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface WhyBlock {
  type: 'why';
  reasons: string[];
  preserved: string[];
  styleMatched?: string;
  riskLevel: 'LOW' | 'MED' | 'HIGH';
}

export interface ProofItem {
  sourceType: 'target_excerpt' | 'retrieval_chunk' | 'policy_check' | 'validator';
  label: string;
  value: string;
}

export interface ProofBlock {
  type: 'proof';
  items: ProofItem[];
}

export interface ActionPill {
  type: string;
  label: string;
  payload?: Record<string, string | number | boolean>;
}

export interface ActionsBlock {
  type: 'actions';
  items: ActionPill[];
}

export interface ChoiceOption {
  id: string;
  label: string;
  payload?: Record<string, string | number | boolean>;
}

export interface ChoicesBlock {
  type: 'choices';
  prompt: string;
  options: ChoiceOption[];
}

export interface PreviewBlock {
  type: 'preview';
  assetUrl: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  palette?: string[];
  styleMode?: string;
}
