import { z } from 'zod';

export const SlideVisualSpecSchema = z.object({
  kind: z.enum(['none', 'hero', 'backdrop', 'diagram']).default('none'),
  prompt: z.string().trim().min(1).optional(),
});

export const SlideMultiVisualSpecSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kind: z.enum(['icon', 'diagram', 'banner', 'hero', 'backdrop']),
  prompt: z.string().trim().min(3).max(400),
  // Exact Slides element description to place into (typically a koda:visual_frame:* tag).
  targetTag: z.string().trim().min(1).max(140),
});

const DeckBlockItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(520),
  iconPrompt: z.string().trim().min(3).max(240).optional(),
});

const DeckPillarItemSchema = z.object({
  number: z.string().trim().min(1).max(8),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(520),
});

const DeckTableCellSchema = z.string().trim().min(1).max(140);

const DeckKpiItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(24),
  delta: z.string().trim().min(1).max(18).optional(),
  iconPrompt: z.string().trim().min(3).max(240).optional(),
});

export const DeckBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cards_vertical'),
    items: z.array(DeckBlockItemSchema).min(2).max(6),
    note: z.string().trim().min(1).max(220).optional(),
    diagramPrompt: z.string().trim().min(3).max(260).optional(),
  }),
  z.object({
    type: z.literal('grid_2x2'),
    items: z.array(DeckBlockItemSchema).length(4),
  }),
  z.object({
    type: z.literal('values_5'),
    items: z.array(DeckBlockItemSchema).length(5),
  }),
  z.object({
    type: z.literal('triptych_pillars'),
    items: z.array(DeckPillarItemSchema).length(3),
  }),
  z.object({
    type: z.literal('top3_banner'),
    items: z.array(DeckBlockItemSchema).length(3),
    bannerDiagramPrompt: z.string().trim().min(3).max(260),
  }),
  z.object({
    // Simple 4x3 table: 1 header row + up to 3 body rows, 3 columns.
    // Used for table-heavy slides across domains.
    type: z.literal('table_4x3'),
    headers: z.array(DeckTableCellSchema).length(3),
    rows: z.array(z.array(DeckTableCellSchema).length(3)).min(1).max(3),
  }),
  z.object({
    // Chart-heavy but editable: KPI tiles (2x2 grid).
    type: z.literal('kpi_grid_4'),
    items: z.array(DeckKpiItemSchema).length(4),
  }),
]);

export const DeckSlidePlanSchema = z.object({
  index: z.number().int().min(1),
  layout: z.enum([
    'TITLE',
    'TITLE_AND_BODY',
    'TITLE_AND_TWO_COLUMNS',
    'TITLE_ONLY',
    'SECTION_HEADER',
    'SECTION_TITLE_AND_DESCRIPTION',
  ]).default('TITLE_AND_BODY'),
  title: z.string().trim().min(1),
  subtitle: z.string().trim().optional(),
  bullets: z.array(z.string().trim().min(1)).optional(),
  speakerNotes: z.string().trim().optional(),
  visual: SlideVisualSpecSchema.optional(),
  // Advanced composition blocks (cards/grids/pillars) for premium templates.
  blocks: z.array(DeckBlockSchema).max(6).optional(),
  // Optional explicit visuals list (icons/diagrams per slot). If omitted, visuals can be derived from blocks.
  visuals: z.array(SlideMultiVisualSpecSchema).max(20).optional(),
});

export const DeckPlanSchema = z.object({
  // Optional: lets planner explicitly choose a style mode.
  style: z.enum(['business', 'legal', 'stats', 'medical', 'book', 'script']).optional(),
  title: z.string().trim().min(1),
  slides: z.array(DeckSlidePlanSchema).min(1).max(24),
});

export type DeckPlan = z.infer<typeof DeckPlanSchema>;
export type DeckSlidePlan = z.infer<typeof DeckSlidePlanSchema>;
