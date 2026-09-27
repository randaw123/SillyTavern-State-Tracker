import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerStart, buildTrackerPrompt, toChatMessages, toRawRequest, withAnswerStart } from '../src/core/prompt.js';
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

const noMacros = text => text;
const build = (overrides, previousState = 'tavern', recentMessages = 'A: hi') =>
    buildTrackerPrompt({ tracker: tracker({ systemPrompt: 'S', prompt: 'P', ...overrides }), previousState, recentMessages, substitute: noMacros });
const roles = prompt => toChatMessages(prompt).map(m => `${m.role}:${m.content}`);

test('an extra prompt at depth 0 goes after the prompt, 1 before it, and 2 or more before the system prompt', () => {
    const prompt = build({
        extraPrompts: [
            { text: 'end', role: 'system', depth: 0 },
            { text: 'middle', role: 'user', depth: 1 },
            { text: 'start', role: 'assistant', depth: 5 },
        ],
    });
    assert.deepEqual(roles(prompt), ['assistant:start', 'system:S', 'user:middle', 'user:P', 'system:end']);
});

test('without a system prompt, any depth above 0 puts an extra prompt before the prompt', () => {
    const prompt = build({ systemPrompt: '', extraPrompts: [{ text: 'x', role: 'system', depth: 3 }] });
    assert.deepEqual(roles(prompt), ['system:x', 'user:P']);
});

test('extra prompts at the same depth keep their order', () => {
    const prompt = build({ extraPrompts: [{ text: 'one', depth: 0 }, { text: 'two', depth: 0 }] });
    assert.deepEqual(roles(prompt).slice(-2), ['system:one', 'system:two']);
});

test('extra prompts get macros and placeholders filled, and empty ones are skipped', () => {
    const t = tracker({
        prompt: 'P',
        extraPrompts: [{ text: '{{char}} was at {{previous_state}}', depth: 0 }, { text: '   ', depth: 0 }],
    });
    const out = buildTrackerPrompt({ tracker: t, previousState: 'saw {{user}}', recentMessages: 'A: hi', substitute });
    assert.deepEqual(roles(out), ['user:P', 'system:Seraphina was at saw {{user}}']);
});

test('a trailing assistant prompt is the start of the answer', () => {
    assert.equal(answerStart(toChatMessages(build({ extraPrompts: [{ text: 'Location:', role: 'assistant', depth: 0 }] }))), 'Location:');
    assert.equal(answerStart(toChatMessages(build({ extraPrompts: [{ text: 'Location:', role: 'user', depth: 0 }] }))), '');
    assert.equal(answerStart(toChatMessages(build({ extraPrompts: [{ text: 'Location:', role: 'assistant', depth: 1 }] }))), '');
});

test('a raw request keeps the system prompt separate and passes the start of the answer as its prefill', () => {
    const request = toRawRequest(build({ extraPrompts: [{ text: 'rules', depth: 1 }, { text: 'Location:', role: 'assistant', depth: 0 }] }));
    assert.equal(request.systemPrompt, 'S');
    assert.deepEqual(request.prompt, [{ role: 'system', content: 'rules' }, { role: 'user', content: 'P' }]);
    assert.equal(request.prefill, 'Location:');
});

test('a raw request sends the system prompt as a message once an extra prompt is placed before it', () => {
    const request = toRawRequest(build({ extraPrompts: [{ text: 'first', role: 'user', depth: 2 }] }));
    assert.equal(request.systemPrompt, '');
    assert.deepEqual(request.prompt, [{ role: 'user', content: 'first' }, { role: 'system', content: 'S' }, { role: 'user', content: 'P' }]);
    assert.equal(request.prefill, '');
});

test('the start of the answer joins the reply with one space unless either side already has one', () => {
    assert.equal(withAnswerStart('Location:', 'forest road'), 'Location: forest road');
    assert.equal(withAnswerStart('Location:', ' forest road'), 'Location: forest road');
    assert.equal(withAnswerStart('<think>', '\nhmm</think> road'), '<think>\nhmm</think> road');
    assert.equal(withAnswerStart('', 'forest road'), 'forest road');
});

test('a blank reply stays blank, so it still counts as an empty answer', () => {
    assert.equal(withAnswerStart('Location:', '  '), '  ');
});
