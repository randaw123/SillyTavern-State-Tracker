import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTracker } from '../src/core/validate.js';
import { tracker } from './helpers.js';

test('a normal tracker has no errors or warnings', () => {
    const t = tracker({ name: 'Location' });
    assert.deepEqual(validateTracker(t, [t]), { errors: [], warnings: [] });
});

test('the name must be present and unique, ignoring case, but a tracker never clashes with itself', () => {
    const a = tracker({ id: 'a', name: 'Location' });
    const b = tracker({ id: 'b', name: 'location' });
    assert.match(validateTracker(b, [a, b]).errors[0], /already named/);
    assert.equal(validateTracker(a, [a]).errors.length, 0);
    const blank = { ...a, name: '  ' };
    assert.match(validateTracker(blank, [a]).errors[0], /Name cannot be empty/);
});

test('the prompt must be present, and a prompt without {{recent_messages}} only warns', () => {
    const empty = tracker({ prompt: ' ' });
    assert.match(validateTracker(empty, []).errors.join(), /Prompt cannot be empty/);
    const noMessages = tracker({ prompt: 'Where are they?' });
    const report = validateTracker(noMessages, []);
    assert.equal(report.errors.length, 0);
    assert.match(report.warnings[0], /recent_messages/);
});

test('macro trackers need a valid, unreserved, unused macro name', () => {
    const macro = name => tracker({ id: 'm', delivery: 'macro', macroName: name });
    assert.match(validateTracker(macro(''), []).errors[0], /cannot be empty/);
    assert.match(validateTracker(macro('1loc'), []).errors[0], /letters, digits/);
    assert.match(validateTracker(macro('lo-c'), []).errors[0], /letters, digits/);
    assert.match(validateTracker(macro('State'), []).errors[0], /reserved/);
    const other = tracker({ id: 'o', name: 'Other', delivery: 'macro', macroName: 'LOC' });
    assert.match(validateTracker(macro('loc'), [other]).errors[0], /already uses/);
    assert.match(validateTracker(macro('char'), [], { isMacroTakenElsewhere: n => n === 'char' }).errors[0], /already registered/);
    assert.equal(validateTracker(macro('loc_2'), []).errors.length, 0);
});

test('macro name rules are ignored for trackers that do not deliver by macro', () => {
    const t = tracker({ delivery: 'inject', macroName: '!!' });
    assert.equal(validateTracker(t, [t]).errors.length, 0);
});
