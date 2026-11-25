export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CATEGORIES = {
  fish: { page: 'Fish_(New_Horizons)', label: 'Fish' },
  bug: { page: 'Bugs_(New_Horizons)', label: 'Bugs' },
  sea: { page: 'Deep-sea_creatures_(New_Horizons)', label: 'Deep-sea creatures' },
};

const FISH_SHADOWS = {
  1: 'Tiny',
  2: 'Small',
  3: 'Medium-small',
  4: 'Medium-large',
  5: 'Large',
  6: 'Huge',
};

const stripMarkup = (s) =>
  s
    .replace(/<\/?small>/gi, '')
    .replace(/<ref[^>]*>.*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .trim();

export function parseLink(cell) {
  const m = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return { name: stripMarkup(cell), page: stripMarkup(cell) };
  return { name: (m[2] ?? m[1]).trim(), page: m[1].trim() };
}

export function parseFile(cell) {
  const m = cell.match(/\[\[File:([^\]|]+)/i);
  return m ? m[1].trim() : null;
}

export function parsePrice(cell) {
  const n = parseInt(stripMarkup(cell).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function parseHour(s) {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})\s*(am|pm)$/);
  if (!m) throw new Error(`Cannot parse hour "${s}"`);
  const h = parseInt(m[1], 10) % 12;
  return m[2] === 'pm' ? h + 12 : h;
}

/** "4pm - 9am & 9am - 4pm" -> [[16, 9], [9, 16]]; "All day" -> [[0, 24]] */
export function parseRanges(text) {
  const t = text.trim();
  if (/^all\s*day$/i.test(t)) return [[0, 24]];
  return t.split('&').map((part) => {
    const [a, b] = part.split(/\s*[-–]\s*/);
    if (b === undefined) throw new Error(`Cannot parse time range "${part}"`);
    return [parseHour(a), parseHour(b)];
  });
}

const monthIndex = (abbr) => {
  const i = MONTHS.findIndex((m) => m.toLowerCase() === abbr.slice(0, 3).toLowerCase());
  if (i < 0) throw new Error(`Unknown month "${abbr}"`);
  return i;
};

function monthSpan(from, to) {
  const out = [];
  for (let i = monthIndex(from); ; i = (i + 1) % 12) {
    out.push(i);
    if (i === monthIndex(to)) return out;
  }
}

/**
 * Converts a wiki time cell plus the month checkmarks into a 12-item array where
 * each entry is either null (not available) or the list of hour ranges that month.
 * Supports seasonal cells such as "4pm - 9am (Mar-Jun)\nAll day (Sep-Nov)".
 */
export function buildSchedule(timeCell, months) {
  const lines = stripMarkup(timeCell)
    .split(/\n|<br\s*\/?>/i)
    .map((l) => l.trim())
    .filter(Boolean);
  let fallback = null;
  const seasonal = new Map();
  for (const line of lines) {
    const m = line.match(/^(.*?)\s*\((\w+)\s*[-–]\s*(\w+)\)$/);
    if (m) {
      const ranges = parseRanges(m[1]);
      for (const i of monthSpan(m[2], m[3])) seasonal.set(i, ranges);
    } else {
      fallback = parseRanges(line);
    }
  }
  fallback ??= seasonal.values().next().value ?? [[0, 24]];
  return months.map((available, i) => (available ? seasonal.get(i) ?? fallback : null));
}

/** Returns raw rows: { hemi: 'north' | 'south', cells: string[] } */
export function parseTableRows(wikitext) {
  const re = /\{\{TableContent\w*\|type=\w+(\|hemi=south)?[^\n]*\n([\s\S]*?)\n\}\}/g;
  const rows = [];
  for (const m of wikitext.matchAll(re)) {
    const cells = ('\n' + m[2]).split('\n|').slice(1).map((c) => c.trim());
    rows.push({ hemi: m[1] ? 'south' : 'north', cells });
  }
  return rows;
}

function parseRow(category, cells) {
  const months = cells.slice(-12).map((c) => c.includes('✓'));
  const link = parseLink(cells[0]);
  const base = {
    name: link.name,
    page: link.page,
    imageFile: parseFile(cells[1]),
    price: parsePrice(cells[2]),
  };
  if (category === 'fish') {
    const raw = stripMarkup(cells[4]);
    const num = parseInt(raw, 10);
    let shadow = FISH_SHADOWS[num] ?? raw;
    if (/fin/i.test(raw) || num === 7) shadow = link.name === 'Suckerfish' ? 'Medium with fin' : 'Huge with fin';
    if (/narrow/i.test(raw) || num === 8) shadow = 'Thin';
    return { ...base, location: stripMarkup(cells[3]), shadow, timeCell: cells[5], months };
  }
  if (category === 'bug') {
    return { ...base, location: stripMarkup(cells[3]), timeCell: cells[4], months };
  }
  return { ...base, shadow: stripMarkup(cells[3]), pattern: stripMarkup(cells[4]), timeCell: cells[5], months };
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Merges northern and southern rows of one wiki page into critter records. */
export function parseCategory(category, wikitext) {
  const byKey = new Map();
  const order = [];
  for (const { hemi, cells } of parseTableRows(wikitext)) {
    const row = parseRow(category, cells);
    const key = row.imageFile ?? row.page.toLowerCase();
    if (!byKey.has(key)) {
      const { timeCell, months, ...rest } = row;
      byKey.set(key, {
        id: `${category}-${slug(row.name)}`,
        category,
        ...rest,
        schedule: {},
      });
      order.push(key);
    }
    byKey.get(key).schedule[hemi] = buildSchedule(row.timeCell, row.months);
  }
  return order.map((key, i) => {
    const c = byKey.get(key);
    if (!c.schedule.north || !c.schedule.south) {
      throw new Error(`${c.name}: missing ${c.schedule.north ? 'southern' : 'northern'} hemisphere data`);
    }
    return { ...c, number: i + 1 };
  });
}
