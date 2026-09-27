import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRecentMessages, formatRecentMessages } from '../src/core/messages.js';
import { ai, hidden, user } from './helpers.js';

const chat = () => [ai('S', 'greet'), user('A', 'hi'), ai('S', 'r1'), user('A', 'go'), ai('S', 'r2')];
const texts = list => list.map(m => m.text);

test('collects the last N messages oldest first and formats them as Name: text', () => {
    const got = collectRecentMessages(chat(), { anchorIndex: 4, anchorSwipeId: 0, count: 2, filter: 'all' });
    assert.deepEqual(texts(got), ['go', 'r2']);
    assert.equal(formatRecentMessages(got), 'A: go\n\nS: r2');
});

test('the Counting filter picks AI messages or the user\'s messages only', () => {
    assert.deepEqual(texts(collectRecentMessages(chat(), { anchorIndex: 4, anchorSwipeId: 0, count: 2, filter: 'ai' })), ['r1', 'r2']);
    assert.deepEqual(texts(collectRecentMessages(chat(), { anchorIndex: 4, anchorSwipeId: 0, count: 2, filter: 'user' })), ['hi', 'go']);
});

test('messages hidden from the AI are skipped and do not count', () => {
    const c = chat();
    c[3] = hidden(c[3]);
    assert.deepEqual(texts(collectRecentMessages(c, { anchorIndex: 4, anchorSwipeId: 0, count: 2, filter: 'all' })), ['r1', 'r2']);
});

test('never looks past the anchor, and returns what exists when N is larger than the chat', () => {
    assert.deepEqual(texts(collectRecentMessages(chat(), { anchorIndex: 2, anchorSwipeId: 0, count: 10, filter: 'all' })), ['greet', 'hi', 'r1']);
});

test('the anchor uses the text of the swipe being tracked', () => {
    const c = [user('A', 'hi'), ai('S', ['first', 'second'])];
    assert.deepEqual(texts(collectRecentMessages(c, { anchorIndex: 1, anchorSwipeId: 0, count: 1, filter: 'all' })), ['first']);
});

test('clean receives whether the message is the user\'s and its depth from the newest message', () => {
    const calls = [];
    const clean = (text, info) => { calls.push({ text, ...info }); return text.toUpperCase(); };
    const got = collectRecentMessages(chat(), { anchorIndex: 3, anchorSwipeId: 0, count: 2, filter: 'all', clean });
    assert.deepEqual(texts(got), ['R1', 'GO']);
    assert.deepEqual(calls, [{ text: 'go', isUser: true, depth: 1 }, { text: 'r1', isUser: false, depth: 2 }]);
});
