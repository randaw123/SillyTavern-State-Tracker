import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyTrigger, isDue, selectContinueTrackers, selectMissingTrackers, selectNewReplyTrackers,
} from '../src/core/schedule.js';
import { storeAnswer, storeError } from '../src/core/answers.js';
import { ai, tracker, user } from './helpers.js';

const base = { stopped: false, minReplyChars: 0, enabled: true };
const idle = () => false;
const ids = list => list.map(t => t.id);

test('classifyTrigger recognises new replies and Continue, and ignores everything else', () => {
    const m = ai('S', 'A reply of reasonable length.');
    for (const type of ['normal', 'regenerate', 'swipe']) assert.equal(classifyTrigger({ ...base, type, message: m }), 'new');
    for (const type of ['continue', 'appendFinal']) assert.equal(classifyTrigger({ ...base, type, message: m }), 'continue');
    for (const type of ['first_message', 'command', 'impersonate', 'quiet', undefined]) {
        assert.equal(classifyTrigger({ ...base, type, message: m }), null);
    }
});

test('classifyTrigger skips when disabled, stopped, short, or not an AI message', () => {
    const m = ai('S', 'Short.');
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: m, enabled: false }), null);
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: m, stopped: true }), null);
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: m, minReplyChars: 10 }), null);
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: m, minReplyChars: 6 }), 'new');
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: user('A', 'hello there') }), null);
    assert.equal(classifyTrigger({ ...base, type: 'normal', message: undefined }), null);
});

test('isDue counts AI replies since the nearest earlier answer', () => {
    const chat = [ai('S', 'g'), user('A', '1'), ai('S', 'r1'), user('A', '2'), ai('S', 'r2'), user('A', '3'), ai('S', 'r3')];
    assert.equal(isDue(chat, 'loc', 6, 3), true, 'no earlier answer means due');
    storeAnswer(chat[2], 0, 'loc', 'tavern', 1);
    assert.equal(isDue(chat, 'loc', 4, 3), false);
    assert.equal(isDue(chat, 'loc', 6, 3), false);
    assert.equal(isDue(chat, 'loc', 6, 2), true);
    storeError(chat[4], 0, 'loc', 'boom', 2);
    assert.equal(isDue(chat, 'loc', 6, 2), true, 'a failed run is not an answer');
});

test('new-reply selection skips trackers that are off, not due, running, or already on this swipe', () => {
    const chat = [ai('S', 'g'), user('A', '1'), ai('S', 'r1')];
    const on = tracker({ name: 'on' });
    const off = tracker({ name: 'off', enabled: false });
    const busy = tracker({ name: 'busy' });
    const slow = tracker({ name: 'slow', everyN: 5 });
    const done = tracker({ name: 'done' });
    storeAnswer(chat[0], 0, slow.id, 'x', 1);
    storeAnswer(chat[2], 0, done.id, 'y', 1);
    const picked = selectNewReplyTrackers({
        trackers: [on, off, busy, slow, done], chat, anchorIndex: 2, swipeId: 0, isRunning: id => id === busy.id,
    });
    assert.deepEqual(ids(picked), [on.id]);
});

test('a repeated new-message event selects nothing once trackers have answered or are running', () => {
    const chat = [ai('S', 'g'), user('A', '1'), ai('S', 'r1')];
    const a = tracker({ name: 'a' });
    const b = tracker({ name: 'b' });
    storeError(chat[2], 0, a.id, 'boom', 1);
    const picked = selectNewReplyTrackers({ trackers: [a, b], chat, anchorIndex: 2, swipeId: 0, isRunning: id => id === b.id });
    assert.deepEqual(picked, []);
});

test('Continue selection keeps trackers with an answer, an error or a run on the message', () => {
    const m = ai('S', 'r1');
    const withValue = tracker({ name: 'v' });
    const withError = tracker({ name: 'e' });
    const running = tracker({ name: 'r' });
    const untouched = tracker({ name: 'u' });
    const offWithValue = tracker({ name: 'o', enabled: false });
    storeAnswer(m, 0, withValue.id, 'x', 1);
    storeError(m, 0, withError.id, 'boom', 1);
    storeAnswer(m, 0, offWithValue.id, 'x', 1);
    const picked = selectContinueTrackers({
        trackers: [withValue, withError, running, untouched, offWithValue], message: m, swipeId: 0, isRunning: id => id === running.id,
    });
    assert.deepEqual(ids(picked), [withValue.id, withError.id, running.id]);
});

test('missing selection keeps trackers that are on, have no value, and are not running', () => {
    const m = ai('S', 'r1');
    const answered = tracker({ name: 'a' });
    const failed = tracker({ name: 'f' });
    const empty = tracker({ name: 'e' });
    const running = tracker({ name: 'r' });
    storeAnswer(m, 0, answered.id, 'x', 1);
    storeError(m, 0, failed.id, 'boom', 1);
    const picked = selectMissingTrackers({ trackers: [answered, failed, empty, running], message: m, swipeId: 0, isRunning: id => id === running.id });
    assert.deepEqual(ids(picked), [failed.id, empty.id]);
    assert.deepEqual(selectMissingTrackers({ trackers: [answered], message: m, swipeId: 0, isRunning: idle }), []);
});
