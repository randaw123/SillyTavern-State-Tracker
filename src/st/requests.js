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

function reasoningTemplate(name) {
    if (!name) return null;
    try {
        return ctx().getReasoningTemplateByName(name);
    } catch {
        return null;
    }
}

export async function sendPrompt(tracker, prompt, signal) {
    const context = ctx();
    let text;
    let template;
    if (tracker.profileId) {
        const service = context.ConnectionManagerRequestService;
        if (!service) throw new Error('Connection Manager is not available, so this tracker cannot use a connection profile.');
        const profile = service.getSupportedProfiles().find(p => p.id === tracker.profileId);
        if (!profile) throw new Error('The connection profile chosen for this tracker is missing. Pick another one in the tracker editor.');
        const response = await service.sendRequest(tracker.profileId, toChatMessages(prompt), tracker.maxTokens, {
            stream: false, signal, extractData: true, includePreset: true, includeInstruct: true,
        });
        text = typeof response === 'string' ? response : response?.content;
        template = reasoningTemplate(profile['reasoning-template']);
    } else {
        text = await context.generateRaw({ systemPrompt: prompt.system, prompt: prompt.user, responseLength: tracker.maxTokens });
        template = context.powerUserSettings?.reasoning ?? null;
    }
    const raw = String(text ?? '');
    const answer = stripReasoning(raw, template);
    if (!answer) {
        throw new Error(raw.trim()
            ? 'The model returned only reasoning and no answer. Try a larger max answer length.'
            : 'The model returned an empty answer.');
    }
    return answer;
}
