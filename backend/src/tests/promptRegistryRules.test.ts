import { describe, expect, test } from '@jest/globals';

import { PromptRegistryService } from '../services/llm/prompts/promptRegistry.service';

describe('PromptRegistry rule validation', () => {
  test('throws on unreachable selection rules after unconditional rule', () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === 'prompt_registry') {
          return {
            _meta: { id: 'prompt_registry', version: '1.0.0' },
            config: { enabled: true },
            selectionRules: {
              rules: [
                { id: 'catch_all', when: { any: true }, then: { promptId: 'x' } },
                { id: 'never_reached', when: { path: 'answerMode', op: 'eq', value: 'nav_pills' }, then: { promptId: 'y' } },
              ],
            },
            layersByKind: {
              compose_answer: ['system_base'],
            },
          } as T;
        }

        return {
          _meta: { id: bankId, version: '1.0.0' },
          config: {
            enabled: true,
            messages: [
              {
                role: 'system',
                content: { any: 'ok' },
              },
            ],
          },
        } as T;
      },
    };

    const service = new PromptRegistryService(loader as any);

    expect(() =>
      service.buildPrompt('compose_answer', {
        env: 'dev',
        outputLanguage: 'en',
      } as any),
    ).toThrow(/unreachable selection rules/i);
  });
});
