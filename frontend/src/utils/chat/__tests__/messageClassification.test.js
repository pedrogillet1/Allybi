import {
  isNavigationAnswerMessage,
  isDocumentContextAnswerMessage,
  canRenderSourcesForMessage,
  isNavigationMode,
  isDocumentGroundedMode,
  hasSourceButtonsAttachment,
} from '../messageClassification';

describe('isNavigationMode', () => {
  it('returns true for nav_pills', () => {
    expect(isNavigationMode('nav_pills')).toBe(true);
  });
  it('returns true for nav_pill', () => {
    expect(isNavigationMode('nav_pill')).toBe(true);
  });
  it('returns true for rank_disambiguate', () => {
    expect(isNavigationMode('rank_disambiguate')).toBe(true);
  });
  it('returns false for doc_grounded_single', () => {
    expect(isNavigationMode('doc_grounded_single')).toBe(false);
  });
  it('returns false for empty/null', () => {
    expect(isNavigationMode('')).toBe(false);
    expect(isNavigationMode(null)).toBe(false);
  });
});

describe('isDocumentGroundedMode', () => {
  it('returns true for doc_grounded_single', () => {
    expect(isDocumentGroundedMode('doc_grounded_single')).toBe(true);
  });
  it('returns true for doc_grounded_multi', () => {
    expect(isDocumentGroundedMode('doc_grounded_multi')).toBe(true);
  });
  it('returns false for nav_pills', () => {
    expect(isDocumentGroundedMode('nav_pills')).toBe(false);
  });
});

describe('hasSourceButtonsAttachment', () => {
  it('returns false for non-array', () => {
    expect(hasSourceButtonsAttachment(null)).toBe(false);
    expect(hasSourceButtonsAttachment(undefined)).toBe(false);
    expect(hasSourceButtonsAttachment('string')).toBe(false);
  });
  it('returns false for empty array', () => {
    expect(hasSourceButtonsAttachment([])).toBe(false);
  });
  it('returns false for attachments without source_buttons type', () => {
    expect(hasSourceButtonsAttachment([{ type: 'image', buttons: [{ id: '1' }] }])).toBe(false);
  });
  it('returns false for source_buttons with empty buttons array', () => {
    expect(hasSourceButtonsAttachment([{ type: 'source_buttons', buttons: [] }])).toBe(false);
  });
  it('returns true for valid source_buttons attachment', () => {
    expect(hasSourceButtonsAttachment([{ type: 'source_buttons', buttons: [{ id: '1' }] }])).toBe(true);
  });
  it('with navOnly=true, returns true only if answerMode is nav', () => {
    const navAtt = [{ type: 'source_buttons', buttons: [{ id: '1' }], answerMode: 'nav_pills' }];
    const docAtt = [{ type: 'source_buttons', buttons: [{ id: '1' }], answerMode: 'doc_grounded_single' }];
    expect(hasSourceButtonsAttachment(navAtt, { navOnly: true })).toBe(true);
    expect(hasSourceButtonsAttachment(docAtt, { navOnly: true })).toBe(false);
  });
  it('with navOnly=false (default), returns true regardless of answerMode', () => {
    const att = [{ type: 'source_buttons', buttons: [{ id: '1' }], answerMode: 'doc_grounded_single' }];
    expect(hasSourceButtonsAttachment(att)).toBe(true);
    expect(hasSourceButtonsAttachment(att, { navOnly: false })).toBe(true);
  });
});

describe('isNavigationAnswerMessage', () => {
  it('returns true for nav_pills answerMode', () => {
    expect(isNavigationAnswerMessage({ answerMode: 'nav_pills' })).toBe(true);
  });
  it('returns true for NAVIGATION answerClass', () => {
    expect(isNavigationAnswerMessage({ answerClass: 'NAVIGATION' })).toBe(true);
  });
  it('returns true for message with navType', () => {
    expect(isNavigationAnswerMessage({ navType: 'folder' })).toBe(true);
  });
  it('returns true for message with listing', () => {
    expect(isNavigationAnswerMessage({ listing: [{ id: '1' }] })).toBe(true);
  });
  it('returns false for doc_grounded message', () => {
    expect(isNavigationAnswerMessage({ answerMode: 'doc_grounded_single' })).toBe(false);
  });
  it('returns false for empty object', () => {
    expect(isNavigationAnswerMessage({})).toBe(false);
  });
  it('handles null/undefined', () => {
    expect(isNavigationAnswerMessage(null)).toBe(false);
    expect(isNavigationAnswerMessage(undefined)).toBe(false);
  });
});

describe('isDocumentContextAnswerMessage', () => {
  it('returns true for doc_grounded_single', () => {
    expect(isDocumentContextAnswerMessage({ answerMode: 'doc_grounded_single' })).toBe(true);
  });
  it('returns true for DOCUMENT answerClass', () => {
    expect(isDocumentContextAnswerMessage({ answerClass: 'DOCUMENT' })).toBe(true);
  });
  it('returns true for message with sources', () => {
    expect(isDocumentContextAnswerMessage({ sources: [{ id: '1' }] })).toBe(true);
  });
  it('returns false for nav_pills (nav takes priority)', () => {
    expect(isDocumentContextAnswerMessage({ answerMode: 'nav_pills' })).toBe(false);
  });
  it('returns false for empty object', () => {
    expect(isDocumentContextAnswerMessage({})).toBe(false);
  });
  it('handles missing fields', () => {
    expect(isDocumentContextAnswerMessage({ answerMode: null })).toBe(false);
  });
});

describe('canRenderSourcesForMessage', () => {
  it('returns true for doc-grounded messages', () => {
    expect(canRenderSourcesForMessage({ answerMode: 'doc_grounded_single' })).toBe(true);
  });
  it('returns false for navigation messages', () => {
    expect(canRenderSourcesForMessage({ answerMode: 'nav_pills' })).toBe(false);
  });
  it('returns false for empty messages', () => {
    expect(canRenderSourcesForMessage({})).toBe(false);
  });
  it('returns true for messages with sources but no nav', () => {
    expect(canRenderSourcesForMessage({ sources: [{ id: '1' }] })).toBe(true);
  });
});
