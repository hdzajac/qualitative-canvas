import { describe, it, expect } from 'vitest';
import { parseVttLine, parseSpeakerOnly, parseAnyLine, composeVttLine, isSemanticallyEmptyVttLine, mergePrevCurr, mergeCurrNext } from '../vtt';

describe('vtt utils', () => {
  it('parseVttLine parses timestamp + speaker + speech', () => {
    const line = '00:01:23 Alice: Hello world';
    const p = parseVttLine(line);
    expect(p).not.toBeNull();
    expect(p!.ts).toBe('00:01:23');
    expect(p!.speaker).toBe('Alice');
    expect(p!.speech).toBe('Hello world');
  });

  it('parseSpeakerOnly parses speaker: speech', () => {
    const line = 'Bob: Hi there';
    const p = parseSpeakerOnly(line);
    expect(p).not.toBeNull();
    expect(p!.speaker).toBe('Bob');
    expect(p!.speech).toBe('Hi there');
  });

  it('parseAnyLine prefers VTT pattern then speaker-only', () => {
    expect(parseAnyLine('00:00:10 Carol: Hey')).not.toBeNull();
    expect(parseAnyLine('Dora: Without timestamp')).not.toBeNull();
    expect(parseAnyLine('No speaker here')).toBeNull();
  });

  it('composeVttLine formats properly', () => {
    expect(composeVttLine('00:00:05', 'Eve', 'Test')).toBe('00:00:05 Eve: Test');
    expect(composeVttLine('', 'Eve', 'Test')).toBe('Eve: Test');
    expect(composeVttLine('00:00:05', '', 'Test')).toBe('00:00:05 Test');
  });

  it('isSemanticallyEmptyVttLine detects empty speech', () => {
    expect(isSemanticallyEmptyVttLine('  ')).toBe(true);
    expect(isSemanticallyEmptyVttLine('Frank:   ')).toBe(true);
    expect(isSemanticallyEmptyVttLine('00:00:01 Frank:   ')).toBe(true);
    expect(isSemanticallyEmptyVttLine('Frank: hello')).toBe(false);
  });

  it('mergePrevCurr merges same-speaker lines', () => {
    const s = '00:00:01 Alice: Hello\n00:00:02 Alice: world\n';
    const pivot = s.indexOf('Alice: world');
    const merged = mergePrevCurr(s, pivot);
    expect(merged).toContain('Alice: Hello world');
    expect(merged.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('mergeCurrNext merges same-speaker lines', () => {
    const s = '00:00:01 Alice: Hello\n00:00:02 Alice: world\n';
    const pivot = s.indexOf('Alice: Hello');
    const merged = mergeCurrNext(s, pivot);
    expect(merged).toContain('Alice: Hello world');
  });
});
