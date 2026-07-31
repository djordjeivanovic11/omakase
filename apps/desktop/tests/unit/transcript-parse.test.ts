import { describe, expect, it } from 'vitest';
import {
  detectTranscriptFormat,
  parseJsonTranscript,
  parseSrt,
  parseTranscript,
  parseVtt,
} from '../../src/core/sources/transcript-parse.js';

describe('transcript-parse', () => {
  it('detects and parses WebVTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:07.500
Second cue
`;
    expect(detectTranscriptFormat(vtt)).toBe('vtt');
    const segments = parseVtt(vtt);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ startMs: 1000, endMs: 4000, text: 'Hello world' });
    expect(segments[1]?.text).toBe('Second cue');
  });

  it('parses SRT timestamps', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
First line

2
00:00:04,000 --> 00:00:06,000
Second line
`;
    const segments = parseSrt(srt);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.startMs).toBe(1000);
    expect(segments[1]?.text).toBe('Second line');
  });

  it('parses JSON transcript arrays', () => {
    const json = JSON.stringify([
      { startMs: 0, endMs: 2000, text: 'Intro' },
      { start: 3, end: 5, text: 'Middle' },
    ]);
    const segments = parseJsonTranscript(json);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe('Intro');
    expect(segments[1]?.startMs).toBe(3000);
  });

  it('auto-detects format via parseTranscript', () => {
    const srt = `1\n00:00:00,500 --> 00:00:02,000\nOnly cue\n`;
    const segments = parseTranscript(srt);
    expect(segments[0]?.text).toBe('Only cue');
  });
});
