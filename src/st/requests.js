// Builds and sends one tracker request (spec section 4.5).
import { ctx, getSettings } from './context.js';
import { cleanWithRegex } from './internals.js';
import { log } from './log.js';
import { withAnchor } from '../core/anchor.js';
import { findCurrentValue } from '../core/answers.js';
import { collectRecentMessages, formatRecentMessages } from '../core/messages.js';
import { buildTrackerPrompt, toChatMessages } from '../core/prompt.js';
import { emptyAnswerError, stripReasoning } from '../core/reasoning.js';

export function buildJobPrompt(tracker, message, swipeId) {
    const context = ctx();
    const chat = context.chat ?? [];
    const anchorIndex = chat.indexOf(message);
    if (anchorIndex === -1) throw new Error('The message this tracker was running on no longer exists.');
    const previousState = findCurrentValue(chat, tracker.id, anchorIndex - 1)?.value ?? '';
    const recent = collectRecentMessages(chat, {
        anchorIndex,
        anchorSwipeId: swipeId,
        count: tracker.messageCount,
        filter: tracker.messageFilter,
        clean: getSettings().cleanWithRegex ? cleanWithRegex : undefined,
    });
    return withAnchor(anchorIndex, () => buildTrackerPrompt({
        tracker,
        previousState,
        recentMessages: formatRecentMessages(recent),
        substitute: text => context.substituteParams(text),
    }));
}

// SillyTavern's generateRaw keeps the user's reply length in one shared slot while it
// overrides it, so two overlapping calls would restore the wrong value. Run them one at a time.
let rawQueue = Promise.resolve();

function inRawQueue(task, signal) {
    const run = rawQueue.then(() => {
        if (signal?.aborted) throw new Error('Cancelled before it started.');
        return task();
    });
    rawQueue = run.catch(() => {});
    return run;
}

function reasoningTemplate(name) {
    if (!name) return null;
    try {
        return ctx().getReasoningTemplateByName(name);
    } catch {
        return null;
    }
}

// The model the chat is using, for runs with "Same as chat".
function chatModel(context) {
    try {
        return context.mainApi === 'openai' ? String(context.getChatCompletionModel?.() ?? '') : String(context.onlineStatus ?? '');
    } catch {
        return '';
    }
}

// Sends one tracker request and resolves to { answer, details }. `details` is the `run` object
// passed in, filled as the request goes: the connection, the model, the time from sending to
// the reply, and how much thinking came back. It is filled even when the request fails, so
// failed runs can report it too.
export async function sendPrompt(tracker, prompt, signal, run = {}) {
    const context = ctx();
    let text;
    let reasoning = '';
    let template;
    const timed = async request => {
        run.startedAt = performance.now();
        try {
            return await request();
        } finally {
            run.ms = Math.round(performance.now() - run.startedAt);
        }
    };
    log.debug(`Prompt for "${tracker.name}":`, toChatMessages(prompt));
    if (tracker.profileId) {
        const service = context.ConnectionManagerRequestService;
        if (!service) throw new Error('Connection Manager is not available, so this tracker cannot use a connection profile.');
        const profile = service.getSupportedProfiles().find(p => p.id === tracker.profileId);
        if (!profile) throw new Error('The connection profile chosen for this tracker is missing. Pick another one in the tracker editor.');
        run.profile = profile.name || profile.id;
        run.model = String(profile.model ?? '');
        const response = await timed(() => service.sendRequest(tracker.profileId, toChatMessages(prompt), tracker.maxTokens, {
            stream: false, signal, extractData: true, includePreset: true, includeInstruct: true,
        }));
        text = typeof response === 'string' ? response : response?.content;
        reasoning = typeof response === 'string' ? '' : String(response?.reasoning ?? '');
        template = reasoningTemplate(profile['reasoning-template']);
    } else {
        run.profile = 'Same as chat';
        run.model = chatModel(context);
        // Timed from when the request leaves the queue, so waiting for another run does not count.
        text = await inRawQueue(
            () => timed(() => context.generateRaw({ systemPrompt: prompt.system, prompt: prompt.user, responseLength: tracker.maxTokens })),
            signal,
        );
        template = context.powerUserSettings?.reasoning ?? null;
    }
    const raw = String(text ?? '');
    if (reasoning.trim()) run.thinkingChars = reasoning.length;
    log.debug(`Response for "${tracker.name}":`, { answer: raw, thinking: reasoning });
    const answer = stripReasoning(raw, template);
    if (!answer) throw new Error(emptyAnswerError({ raw, reasoning }));
    return { answer, details: run };
}
