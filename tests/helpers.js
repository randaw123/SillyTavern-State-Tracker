// Chat-message factories that mimic how SillyTavern stores messages and swipes.
import { normalizeTracker } from '../src/core/settings.js';

let clock = Date.parse('2026-09-26T10:00:00.000Z');

function stamp() {
    clock += 60_000;
    return { send_date: `sent ${clock}`, gen_started: new Date(clock), gen_finished: new Date(clock + 1000) };
}

/** An AI message with one swipe per text. Shows swipe `shown` (default: the last one). */
export function ai(name, texts, { shown } = {}) {
    const list = Array.isArray(texts) ? texts : [texts];
    const swipe_info = list.map(() => ({ ...stamp(), extra: {} }));
    const id = shown ?? list.length - 1;
    return {
        name,
        is_user: false,
        is_system: false,
        mes: list[id],
        swipes: [...list],
        swipe_id: id,
        swipe_info,
        send_date: swipe_info[id].send_date,
        gen_started: swipe_info[id].gen_started,
        gen_finished: swipe_info[id].gen_finished,
        extra: structuredClone(swipe_info[id].extra),
    };
}

export function user(name, text) {
    return { name, is_user: true, is_system: false, mes: text, send_date: stamp().send_date, extra: {} };
}

/** The same message, hidden from the AI. */
export function hidden(message) {
    return { ...message, is_system: true };
}

/** Mimics SillyTavern showing another swipe: the swipe's saved data replaces the live data. */
export function showSwipe(message, swipeId) {
    const info = message.swipe_info[swipeId];
    message.swipe_id = swipeId;
    message.mes = message.swipes[swipeId];
    message.send_date = info.send_date;
    message.gen_started = info.gen_started;
    message.gen_finished = info.gen_finished;
    message.extra = structuredClone(info.extra) ?? {};
}

/** Mimics SillyTavern generating a new swipe: it keeps the current `extra`, which copies stale data. */
export function addSwipe(message, text) {
    const times = stamp();
    message.swipes.push(text);
    message.swipe_id = message.swipes.length - 1;
    message.mes = text;
    Object.assign(message, times);
    message.swipe_info.push({ ...times, extra: structuredClone(message.extra) });
}

/** Mimics saving a chat to disk and loading it back (Dates become strings). */
export function roundTrip(value) {
    return JSON.parse(JSON.stringify(value));
}

export function tracker(overrides = {}) {
    return normalizeTracker({ id: `t_${overrides.name ?? 'x'}`, ...overrides });
}
