import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInjection, injectionKey } from '../src/core/delivery.js';
import { tracker } from './helpers.js';

test('no injection without a value', () => {
    assert.equal(buildInjection(tracker(), ''), null);
    assert.equal(buildInjection(tracker(), '   '), null);
    assert.equal(buildInjection(tracker(), undefined), null);
});

test('the wrapper surrounds the answer and every {{state}} is replaced', () => {
    const t = tracker({ wrapper: '[Location: {{state}}] ({{state}})', position: 'before_prompt', role: 'user', depth: 4 });
    assert.deepEqual(buildInjection(t, 'road'), { text: '[Location: road] (road)', position: 2, depth: 4, role: 1 });
});

test('a blank wrapper sends the answer alone', () => {
    assert.equal(buildInjection(tracker({ wrapper: ' ' }), 'road').text, 'road');
});

test('injection keys are unique per tracker', () => {
    assert.equal(injectionKey('abc'), 'state_tracker_abc');
});
