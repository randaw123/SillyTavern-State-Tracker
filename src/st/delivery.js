// Injections and macro registration (spec section 6.2).
import { ctx, getSettings, LOG_PREFIX } from './context.js';
import { currentAnchor } from '../core/anchor.js';
import { findCurrentValue } from '../core/answers.js';
import { buildInjection, injectionKey, POSITION_VALUES } from '../core/delivery.js';

const registeredMacros = new Map(); // macro name -> tracker id
const liveInjections = new Set();   // injection keys currently set

export function currentValue(tracker, anchorIndex) {
    if (!getSettings().enabled || !tracker.enabled) return '';
    const chat = ctx().chat ?? [];
    const start = anchorIndex ?? currentAnchor(chat.length);
    return findCurrentValue(chat, tracker.id, start)?.value ?? '';
}

export function refreshInjections(anchorIndex) {
    const context = ctx();
    const next = new Set();
    for (const tracker of getSettings().trackers) {
        if (tracker.delivery !== 'inject') continue;
        const injection = buildInjection(tracker, currentValue(tracker, anchorIndex));
        if (!injection) continue;
        const key = injectionKey(tracker.id);
        context.setExtensionPrompt(key, injection.text, injection.position, injection.depth, false, injection.role);
        next.add(key);
    }
    for (const key of liveInjections) {
        if (!next.has(key)) context.setExtensionPrompt(key, '', POSITION_VALUES.in_chat, 0);
    }
    liveInjections.clear();
    for (const key of next) liveInjections.add(key);
}

export function syncMacros() {
    const { macros } = ctx();
    if (!macros?.registry) {
        console.warn(`${LOG_PREFIX} The macro system is unavailable; macro trackers will not work.`);
        return;
    }
    const wanted = new Map();
    for (const tracker of getSettings().trackers) {
        if (tracker.delivery === 'macro' && tracker.macroName) wanted.set(tracker.macroName, tracker.id);
    }
    for (const [name, trackerId] of registeredMacros) {
        if (wanted.get(name) === trackerId) continue;
        macros.registry.unregisterMacro(name);
        registeredMacros.delete(name);
    }
    for (const [name, trackerId] of wanted) {
        if (registeredMacros.has(name)) continue;
        if (macros.registry.hasMacro(name)) {
            console.warn(`${LOG_PREFIX} {{${name}}} is already registered elsewhere, so State Tracker did not register it.`);
            continue;
        }
        const registered = macros.register(name, {
            description: 'State Tracker: the current answer of a tracker.',
            handler: () => {
                const tracker = getSettings().trackers.find(t => t.id === trackerId);
                return tracker ? currentValue(tracker) : '';
            },
        });
        // register() returns null when it fails; leave it unrecorded so the next save retries.
        if (registered) registeredMacros.set(name, trackerId);
        else console.warn(`${LOG_PREFIX} {{${name}}} could not be registered; it will be retried on the next save.`);
    }
}

export function isMacroTakenElsewhere(name) {
    const registry = ctx().macros?.registry;
    if (!registry) return false;
    const ours = [...registeredMacros.keys()].some(n => n.toLowerCase() === name.toLowerCase());
    return !ours && registry.hasMacro(name);
}
