// Collects the recent messages a tracker sees (spec section 4.5, step 1).
import { swipeText } from './answers.js';

export function collectRecentMessages(chat, { anchorIndex, anchorSwipeId, count, filter, clean = text => text }) {
    const picked = [];
    for (let i = anchorIndex; i >= 0 && picked.length < count; i--) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        const isUser = Boolean(message.is_user);
        if (filter === 'ai' && isUser) continue;
        if (filter === 'user' && !isUser) continue;
        const raw = i === anchorIndex ? swipeText(message, anchorSwipeId) : String(message.mes ?? '');
        const depth = chat.length - 1 - i;
        picked.push({ name: String(message.name ?? ''), text: clean(raw, { isUser, depth }), isUser });
    }
    return picked.reverse();
}

export function formatRecentMessages(messages) {
    return messages.map(m => `${m.name}: ${m.text}`).join('\n\n');
}
