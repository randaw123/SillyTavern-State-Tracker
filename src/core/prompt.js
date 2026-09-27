// Fills a tracker's prompts (spec section 4.5, steps 3 and 4). The two placeholders are
// swapped for private-use tokens before SillyTavern's macro pass and filled afterwards,
// so the macro pass never sees them and never touches chat text or answers.

const PREVIOUS = 'ST_PREVIOUS_STATE';
const RECENT = 'ST_RECENT_MESSAGES';

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
    const extras = (tracker.extraPrompts ?? [])
        .map(p => ({ role: p.role, content: render(p.text), depth: p.depth }))
        .filter(p => p.content);
    return { system: render(tracker.systemPrompt), user: render(tracker.prompt), extras };
}

// Extra prompts are placed by counting back from the end of the system prompt and the prompt:
// depth 0 is the very end, and a depth past the start puts the prompt first.
export function toChatMessages({ system, user, extras = [] }) {
    const base = [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
    ];
    // Bucket i holds the extra prompts that go just before base[i]; the last bucket is the end.
    const buckets = Array.from({ length: base.length + 1 }, () => []);
    for (const { role, content, depth } of extras) buckets[Math.max(0, base.length - depth)].push({ role, content });
    return buckets.flatMap((bucket, i) => (i < base.length ? [...bucket, base[i]] : bucket));
}

// A trailing assistant message is the start of the answer: the model continues from it.
export function answerStart(messages) {
    const last = messages.at(-1);
    return last?.role === 'assistant' ? last.content : '';
}

// SillyTavern's raw generation takes the system prompt and the start of the answer separately,
// so it can format them for text completion. The system prompt goes into the list instead once
// an extra prompt is placed before it.
export function toRawRequest(prompt) {
    const keepSystem = Boolean(prompt.system) && !(prompt.extras ?? []).some(p => p.depth >= 2);
    const messages = toChatMessages(keepSystem ? { ...prompt, system: '' } : prompt);
    const prefill = answerStart(messages);
    if (prefill) messages.pop();
    return { systemPrompt: keepSystem ? prompt.system : '', prompt: messages, prefill };
}

// Puts the start of the answer back in front of the reply, which never repeats it. Both sides
// arrive trimmed, so a space is added at the join unless one is already there. A blank reply
// stays blank, so it still fails as an empty answer.
export function withAnswerStart(start, reply) {
    if (!start || !reply.trim()) return reply;
    return /\s$/.test(start) || /^\s/.test(reply) ? start + reply : `${start} ${reply}`;
}
