import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_PROMPT, clampInt, createTracker, duplicateTracker, findTrackerByName,
    moveTracker, normalizeSettings, normalizeTracker, uniqueMacroName, uniqueName,
} from '../src/core/settings.js';

let counter = 0;
const idFn = () => `id${++counter}`;

test('normalizeSettings fills every default for missing settings', () => {
    assert.deepEqual(normalizeSettings(undefined), {
        version: 1, enabled: true, timeoutSeconds: 60, lockChain: true,
        cleanWithRegex: true, minReplyChars: 0, trackers: [],
    });
});

test('normalizeSettings clamps numbers and keeps booleans', () => {
    const s = normalizeSettings({ enabled: false, timeoutSeconds: 1, minReplyChars: -5, lockChain: false });
    assert.equal(s.enabled, false);
    assert.equal(s.timeoutSeconds, 5);
    assert.equal(s.minReplyChars, 0);
    assert.equal(s.lockChain, false);
    assert.equal(normalizeSettings({ timeoutSeconds: 9999 }).timeoutSeconds, 600);
    assert.equal(normalizeSettings({ timeoutSeconds: 'abc' }).timeoutSeconds, 60);
});

test('normalizeTracker fills defaults, keeps the id and repairs bad values', () => {
    const t = normalizeTracker({ id: 'keep', name: '  Location ', runMode: 'weird', everyN: 0, depth: -3, macroName: ' loc ' }, idFn);
    assert.equal(t.id, 'keep');
    assert.equal(t.name, 'Location');
    assert.equal(t.runMode, 'sync');
    assert.equal(t.everyN, 1);
    assert.equal(t.depth, 0);
    assert.equal(t.macroName, 'loc');
    assert.equal(t.prompt, DEFAULT_PROMPT);
    assert.equal(t.delivery, 'inject');
    assert.equal(t.wrapper, '{{state}}');
});

test('normalizeTracker creates an id and a name when they are missing', () => {
    const t = normalizeTracker({}, () => 'fresh');
    assert.equal(t.id, 'fresh');
    assert.equal(t.name, 'New tracker');
});

test('normalizeSettings normalizes each tracker', () => {
    const s = normalizeSettings({ trackers: [{ id: 'a', maxTokens: '50' }] }, idFn);
    assert.equal(s.trackers[0].maxTokens, 50);
    assert.equal(s.trackers[0].id, 'a');
});

test('clampInt parses and clamps', () => {
    assert.equal(clampInt('7', 1, 1, 5), 5);
    assert.equal(clampInt('x', 3, 1), 3);
    assert.equal(clampInt(0, 3, 1), 1);
});

test('uniqueName and uniqueMacroName add numbers, ignoring case', () => {
    assert.equal(uniqueName('New tracker', ['new tracker']), 'New tracker 2');
    assert.equal(uniqueName('Mood', ['Location']), 'Mood');
    assert.equal(uniqueMacroName('location', ['Location', 'location2']), 'location3');
});

test('createTracker picks an unused default name', () => {
    const first = createTracker([], idFn);
    const second = createTracker([first], idFn);
    assert.equal(first.name, 'New tracker');
    assert.equal(second.name, 'New tracker 2');
    assert.notEqual(first.id, second.id);
});

test('duplicateTracker gives the copy a new id, a "(copy)" name and a unique macro', () => {
    const source = normalizeTracker({ id: 'src', name: 'Outfit', delivery: 'macro', macroName: 'outfit' }, idFn);
    const copy = duplicateTracker(source, [source], idFn);
    assert.notEqual(copy.id, 'src');
    assert.equal(copy.name, 'Outfit (copy)');
    assert.equal(copy.macroName, 'outfit2');
    assert.equal(copy.prompt, source.prompt);
});

test('moveTracker moves within bounds and ignores moves past the ends', () => {
    const list = ['a', 'b', 'c'].map(id => normalizeTracker({ id }, idFn));
    assert.deepEqual(moveTracker(list, 2, -1).map(t => t.id), ['a', 'c', 'b']);
    assert.deepEqual(moveTracker(list, 0, 1).map(t => t.id), ['b', 'a', 'c']);
    assert.deepEqual(moveTracker(list, 0, -1).map(t => t.id), ['a', 'b', 'c']);
});

test('findTrackerByName ignores case and surrounding spaces', () => {
    const list = [normalizeTracker({ id: 'a', name: 'Location' }, idFn)];
    assert.equal(findTrackerByName(list, ' location ').id, 'a');
    assert.equal(findTrackerByName(list, 'nope'), null);
});
