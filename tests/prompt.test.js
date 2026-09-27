import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrackerPrompt, toChatMessages } from '../src/core/prompt.js';
import { tracker } from './helpers.js';

// Fills {{char}} and drops any other macro it does not know, the harshest case for our placeholders.
const substitute = text => text.replaceAll('{{char}}', 'Seraphina').replace(/\{\{[^}]*\}\}/g, '');

test('placeholders are filled after macros, so they survive a macro pass that drops unknown macros', () => {
    const t = tracker({ systemPrompt: 'You track {{char}}.', prompt: 'Before: {{previous_state}}\nChat:\n{{recent_messages}}\nUpdate.' });
    const out = buildTrackerPrompt({ tracker: t, previousState: 'tavern', recentMessages: 'A: hi', substitute });
    assert.equal(out.system, 'You track Seraphina.');
    assert.equal(out.user, 'Before: tavern\nChat:\nA: hi\nUpdate.');
});

test('text inside messages and the previous state is never treated as macros', () => {
    const t = tracker({ prompt: '{{previous_state}} / {{recent_messages}}' });
    const out = buildTrackerPrompt({ tracker: t, previousState: 'saw {{char}}', recentMessages: 'A: {{user}}', substitute });
    assert.equal(out.user, 'saw {{char}} / A: {{user}}');
});

test('toChatMessages omits an empty system prompt', () => {
    assert.deepEqual(toChatMessages({ system: '', user: 'u' }), [{ role: 'user', content: 'u' }]);
    assert.deepEqual(toChatMessages({ system: 's', user: 'u' }), [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }]);
});
