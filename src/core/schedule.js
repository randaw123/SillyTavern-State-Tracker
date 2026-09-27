// Automatic-trigger rules (spec sections 4.1 and 4.2) and tracker selection.
import { getEntries, getEntry, hasValue } from './answers.js';

export const NEW_REPLY_TYPES = ['normal', 'regenerate', 'swipe'];
export const CONTINUE_TYPES = ['continue', 'appendFinal'];

export function classifyTrigger({ type, message, stopped, minReplyChars, enabled }) {
    if (!enabled || !message || message.is_user || message.is_system) return null;
    const kind = NEW_REPLY_TYPES.includes(type) ? 'new' : CONTINUE_TYPES.includes(type) ? 'continue' : null;
    if (!kind || stopped) return null;
    if (minReplyChars > 0 && String(message.mes ?? '').trim().length < minReplyChars) return null;
    return kind;
}

export function isDue(chat, trackerId, anchorIndex, everyN) {
    let last = -1;
    for (let i = anchorIndex - 1; i >= 0; i--) {
        if (hasValue(getEntry(chat[i], trackerId))) {
            last = i;
            break;
        }
    }
    if (last === -1) return true;
    let replies = 0;
    for (let i = last + 1; i <= anchorIndex; i++) {
        const message = chat[i];
        if (message && !message.is_user && !message.is_system) replies += 1;
    }
    return replies >= everyN;
}

export function selectNewReplyTrackers({ trackers, chat, anchorIndex, swipeId, isRunning }) {
    const entries = getEntries(chat[anchorIndex], swipeId);
    return trackers.filter(t => t.enabled
        && !entries[t.id]
        && !isRunning(t.id)
        && isDue(chat, t.id, anchorIndex, t.everyN));
}

export function selectContinueTrackers({ trackers, message, swipeId, isRunning }) {
    const entries = getEntries(message, swipeId);
    return trackers.filter(t => t.enabled && (entries[t.id] || isRunning(t.id)));
}

export function selectMissingTrackers({ trackers, message, swipeId, isRunning }) {
    const entries = getEntries(message, swipeId);
    return trackers.filter(t => t.enabled && !hasValue(entries[t.id]) && !isRunning(t.id));
}
