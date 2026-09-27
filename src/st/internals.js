// SillyTavern internals that are not on getContext(). Both are optional: if a future
// SillyTavern moves them, the extension logs a warning and falls back (spec section 8).
import { LOG_PREFIX } from './context.js';

let setSendButtonState = null;
let isGenerating = null;
let regexEngine = null;

export async function loadInternals() {
    try {
        const script = await import('../../../../../../script.js');
        if (typeof script.setSendButtonState === 'function') setSendButtonState = script.setSendButtonState;
        else console.warn(`${LOG_PREFIX} setSendButtonState not found; the Enter key will not be blocked while trackers run.`);
        if (typeof script.isGenerating === 'function') isGenerating = script.isGenerating;
    } catch (error) {
        console.warn(`${LOG_PREFIX} Could not load SillyTavern's main script; the Enter key will not be blocked.`, error);
    }
    try {
        const engine = await import('../../../../regex/engine.js');
        if (typeof engine.getRegexedString === 'function' && engine.regex_placement) regexEngine = engine;
        else console.warn(`${LOG_PREFIX} Regex engine not found; recent messages will not be cleaned.`);
    } catch (error) {
        console.warn(`${LOG_PREFIX} Could not load the regex engine; recent messages will not be cleaned.`, error);
    }
}

export function setBusyFlag(value) {
    setSendButtonState?.(value);
}

/** Whether SillyTavern is busy generating (or locked). Falls back to the page's "generating" marker. */
export function isBusy() {
    if (isGenerating) return Boolean(isGenerating());
    return globalThis.document?.body?.dataset?.generating === 'true';
}

export function cleanWithRegex(text, { isUser, depth }) {
    if (!regexEngine) return text;
    const { getRegexedString, regex_placement: placement } = regexEngine;
    try {
        return getRegexedString(text, isUser ? placement.USER_INPUT : placement.AI_OUTPUT, { isPrompt: true, depth }) ?? text;
    } catch (error) {
        console.warn(`${LOG_PREFIX} A regex script failed; using the raw message text.`, error);
        return text;
    }
}
