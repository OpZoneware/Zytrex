// Natural-language amount parsing: "₦520k", "1,250,000", "five hundred and twenty thousand naira"

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

const NUMBER_WORDS = new Set([
  ...Object.keys(SMALL), ...Object.keys(TENS),
  'hundred', 'thousand', 'million', 'billion', 'and',
]);

/** Parse spelled-out numbers: "five hundred and twenty thousand" → 520000 */
export function parseNumberWords(text: string): { value: number; start: number; end: number } | null {
  let total = 0;
  let current = 0;
  let started = false;
  let firstIdx = -1;
  let lastIdx = -1;

  // rebuild index positions
  const positions: { word: string; start: number; end: number }[] = [];
  const re = /[a-z]+/g;
  let m: RegExpExecArray | null;
  const lower = text.toLowerCase();
  while ((m = re.exec(lower))) positions.push({ word: m[0], start: m.index, end: m.index + m[0].length });

  for (let i = 0; i < positions.length; i++) {
    const w = positions[i].word;
    if (!NUMBER_WORDS.has(w)) {
      if (started) break;
      continue;
    }
    if (w === 'and') { if (started) continue; else continue; }
    if (started && firstIdx === -1) firstIdx = positions[i].start;
    if (!NUMBER_WORDS.has(positions[i + 1]?.word ?? '') && positions[i + 1]) {
      lastIdx = positions[i].end;
    }
    started = true;
    if (lastIdx === -1) lastIdx = positions[i].end;
    if (firstIdx === -1) firstIdx = positions[i].start;

    if (SMALL[w] !== undefined) current += SMALL[w];
    else if (TENS[w] !== undefined) current += TENS[w];
    else if (w === 'hundred') current *= 100;
    else if (w === 'thousand') { total += current * 1000; current = 0; }
    else if (w === 'million') { total += current * 1_000_000; current = 0; }
    else if (w === 'billion') { total += current * 1_000_000_000; current = 0; }
  }
  if (!started) return null;
  const value = total + current;
  if (value <= 0) return null;
  return { value, start: firstIdx, end: lastIdx };
}

export interface AmountMatch {
  value: number;
  start: number;
  end: number;
  raw: string;
}

/** Find a monetary amount in text (digits, ₦, k/m suffix, or spelled out). */
export function findAmount(text: string): AmountMatch | null {
  // digit forms: ₦520,000 / 520k / 1.5m / 500000
  const digitRe = /(?:₦|ngn\s?|naira\s+)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m|bn|billion|million|thousand)?(?=\s|$|[a-z,])/gi;
  const dm = digitRe.exec(text);
  let best: AmountMatch | null = null;
  if (dm && dm[1]) {
    const rawNum = dm[1].replace(/,/g, '');
    let value = parseFloat(rawNum);
    if (!Number.isNaN(value)) {
      const suffix = (dm[2] || '').toLowerCase();
      if (suffix === 'k' || suffix === 'thousand') value *= 1_000;
      else if (suffix === 'm' || suffix === 'million' || suffix === 'bn' || suffix === 'billion') value *= 1_000_000;
      // "naira" following digits without suffix already handled (value in naira)
      if (value > 0) best = { value, start: dm.index, end: dm.index + dm[0].length, raw: dm[0] };
    }
  }

  const words = parseNumberWords(text);
  if (words) {
    // only use words if there were no digits, or words appear earlier
    if (!best || words.start < best.start) {
      const raw = text.slice(words.start, words.end);
      // reject if it's just "one" used as an article ("show one transaction")? keep — rare
      best = { value: words.value, start: words.start, end: words.end, raw };
    }
  }
  return best;
}

/** Extract a date range described in words relative to the sandbox clock (2026-09-29). */
export function parsePeriod(text: string): { start: Date; end: Date; label: string } | null {
  const now = new Date('2026-09-29T12:00:00');
  const lower = text.toLowerCase();

  const monthOf = (name: string): { start: Date; end: Date; label: string } | null => {
    const idx = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(name);
    if (idx < 0) return null;
    const year = idx <= 8 ? 2026 : 2026; // sandbox timeline
    const start = new Date(year, idx, 1);
    const end = new Date(year, idx + 1, 1);
    return { start, end, label: name.charAt(0).toUpperCase() + name.slice(1) };
  };

  if (/\btoday\b/.test(lower)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start, end, label: 'today' };
  }
  if (/\byesterday\b/.test(lower)) {
    const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start, end, label: 'yesterday' };
  }
  if (/\blast (?:7|seven) days\b|\blast week\b|\bpast week\b/.test(lower)) {
    const start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    return { start, end: new Date(now), label: 'the last 7 days' };
  }
  if (/\bthis month\b/.test(lower)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end, label: 'this month' };
  }
  if (/\blast month\b|\bprevious month\b/.test(lower)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: 'last month' };
  }
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  for (const m of months) {
    if (new RegExp(`\\b${m}\\b`).test(lower)) {
      const p = monthOf(m);
      if (p) return p;
    }
  }
  return null;
}
