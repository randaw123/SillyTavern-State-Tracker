// Builds and sends one tracker request (spec section 4.5).
import { ctx, getSettings } from './context.js';
import { cleanWithRegex } from './internals.js';
import { withAnchor } from '../core/anchor.js';
import { findCurrentValue } from '../core/answers.js';
import { collectRecentMessages, formatRecentMessages } from '../core/messages.js';
import { buildTrackerPrompt, toChatMessages } from '../core/prompt.js';
import { stripReasoning } from '../core/reasoning.js';

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

// Resolves to { answer, details }, where details records which connection and model
// answered and how long the request took, for the side panel and later stats.
export async function sendPrompt(tracker, prompt, signal) {
    const context = ctx();
    let text;
    let template;
    let details;
    if (tracker.profileId) {
        const service = context.ConnectionManagerRequestService;
        if (!service) throw new Error('Connection Manager is not available, so this tracker cannot use a connection profile.');
        const profile = service.getSupportedProfiles().find(p => p.id === tracker.profileId);
        if (!profile) throw new Error('The connection profile chosen for this tracker is missing. Pick another one in the tracker editor.');
        const started = performance.now();
        const response = await service.sendRequest(tracker.profileId, toChatMessages(prompt), tracker.maxTokens, {
            stream: false, signal, extractData: true, includePreset: true, includeInstruct: true,
        });
        details = { profile: profile.name || profile.id, model: String(profile.model ?? ''), ms: Math.round(performance.now() - started) };
        text = typeof response === 'string' ? response : response?.content;
        template = reasoningTemplate(profile['reasoning-template']);
    } else {
        // Timed from when the request leaves the queue, so waiting for another run does not count.
        text = await inRawQueue(async () => {
            const started = performance.now();
            const reply = await context.generateRaw({ systemPrompt: prompt.system, prompt: prompt.user, responseLength: tracker.maxTokens });
            details = { profile: 'Same as chat', model: chatModel(context), ms: Math.round(performance.now() - started) };
            return reply;
        }, signal);
        template = context.powerUserSettings?.reasoning ?? null;
    }
    const raw = String(text ?? '');
    const answer = stripReasoning(raw, template);
    if (!answer) {
        throw new Error(raw.trim()
            ? 'The model returned only reasoning and no answer. Try a larger max answer length.'
            : 'The model returned an empty answer.');
    }
    return { answer, details };
}
