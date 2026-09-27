import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_FORMAT, applyImport, buildExport, parseImport } from '../src/core/transfer.js';
import { validateTracker } from '../src/core/validate.js';
import { tracker } from './helpers.js';

let counter = 0;
const idFn = () => `new${++counter}`;
const noProfiles = () => '';
const file = trackers => JSON.stringify({ format: EXPORT_FORMAT, version: 1, trackers });

test('buildExport tags the file and records profile names', () => {
    const t = tracker({ name: 'Location', profileId: 'p1' });
    const data = buildExport([t, tracker({ name: 'Mood' })], id => (id === 'p1' ? 'Fast' : ''));
    assert.equal(data.format, EXPORT_FORMAT);
    assert.equal(data.version, 1);
    assert.equal(data.trackers[0].profileName, 'Fast');
    assert.equal(data.trackers[1].profileName, '');
    assert.equal(data.trackers[0].prompt, t.prompt);
});

test('parseImport rejects invalid JSON, other files, newer versions and empty files', () => {
    assert.throws(() => parseImport('{nope'), /not valid JSON/);
    assert.throws(() => parseImport(JSON.stringify({ format: 'other', version: 1, trackers: [] })), /not a State Tracker export/);
    assert.throws(() => parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 2, trackers: [{}] })), /version 2/);
    assert.throws(() => parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, trackers: [] })), /no trackers/);
});

test('parseImport normalizes trackers and keeps their ids and profile names', () => {
    const [item] = parseImport(file([{ id: 'abc', name: 'Location', everyN: '0', profileName: 'Fast' }]));
    assert.equal(item.tracker.id, 'abc');
    assert.equal(item.tracker.everyN, 1);
    assert.equal(item.profileName, 'Fast');
});

test('a new tracker is added as it is', () => {
    const incoming = tracker({ id: 'x', name: 'Mood' });
    const { trackers, notes } = applyImport([], [{ tracker: incoming, profileName: '', action: 'keep-both' }], { resolveProfile: noProfiles, idFn });
    assert.deepEqual(trackers.map(t => t.id), ['x']);
    assert.deepEqual(notes, []);
});

test('replace swaps the existing tracker in place', () => {
    const existing = [tracker({ id: 'a', name: 'Location' }), tracker({ id: 'b', name: 'Mood' })];
    const incoming = tracker({ id: 'a', name: 'Location', prompt: 'new prompt {{recent_messages}}' });
    const { trackers } = applyImport(existing, [{ tracker: incoming, profileName: '', action: 'replace' }], { resolveProfile: noProfiles, idFn });
    assert.deepEqual(trackers.map(t => t.id), ['a', 'b']);
    assert.equal(trackers[0].prompt, 'new prompt {{recent_messages}}');
    assert.equal(trackers[0].name, 'Location');
});

test('keep both gives the copy a new id, a unique name and a unique macro', () => {
    const existing = [tracker({ id: 'a', name: 'Location', delivery: 'macro', macroName: 'location' })];
    const incoming = tracker({ id: 'a', name: 'Location', delivery: 'macro', macroName: 'location' });
    const { trackers, notes } = applyImport(existing, [{ tracker: incoming, profileName: '', action: 'keep-both' }], { resolveProfile: noProfiles, idFn });
    assert.equal(trackers.length, 2);
    assert.notEqual(trackers[1].id, 'a');
    assert.equal(trackers[1].name, 'Location 2');
    assert.equal(trackers[1].macroName, 'location2');
    assert.equal(notes.length, 2);
});

test('two imported trackers with the same macro name, or a name SillyTavern uses, end up distinct', () => {
    const one = tracker({ id: 'x1', name: 'One', delivery: 'macro', macroName: 'char' });
    const two = tracker({ id: 'x2', name: 'Two', delivery: 'macro', macroName: 'char' });
    const { trackers, notes } = applyImport([], [
        { tracker: one, profileName: '', action: 'keep-both' },
        { tracker: two, profileName: '', action: 'keep-both' },
    ], { resolveProfile: noProfiles, idFn, isMacroTakenElsewhere: name => name === 'char' });
    assert.deepEqual(trackers.map(t => t.macroName), ['char2', 'char3']);
    assert.equal(notes.filter(n => /Macro renamed/.test(n.message)).length, 2);
});

test('a missing profile falls back to "Same as chat" with a note; a profile found by name is kept', () => {
    const lost = tracker({ id: 'l', name: 'Lost', profileId: 'gone' });
    const found = tracker({ id: 'f', name: 'Found', profileId: 'old-id' });
    const resolveProfile = (id, name) => (name === 'Fast' ? 'fast-id' : '');
    const { trackers, notes } = applyImport([], [
        { tracker: lost, profileName: 'Nowhere', action: 'keep-both' },
        { tracker: found, profileName: 'Fast', action: 'keep-both' },
    ], { resolveProfile, idFn });
    assert.equal(trackers[0].profileId, '');
    assert.equal(trackers[1].profileId, 'fast-id');
    assert.deepEqual(notes.map(n => n.name), ['Lost']);
});

test('imported macro names that break the editor rules are repaired, with a note', () => {
    const bad = [
        tracker({ id: 'a', name: 'Dash', delivery: 'macro', macroName: 'my-macro' }),
        tracker({ id: 'b', name: 'Digit', delivery: 'macro', macroName: '1loc' }),
        tracker({ id: 'c', name: 'Reserved', delivery: 'macro', macroName: 'state' }),
        tracker({ id: 'd', name: 'Mood Tracker', delivery: 'macro', macroName: '' }),
    ];
    const picks = bad.map(t => ({ tracker: t, profileName: '', action: 'keep-both' }));
    const { trackers, notes } = applyImport([], picks, { resolveProfile: noProfiles, idFn });
    assert.deepEqual(trackers.map(t => t.macroName), ['my_macro', 'm1loc', 'state2', 'mood_tracker']);
    for (const t of trackers) assert.deepEqual(validateTracker(t, trackers).errors, []);
    assert.equal(notes.filter(n => /Macro/.test(n.message)).length, 4);
});
