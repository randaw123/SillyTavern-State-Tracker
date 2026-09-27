// Per-message, per-swipe answer storage (spec sections 5 and 6.1).
// A stored block is { stamp, entries: { [trackerId]: Entry } }. The stamp ties the
// block to one swipe, because SillyTavern copies `extra` onto new swipes.

export const STORE_KEY = 'state_tracker';

export function displayedSwipeId(message) {
    return typeof message?.swipe_id === 'number' ? message.swipe_id : 0;
}

function isDisplayed(message, swipeId) {
    return swipeId === displayedSwipeId(message);
}

function toMs(value) {
    if (value === undefined || value === null || value === '') return '';
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? String(ms) : ''; // an Invalid Date is saved as null, so treat it as missing
}

export function swipeStamp(message, swipeId) {
    const source = isDisplayed(message, swipeId) ? message : message?.swipe_info?.[swipeId];
    return `${toMs(source?.gen_started)}|${source?.send_date ?? ''}`;
}

export function swipeText(message, swipeId) {
    if (isDisplayed(message, swipeId)) return String(message?.mes ?? '');
    return String(message?.swipes?.[swipeId] ?? '');
}

export function hasValue(entry) {
    return typeof entry?.value === 'string' && entry.value.trim() !== '';
}

export function getEntries(message, swipeId = displayedSwipeId(message)) {
    if (!message) return {};
    const stamp = swipeStamp(message, swipeId);
    const candidates = isDisplayed(message, swipeId)
        ? [message.extra?.[STORE_KEY], message.swipe_info?.[swipeId]?.extra?.[STORE_KEY]]
        : [message.swipe_info?.[swipeId]?.extra?.[STORE_KEY]];
    const block = candidates.find(b => b && b.stamp === stamp);
    return block?.entries ?? {};
}

export function getEntry(message, trackerId, swipeId = displayedSwipeId(message)) {
    return getEntries(message, swipeId)[trackerId] ?? null;
}

function writeBlock(message, swipeId, entries) {
    const block = { stamp: swipeStamp(message, swipeId), entries };
    if (isDisplayed(message, swipeId)) {
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        message.extra[STORE_KEY] = structuredClone(block);
    }
    const info = message.swipe_info?.[swipeId];
    if (info && typeof info === 'object') {
        if (!info.extra || typeof info.extra !== 'object') info.extra = {};
        info.extra[STORE_KEY] = structuredClone(block);
    }
}

function updateEntry(message, swipeId, trackerId, change) {
    const entries = { ...getEntries(message, swipeId) };
    const next = change(entries[trackerId] ? { ...entries[trackerId] } : null);
    if (next === null) delete entries[trackerId];
    else entries[trackerId] = next;
    writeBlock(message, swipeId, entries);
}

// `run` records which connection and model answered and how long it took: { profile, model, ms }.
export function storeAnswer(message, swipeId, trackerId, value, now = Date.now(), run = null) {
    updateEntry(message, swipeId, trackerId, () => ({ value, outdated: false, edited: false, updatedAt: now, ...(run ? { run } : {}) }));
}

export function storeError(message, swipeId, trackerId, error, now = Date.now()) {
    updateEntry(message, swipeId, trackerId, entry => ({ ...(entry ?? {}), updatedAt: now, error: String(error) }));
}

export function storeEdit(message, swipeId, trackerId, value, now = Date.now()) {
    updateEntry(message, swipeId, trackerId, entry => {
        if (!String(value ?? '').trim()) return null;
        const { error, ...rest } = entry ?? {};
        return { ...rest, value, outdated: false, edited: true, updatedAt: now };
    });
}

/**
 * Re-stamps the displayed swipe's block after Continue changed the swipe's timestamps.
 * Only a block that carries `fromStamp` (the stamp recorded when the Continue started)
 * is adopted, so a block copied from another swipe never is. Returns the current stamp.
 */
export function adoptBlock(message, fromStamp) {
    const swipeId = displayedSwipeId(message);
    const stamp = swipeStamp(message, swipeId);
    const block = message?.extra?.[STORE_KEY];
    if (block?.entries && block.stamp === fromStamp && fromStamp !== stamp) writeBlock(message, swipeId, block.entries);
    return stamp;
}

/** Removes a block that was copied from another swipe. Call when a new reply or swipe arrives. */
export function purgeStale(message) {
    const swipeId = displayedSwipeId(message);
    const stamp = swipeStamp(message, swipeId);
    let purged = false;
    if (message?.extra?.[STORE_KEY] && message.extra[STORE_KEY].stamp !== stamp) {
        delete message.extra[STORE_KEY];
        purged = true;
    }
    const info = message?.swipe_info?.[swipeId];
    if (info?.extra?.[STORE_KEY] && info.extra[STORE_KEY].stamp !== stamp) {
        delete info.extra[STORE_KEY];
        purged = true;
    }
    return purged;
}

export function markOutdated(message) {
    const swipeId = displayedSwipeId(message);
    const entries = getEntries(message, swipeId);
    let changed = false;
    const next = {};
    for (const [id, entry] of Object.entries(entries)) {
        if (hasValue(entry)) {
            next[id] = { ...entry, outdated: true };
            changed = true;
        } else {
            next[id] = entry;
        }
    }
    if (changed) writeBlock(message, swipeId, next);
    return changed;
}

export function findCurrentValue(chat, trackerId, startIndex) {
    for (let i = Math.min(startIndex, chat.length - 1); i >= 0; i--) {
        const entry = getEntry(chat[i], trackerId);
        if (hasValue(entry)) return { value: entry.value, index: i };
    }
    return null;
}

// A swipe keeps the message it replaces in the chat, so step past it. A regenerate has
// already deleted the message it replaces before the pause point, so the newest message counts.
export function generationAnchor(chat, type) {
    let anchor = chat.length - 1;
    if (type === 'swipe' && anchor >= 0 && !chat[anchor]?.is_user) anchor -= 1;
    return anchor;
}

export function latestAiIndex(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user && !chat[i].is_system) return i;
    }
    return -1;
}
