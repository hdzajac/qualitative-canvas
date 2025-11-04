export type ParsedVtt = { ts: string; speaker: string; speakerKey: string; speech: string } | null;

export const parseVttLine = (line: string) => {
  const m = line.match(/^(\d{1,2}:\d{2}:\d{2})\s+(?:(.+?):\s*)?(.*)$/);
  if (!m) return null as ParsedVtt;
  const ts = m[1] || '';
  const speaker = (m[2] || '').trim();
  const speech = (m[3] || '').trim();
  return { ts, speaker, speakerKey: speaker.toLowerCase(), speech } as ParsedVtt;
};

export const parseSpeakerOnly = (line: string) => {
  const m = line.match(/^\s*([^:]{1,64})\s*:\s*(.*)$/);
  if (!m) return null as ParsedVtt;
  const speaker = (m[1] || '').trim();
  const speech = (m[2] || '').trim();
  return { ts: '', speaker, speakerKey: speaker.toLowerCase(), speech } as ParsedVtt;
};

export const parseAnyLine = (line: string) => {
  const p = parseVttLine(line);
  if (p && p.speaker) return p;
  return parseSpeakerOnly(line);
};

export const composeVttLine = (ts: string, speaker: string, speech: string) => {
  const tsPart = ts ? ts + ' ' : '';
  const spPart = speaker ? speaker + ': ' : '';
  return `${tsPart}${spPart}${speech}`.trim();
};

export const isSemanticallyEmptyVttLine = (line: string) => {
  const l = line.trim();
  if (!l) return true;
  const p1 = parseVttLine(l);
  if (p1) return p1.speech.trim().length === 0;
  const p2 = parseSpeakerOnly(l);
  if (p2) return p2.speech.trim().length === 0;
  return false;
};

export const getLineStart = (s: string, idx: number) => {
  const n = s.lastIndexOf('\n', Math.max(0, idx - 1));
  return n === -1 ? 0 : n + 1;
};
export const getLineEndNoNl = (s: string, start: number) => {
  const n = s.indexOf('\n', start);
  return n === -1 ? s.length : n;
};

export const mergePrevCurr = (s: string, pivot: number) => {
  const currStart = getLineStart(s, pivot);
  const currEndNoNl = getLineEndNoNl(s, currStart);
  if (currStart === 0) return s;
  const prevStart = getLineStart(s, currStart - 1);
  const prevEndNoNl = getLineEndNoNl(s, prevStart);
  const prevLine = s.slice(prevStart, prevEndNoNl).trimEnd();
  const currLine = s.slice(currStart, currEndNoNl).trimStart();
  const p1 = parseAnyLine(prevLine);
  const p2 = parseAnyLine(currLine);
  if (!p1 || !p2) return s;
  const hasS1 = Boolean(p1.speaker && p1.speaker.trim());
  const hasS2 = Boolean(p2.speaker && p2.speaker.trim());
  const speakersEqual = (hasS1 && hasS2) ? (p1.speakerKey === p2.speakerKey) : (hasS1 || hasS2);
  if (!speakersEqual) return s;
  const mergedSpeech = (p1.speech + (p1.speech ? ' ' : '') + p2.speech).trim();
  const mergedSpeaker = hasS1 ? p1.speaker : p2.speaker;
  const mergedTs = p1.ts || p2.ts;
  const merged = composeVttLine(mergedTs, mergedSpeaker, mergedSpeech);
  const afterCurr = s[currEndNoNl] === '\n' ? '\n' : '';
  return s.slice(0, prevStart) + merged + afterCurr + s.slice(currEndNoNl + (afterCurr ? 1 : 0));
};

export const mergeCurrNext = (s: string, pivot: number) => {
  const currStart = getLineStart(s, pivot);
  const currEndNoNl = getLineEndNoNl(s, currStart);
  const nextStart = currEndNoNl < s.length ? currEndNoNl + 1 : -1;
  if (nextStart < 0 || nextStart >= s.length) return s;
  const nextEndNoNl = getLineEndNoNl(s, nextStart);
  const currLine = s.slice(currStart, currEndNoNl).trimEnd();
  const nextLine = s.slice(nextStart, nextEndNoNl).trimStart();
  const p1 = parseAnyLine(currLine);
  const p2 = parseAnyLine(nextLine);
  if (!p1 || !p2) return s;
  const hasS1 = Boolean(p1.speaker && p1.speaker.trim());
  const hasS2 = Boolean(p2.speaker && p2.speaker.trim());
  const speakersEqual = (hasS1 && hasS2) ? (p1.speakerKey === p2.speakerKey) : (hasS1 || hasS2);
  if (!speakersEqual) return s;
  const mergedSpeech = (p1.speech + (p1.speech ? ' ' : '') + p2.speech).trim();
  const mergedSpeaker = hasS1 ? p1.speaker : p2.speaker;
  const mergedTs = p1.ts || p2.ts;
  const merged = composeVttLine(mergedTs, mergedSpeaker, mergedSpeech);
  const afterNext = s[nextEndNoNl] === '\n' ? '\n' : '';
  return s.slice(0, currStart) + merged + afterNext + s.slice(nextEndNoNl + (afterNext ? 1 : 0));
};
