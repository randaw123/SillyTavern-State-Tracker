import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAnswerError, stripReasoning } from '../src/core/reasoning.js';

test('removes a <think> block at the start even without a template', () => {
    assert.equal(stripReasoning('  <think>hmm, the tavern</think>\nLocation: forest road', null), 'Location: forest road');
});

test('uses the configured reasoning template', () => {
    const template = { prefix: '[[reason]]', suffix: '[[/reason]]' };
    assert.equal(stripReasoning('[[reason]]x[[/reason]] Answer', template), 'Answer');
});

test('removes reasoning whose opening tag was not echoed back', () => {
    assert.equal(stripReasoning('thinking about it...</think>Answer', null), 'Answer');
});

test('returns an empty string when reasoning never closes, so the run fails instead of storing it', () => {
    assert.equal(stripReasoning('<think>still thinking', null), '');
});

test('leaves text without reasoning alone, including a later <think> that is not at the start', () => {
    assert.equal(stripReasoning('  Location: tavern  ', null), 'Location: tavern');
    assert.equal(stripReasoning('Answer <think>x</think>', null), 'Answer <think>x</think>');
});

test('an empty answer after thinking says the thinking used up the answer length', () => {
    const message = emptyAnswerError({ raw: '', reasoning: 'Cass is in the hall, so...' });
    assert.match(message, /thinking/);
    assert.match(message, /max answer length/);
});

test('reasoning with no answer after it keeps the existing message', () => {
    assert.equal(emptyAnswerError({ raw: '<think>hmm</think>', reasoning: '' }),
        'The model returned only reasoning and no answer. Try a larger max answer length.');
});

test('a reply with neither an answer nor thinking points to the provider', () => {
    assert.match(emptyAnswerError({ raw: '', reasoning: '' }), /provider/);
});
