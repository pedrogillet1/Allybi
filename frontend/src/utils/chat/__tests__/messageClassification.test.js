import {
  isNavigationAnswerMessage,
  isDocumentContextAnswerMessage,
  canRenderSourcesForMessage,
  isNavigationMode,
  isDocumentGroundedMode,
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
