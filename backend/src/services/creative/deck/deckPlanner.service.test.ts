import { DeckPlannerService } from './deckPlanner.service';
import type { DeckPlan } from './deckPlan.types';

describe('DeckPlannerService (blocks fallback)', () => {
  it('keeps bullets when deriving blocks (fallback for non-premium templates)', () => {
    const svc = new DeckPlannerService({ generate: async () => ({ text: '{}' }) } as any);

    const plan: DeckPlan = {
      title: 'Test',
      slides: [
        { index: 1, layout: 'TITLE', title: 'Cover', subtitle: 'Sub' },
        {
          index: 2,
          layout: 'TITLE_AND_BODY',
          title: 'Slide',
          bullets: ['One', 'Two', 'Three', 'Four'],
        },
      ],
    };

    const out = (svc as any).applyBlocksFromBullets(plan, 'business') as DeckPlan;
    const s2: any = out.slides[1];

    expect(Array.isArray(s2.blocks)).toBe(true);
    expect(s2.blocks.length).toBeGreaterThan(0);
    expect(s2.bullets).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

