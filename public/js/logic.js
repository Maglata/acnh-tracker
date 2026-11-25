// Pure helpers shared by the browser app and the Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ACNHLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const STATE_APP = 'acnh-tracker';
  const STATE_VERSION = 1;
  const HEMISPHERES = ['north', 'south'];

  function formatHour(h) {
    const hour = h % 24;
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
  }

  function formatRanges(ranges) {
    if (!ranges) return '—';
    return ranges.map(([a, b]) => (a === 0 && b === 24 ? 'All day' : `${formatHour(a)} - ${formatHour(b)}`)).join(' & ');
  }

  const inRange = ([start, end], hour) => (start < end ? hour >= start && hour < end : hour >= start || hour < end);

  const monthRanges = (critter, hemi, month) => critter.schedule[hemi][month];

  const isAvailable = (critter, hemi, month) => monthRanges(critter, hemi, month) !== null;

  function isAvailableAt(critter, hemi, month, hour) {
    const ranges = monthRanges(critter, hemi, month);
    return !!ranges && ranges.some((r) => inRange(r, hour));
  }

  const isAllYear = (critter, hemi) => critter.schedule[hemi].every((r) => r !== null);

  const isNew = (critter, hemi, month) =>
    isAvailable(critter, hemi, month) && !isAvailable(critter, hemi, (month + 11) % 12);

  const isLeaving = (critter, hemi, month) =>
    isAvailable(critter, hemi, month) && !isAvailable(critter, hemi, (month + 1) % 12);

  /** Same breakdown as the wiki's monthly guide pages. */
  function monthSections(critters, hemi, month) {
    const available = critters.filter((c) => isAvailable(c, hemi, month));
    return {
      available,
      new: available.filter((c) => isNew(c, hemi, month)),
      leaving: available.filter((c) => isLeaving(c, hemi, month)),
    };
  }

  function defaultState() {
    return {
      app: STATE_APP,
      version: STATE_VERSION,
      updatedAt: null,
      settings: { hemisphere: 'north' },
      progress: {},
    };
  }

  /**
   * Validates and normalizes a state object (e.g. from an imported file).
   * Unknown ids are kept so progress survives data updates. Throws on invalid input.
   */
  function normalizeState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid file: expected a JSON object.');
    if (input.app !== undefined && input.app !== STATE_APP) throw new Error(`Invalid file: not an ACNH tracker export (app="${input.app}").`);
    if (typeof input.version === 'number' && input.version > STATE_VERSION) {
      throw new Error(`File was created by a newer version (${input.version}) of the tracker.`);
    }
    const progressIn = input.progress ?? {};
    if (typeof progressIn !== 'object' || Array.isArray(progressIn)) throw new Error('Invalid file: "progress" must be an object.');

    const state = defaultState();
    state.updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : null;
    const hemi = input.settings?.hemisphere;
    if (HEMISPHERES.includes(hemi)) state.settings.hemisphere = hemi;

    for (const [id, entry] of Object.entries(progressIn)) {
      if (!entry || typeof entry !== 'object') continue;
      const donated = entry.donated === true;
      const caught = entry.caught === true || donated;
      if (caught) state.progress[id] = donated ? { caught, donated } : { caught };
    }
    return state;
  }

  /** Applies a checkbox change; donating implies caught, un-catching clears donated. */
  function setFlag(state, id, flag, value) {
    const current = state.progress[id] ?? {};
    let caught = current.caught === true;
    let donated = current.donated === true;
    if (flag === 'caught') {
      caught = value;
      if (!value) donated = false;
    } else if (flag === 'donated') {
      donated = value;
      if (value) caught = true;
    } else {
      throw new Error(`Unknown flag ${flag}`);
    }
    const progress = { ...state.progress };
    if (caught) progress[id] = donated ? { caught, donated } : { caught };
    else delete progress[id];
    return { ...state, progress };
  }

  const flags = (entry) => `${entry?.caught === true}/${entry?.donated === true}`;

  function sameState(a, b) {
    if (a.settings.hemisphere !== b.settings.hemisphere) return false;
    const ids = new Set([...Object.keys(a.progress), ...Object.keys(b.progress)]);
    for (const id of ids) if (flags(a.progress[id]) !== flags(b.progress[id])) return false;
    return true;
  }

  /**
   * Three-way merge of two copies of the state (e.g. this browser and Google Drive).
   * `base` is the last copy both sides agreed on (null if they never synced).
   * Per critter, the side that changed since `base` wins; if both changed, flags are combined.
   */
  function mergeStates(base, local, remote) {
    const progress = {};
    const ids = new Set([...Object.keys(local.progress), ...Object.keys(remote.progress)]);
    for (const id of ids) {
      const b = base?.progress[id];
      const l = local.progress[id];
      const r = remote.progress[id];
      let pick;
      if (flags(l) === flags(b)) pick = r;
      else if (flags(r) === flags(b)) pick = l;
      else pick = { caught: !!(l?.caught || r?.caught), donated: !!(l?.donated || r?.donated) };
      if (pick?.caught || pick?.donated) progress[id] = pick.donated ? { caught: true, donated: true } : { caught: true };
    }
    const newest = (local.updatedAt ?? '') > (remote.updatedAt ?? '') ? local : remote;
    return { ...defaultState(), updatedAt: newest.updatedAt, settings: { ...newest.settings }, progress };
  }

  function stats(critters, state) {
    let caught = 0;
    let donated = 0;
    for (const c of critters) {
      const p = state.progress[c.id];
      if (p?.caught) caught++;
      if (p?.donated) donated++;
    }
    return { total: critters.length, caught, donated };
  }

  const toCsvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function toCsv(critters, state, hemi) {
    const header = ['Category', 'Number', 'Name', 'Caught', 'Donated', 'Price', 'Location / Pattern', 'Shadow', ...MONTHS.map((m) => m.slice(0, 3))];
    const rows = critters.map((c) => {
      const p = state.progress[c.id] ?? {};
      return [
        c.category,
        c.number,
        c.name,
        p.caught ? 'yes' : 'no',
        p.donated ? 'yes' : 'no',
        c.price,
        c.location ?? c.pattern ?? '',
        c.shadow ?? '',
        ...c.schedule[hemi].map((r) => (r ? formatRanges(r) : '')),
      ];
    });
    return [header, ...rows].map((r) => r.map(toCsvCell).join(',')).join('\n') + '\n';
  }

  return {
    MONTHS,
    STATE_APP,
    STATE_VERSION,
    formatHour,
    formatRanges,
    isAvailable,
    isAvailableAt,
    isAllYear,
    isNew,
    isLeaving,
    monthSections,
    defaultState,
    normalizeState,
    setFlag,
    sameState,
    mergeStates,
    stats,
    toCsv,
  };
});
