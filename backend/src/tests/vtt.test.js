/**
 * VTT Export Tests
 * Tests WebVTT generation and export functionality
 */

import { describe, it, expect } from 'vitest';
import { formatTime, generateVTT, generatePlainVTT } from '../utils/vttUtils.js';

describe('VTT Utils', () => {
  describe('formatTime', () => {
    it('should format 0 milliseconds', () => {
      expect(formatTime(0)).toBe('00:00:00.000');
    });

    it('should format seconds', () => {
      expect(formatTime(5000)).toBe('00:00:05.000');
    });

    it('should format minutes', () => {
      expect(formatTime(90000)).toBe('00:01:30.000');
    });

    it('should format hours', () => {
      expect(formatTime(3661500)).toBe('01:01:01.500');
    });

    it('should format milliseconds', () => {
      expect(formatTime(1234)).toBe('00:00:01.234');
    });

    it('should pad single digits', () => {
      expect(formatTime(9009)).toBe('00:00:09.009');
    });
  });

  describe('generateVTT', () => {
    it('should generate valid WebVTT header', () => {
      const segments = [];
      const participants = [];
      const vtt = generateVTT(segments, participants);
      
      expect(vtt).toContain('WEBVTT');
    });

    it('should generate VTT with speaker tags', () => {
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: 'p1', idx: 0, start_ms: 0, end_ms: 1500, text: 'Hello there' },
        { id: 's2', media_file_id: 'm1', participant_id: 'p2', idx: 1, start_ms: 1500, end_ms: 3000, text: 'Hi Alice!' }
      ];

      const vtt = generateVTT(segments, participants);

      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
      expect(vtt).toContain('<v Alice>Hello there</v>');
      expect(vtt).toContain('00:00:01.500 --> 00:00:03.000');
      expect(vtt).toContain('<v Bob>Hi Alice!</v>');
    });

    it('should handle segments without participants', () => {
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: null, idx: 0, start_ms: 0, end_ms: 1000, text: 'Unassigned text' }
      ];
      const participants = [];

      const vtt = generateVTT(segments, participants);

      expect(vtt).toContain('<v Speaker>Unassigned text</v>');
    });

    it('should add cue identifiers', () => {
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: null, idx: 0, start_ms: 0, end_ms: 1000, text: 'First' },
        { id: 's2', media_file_id: 'm1', participant_id: null, idx: 1, start_ms: 1000, end_ms: 2000, text: 'Second' }
      ];
      const participants = [];

      const vtt = generateVTT(segments, participants);

      expect(vtt).toContain('1\n00:00:00.000');
      expect(vtt).toContain('2\n00:00:01.000');
    });

    it('should handle unknown participants', () => {
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: 'unknown', idx: 0, start_ms: 0, end_ms: 1000, text: 'Test' }
      ];
      const participants = [{ id: 'p1', name: 'Alice' }];

      const vtt = generateVTT(segments, participants);

      expect(vtt).toContain('<v Unknown Speaker>Test</v>');
    });
  });

  describe('generatePlainVTT', () => {
    it('should generate plain VTT without voice tags', () => {
      const participants = [{ id: 'p1', name: 'Alice' }];
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: 'p1', idx: 0, start_ms: 0, end_ms: 1500, text: 'Hello' }
      ];

      const vtt = generatePlainVTT(segments, participants);

      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('[Alice] Hello');
      expect(vtt).not.toContain('<v Alice>');
    });

    it('should not prepend speaker for unassigned segments', () => {
      const segments = [
        { id: 's1', media_file_id: 'm1', participant_id: null, idx: 0, start_ms: 0, end_ms: 1000, text: 'No speaker' }
      ];
      const participants = [];

      const vtt = generatePlainVTT(segments, participants);

      expect(vtt).toContain('No speaker');
      expect(vtt).not.toContain('[');
    });
  });
});
