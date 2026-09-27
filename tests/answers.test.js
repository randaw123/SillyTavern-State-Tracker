import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    adoptBlock, findCurrentValue, generationAnchor, getEntry, latestAiIndex, markOutdated,
    purgeStale, storeAnswer, storeEdit, storeError, swipeStamp, swipeText,
} from '../src/core/answers.js';
import { addSwipe, ai, hidden, roundTrip, showSwipe, user } from './helpers.js';

test('stores an answer on the displayed swipe and mirrors it into that swipe\'s saved data', () => {
    const m = ai('Seraphina', ['one', 'two']);
    storeAnswer(m, 1, 'loc', 'tavern', 5);
    assert.equal(getEntry(m, 'loc').value, 'tavern');
    assert.equal(m.swipe_info[1].extra.state_tracker.entries.loc.value, 'tavern');
    assert.equal(m.swipe_info[0].extra.state_tracker, undefined);
    assert.equal(m.mes, 'two');
    assert.deepEqual(m.swipes, ['one', 'two']);
});

test('a write to a swipe that is not on screen only changes that swipe\'s saved data', () => {
    const m = ai('Seraphina', ['one', 'two']);
    storeAnswer(m, 0, 'loc', 'road', 5);
    assert.equal(getEntry(m, 'loc'), null);
    assert.equal(getEntry(m, 'loc', 0).value, 'road');
    showSwipe(m, 0);
    assert.equal(getEntry(m, 'loc').value, 'road');
});

test('a block copied onto a new swipe does not count and is purged', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    addSwipe(m, 'two');
    assert.ok(m.extra.state_tracker, 'the stale copy is physically present');
    assert.equal(getEntry(m, 'loc'), null);
    assert.equal(purgeStale(m), true);
    assert.equal(m.extra.state_tracker, undefined);
    assert.equal(m.swipe_info[1].extra.state_tracker, undefined);
    assert.equal(getEntry(m, 'loc', 0).value, 'tavern');
});

test('purgeStale keeps a block that belongs to the swipe, so a repeated new-message event is harmless', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    assert.equal(purgeStale(m), false);
    assert.equal(getEntry(m, 'loc').value, 'tavern');
});

test('answers survive saving and reloading the chat, which turns dates into strings', () => {
    const m = ai('Seraphina', ['one', 'two']);
    storeAnswer(m, 1, 'loc', 'tavern', 5);
    storeAnswer(m, 0, 'loc', 'road', 5);
    const loaded = roundTrip(m);
    assert.equal(getEntry(loaded, 'loc').value, 'tavern');
    assert.equal(getEntry(loaded, 'loc', 0).value, 'road');
});

test('messages without swipe data still store answers', () => {
    const m = { name: 'S', is_user: false, mes: 'hi', send_date: 'd1', extra: {} };
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    assert.equal(getEntry(m, 'loc').value, 'tavern');
    assert.equal(swipeText(m, 0), 'hi');
});

test('adoptBlock keeps answers after Continue changes the swipe timestamps', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    const before = swipeStamp(m, 0);
    m.mes += ' and more';
    m.gen_started = new Date(Date.parse('2027-01-01T00:00:00Z'));
    m.send_date = 'later';
    assert.equal(getEntry(m, 'loc'), null);
    assert.equal(adoptBlock(m, before), swipeStamp(m, 0));
    assert.equal(getEntry(m, 'loc').value, 'tavern');
    assert.equal(m.swipe_info[0].extra.state_tracker.stamp, swipeStamp(m, 0));
});

test('adoptBlock ignores a block copied from another swipe', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    addSwipe(m, 'two');
    const current = swipeStamp(m, 1);
    m.gen_started = new Date(Date.parse('2027-01-01T00:00:00Z'));
    adoptBlock(m, current);
    assert.equal(getEntry(m, 'loc'), null);
});

test('an invalid gen_started (left by Continue on a reloaded chat) still matches after saving and reloading', () => {
    const m = ai('Seraphina', ['one']);
    m.gen_started = new Date(Number.NaN);
    m.swipe_info[0].gen_started = m.gen_started;
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    assert.equal(getEntry(roundTrip(m), 'loc')?.value, 'tavern');
});

test('markOutdated flags only entries that have a value (edits keep the swipe timestamps)', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    storeError(m, 0, 'mood', 'boom', 5);
    assert.equal(markOutdated(m), true);
    assert.equal(getEntry(m, 'loc').outdated, true);
    assert.equal(getEntry(m, 'mood').outdated, undefined);
    assert.equal(markOutdated(ai('S', ['x'])), false);
});

test('storeError keeps the previous value, and a later storeAnswer clears the error', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    storeError(m, 0, 'loc', 'timeout', 6);
    assert.deepEqual(getEntry(m, 'loc'), { value: 'tavern', outdated: false, edited: false, updatedAt: 6, error: 'timeout' });
    storeAnswer(m, 0, 'loc', 'road', 7);
    assert.deepEqual(getEntry(m, 'loc'), { value: 'road', outdated: false, edited: false, updatedAt: 7 });
});

test('storeEdit marks the entry edited and clears outdated and error; an empty edit removes it', () => {
    const m = ai('Seraphina', ['one']);
    storeAnswer(m, 0, 'loc', 'tavern', 5);
    markOutdated(m);
    storeError(m, 0, 'loc', 'boom', 6);
    storeEdit(m, 0, 'loc', 'forest', 7);
    assert.deepEqual(getEntry(m, 'loc'), { value: 'forest', outdated: false, edited: true, updatedAt: 7 });
    storeEdit(m, 0, 'loc', '   ', 8);
    assert.equal(getEntry(m, 'loc'), null);
});

test('findCurrentValue walks back to the newest message with a value, skipping failures', () => {
    const chat = [ai('S', 'greet'), user('A', 'hi'), ai('S', 'r1'), user('A', 'go'), ai('S', 'r2')];
    storeAnswer(chat[0], 0, 'loc', 'tavern', 1);
    storeError(chat[2], 0, 'loc', 'boom', 2);
    assert.deepEqual(findCurrentValue(chat, 'loc', 4), { value: 'tavern', index: 0 });
    storeAnswer(chat[4], 0, 'loc', 'road', 3);
    assert.deepEqual(findCurrentValue(chat, 'loc', 4), { value: 'road', index: 4 });
    assert.deepEqual(findCurrentValue(chat, 'loc', 3), { value: 'tavern', index: 0 });
    assert.deepEqual(findCurrentValue(chat, 'loc', 99), { value: 'road', index: 4 });
    assert.equal(findCurrentValue(chat, 'other', 4), null);
});

test('generationAnchor excludes the message a swipe or regenerate is replacing', () => {
    const chat = [ai('S', 'greet'), user('A', 'hi'), ai('S', 'r1')];
    assert.equal(generationAnchor(chat, 'normal'), 2);
    assert.equal(generationAnchor(chat, 'continue'), 2);
    assert.equal(generationAnchor(chat, 'swipe'), 1);
    assert.equal(generationAnchor(chat, 'regenerate'), 1);
    assert.equal(generationAnchor(chat.slice(0, 2), 'regenerate'), 1);
});

test('latestAiIndex skips user messages and hidden messages', () => {
    const chat = [ai('S', 'greet'), user('A', 'hi'), hidden(ai('S', 'secret')), user('A', 'go')];
    assert.equal(latestAiIndex(chat), 0);
    assert.equal(latestAiIndex([]), -1);
});
