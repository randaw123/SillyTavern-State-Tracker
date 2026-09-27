// Tracker and settings model: defaults, normalization, naming and list helpers.
// Pure module (no SillyTavern or DOM access) so it runs under `node --test`.

export const SETTINGS_VERSION = 1;

export const DEFAULT_PROMPT = [
    'Previous state:',
    '{{previous_state}}',
    '',
    'Recent messages:',
    '{{recent_messages}}',
    '',
    'Update the state based on the recent messages. Reply with only the updated state.',
].join('\n');

export const TRACKER_DEFAULTS = Object.freeze({
    name: 'New tracker',
    enabled: true,
    runMode: 'sync',
    lockWhileRunning: true,
    everyN: 1,
    profileId: '',
    maxTokens: 300,
    messageCount: 2,
    messageFilter: 'all',
    systemPrompt: '',
    prompt: DEFAULT_PROMPT,
    delivery: 'inject',
    position: 'in_chat',
    depth: 1,
    role: 'system',
    wrapper: '{{state}}',
    macroName: '',
});

export const SETTINGS_DEFAULTS = Object.freeze({
    enabled: true,
    timeoutSeconds: 60,
    lockChain: true,
    cleanWithRegex: true,
    minReplyChars: 0,
});

const CHOICES = {
    runMode: ['sync', 'async'],
    messageFilter: ['ai', 'user', 'all'],
    delivery: ['inject', 'macro', 'none'],
    position: ['in_chat', 'before_prompt', 'after_prompt'],
    role: ['system', 'user', 'assistant'],
};

export function newId() {
    return `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clampInt(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export function normalizeTracker(raw, idFn = newId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const t = {};
    for (const [key, fallback] of Object.entries(TRACKER_DEFAULTS)) {
        t[key] = src[key] === undefined ? fallback : src[key];
    }
    t.id = typeof src.id === 'string' && src.id ? src.id : idFn();
    t.name = String(t.name).trim() || TRACKER_DEFAULTS.name;
    t.enabled = Boolean(t.enabled);
    t.lockWhileRunning = Boolean(t.lockWhileRunning);
    for (const [key, allowed] of Object.entries(CHOICES)) {
        if (!allowed.includes(t[key])) t[key] = TRACKER_DEFAULTS[key];
    }
    t.everyN = clampInt(t.everyN, TRACKER_DEFAULTS.everyN, 1);
    t.maxTokens = clampInt(t.maxTokens, TRACKER_DEFAULTS.maxTokens, 1);
    t.messageCount = clampInt(t.messageCount, TRACKER_DEFAULTS.messageCount, 1);
    t.depth = clampInt(t.depth, TRACKER_DEFAULTS.depth, 0, 10000);
    for (const key of ['profileId', 'systemPrompt', 'prompt', 'wrapper', 'macroName']) {
        t[key] = String(t[key] ?? '');
    }
    t.macroName = t.macroName.trim();
    return t;
}

export function normalizeSettings(raw, idFn = newId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const flag = key => (src[key] === undefined ? SETTINGS_DEFAULTS[key] : Boolean(src[key]));
    return {
        version: SETTINGS_VERSION,
        enabled: flag('enabled'),
        timeoutSeconds: clampInt(src.timeoutSeconds, SETTINGS_DEFAULTS.timeoutSeconds, 5, 600),
        lockChain: flag('lockChain'),
        cleanWithRegex: flag('cleanWithRegex'),
        minReplyChars: clampInt(src.minReplyChars, SETTINGS_DEFAULTS.minReplyChars, 0),
        trackers: Array.isArray(src.trackers) ? src.trackers.map(t => normalizeTracker(t, idFn)) : [],
    };
}

export function uniqueName(base, takenNames) {
    const taken = new Set(takenNames.map(n => String(n).toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
        const candidate = `${base} ${i}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

export function uniqueMacroName(base, takenNames) {
    const taken = new Set(takenNames.filter(Boolean).map(n => String(n).toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
        const candidate = `${base}${i}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

export function createTracker(trackers, idFn = newId) {
    return normalizeTracker({ name: uniqueName(TRACKER_DEFAULTS.name, trackers.map(t => t.name)) }, idFn);
}

export function duplicateTracker(source, trackers, idFn = newId) {
    const copy = normalizeTracker({ ...source, id: undefined }, idFn);
    copy.name = uniqueName(`${source.name} (copy)`, trackers.map(t => t.name));
    if (copy.macroName) copy.macroName = uniqueMacroName(copy.macroName, trackers.map(t => t.macroName));
    return copy;
}

export function moveTracker(trackers, index, delta) {
    const target = index + delta;
    if (index < 0 || index >= trackers.length || target < 0 || target >= trackers.length) return trackers.slice();
    const next = trackers.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
}

export function findTrackerByName(trackers, name) {
    const key = String(name ?? '').trim().toLowerCase();
    return trackers.find(t => t.name.toLowerCase() === key) ?? null;
}
