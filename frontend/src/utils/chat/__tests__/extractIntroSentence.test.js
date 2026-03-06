import { extractIntroSentence } from '../extractIntroSentence';

describe('extractIntroSentence', () => {
  it('extracts a basic sentence ending in a period', () => {
    expect(extractIntroSentence('Hello world. More text here.')).toBe('Hello world.');
  });

  it('handles multi-sentence text', () => {
    expect(extractIntroSentence('First sentence. Second sentence. Third.')).toBe('First sentence.');
  });

  it('handles text with no period (truncates at 200 chars)', () => {
    const long = 'A'.repeat(300);
    expect(extractIntroSentence(long)).toBe('A'.repeat(200));
  });

  it('returns empty string for empty input', () => {
    expect(extractIntroSentence('')).toBe('');
    expect(extractIntroSentence(null)).toBe('');
    expect(extractIntroSentence(undefined)).toBe('');
  });

  it('strips markdown bold markers', () => {
    expect(extractIntroSentence('**Bold text** is here. More.')).toBe('Bold text is here.');
  });

  it('strips single bold markers', () => {
    expect(extractIntroSentence('*Italic text* is here. More.')).toBe('Italic text is here.');
  });

  it('strips markdown list lines and extracts from remaining text', () => {
    const input = '- Item one\n- Item two\nIntro sentence here. Then more.';
    expect(extractIntroSentence(input)).toBe('Intro sentence here.');
  });

  it('strips numbered list lines', () => {
    const input = '1. First\n2. Second\nThe summary. Done.';
    expect(extractIntroSentence(input)).toBe('The summary.');
  });

  it('handles question marks and exclamation marks', () => {
    expect(extractIntroSentence('Is this a question? Yes it is.')).toBe('Is this a question?');
    expect(extractIntroSentence('Wow! Amazing.')).toBe('Wow!');
  });

  it('handles colon followed by whitespace', () => {
    expect(extractIntroSentence('Here is the thing: details follow')).toBe('Here is the thing:');
  });
});
