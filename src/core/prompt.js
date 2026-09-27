// Fills a tracker's prompts (spec section 4.5, steps 3 and 4). The two placeholders are
// swapped for private-use tokens before SillyTavern's macro pass and filled afterwards,
// so the macro pass never sees them and never touches chat text or answers.

const PREVIOUS = '\uE000ST_PREVIOUS_STATE\uE000';
const RECENT = '\uE000ST_RECENT_MESSAGES\uE000';

function protect(text) {
    return String(text ?? '')
        .split('{{previous_state}}').join(PREVIOUS)
        .split('{{recent_messages}}').join(RECENT);
}

function fill(text, previousState, recentMessages) {
    return text.split(PREVIOUS).join(previousState).split(RECENT).join(recentMessages);
}

export function buildTrackerPrompt({ tracker, previousState, recentMessages, substitute }) {
    const render = template => fill(substitute(protect(template)), previousState, recentMessages).trim();
    return { system: render(tracker.systemPrompt), user: render(tracker.prompt) };
}

export function toChatMessages({ system, user }) {
    return [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
    ];
}
