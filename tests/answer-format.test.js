import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer } from '../src/core/answer-format.js';

test('labeled lines become label rows with their fields split at the bars', () => {
    const parsed = parseAnswer('turn: 2\nenv: 10:03 PM | Saturday | Ronnie\'s flat | Clear night');
    assert.equal(parsed.plain, false);
    assert.deepEqual(parsed.top, [
        { kind: 'label', label: 'turn', fields: ['2'] },
        { kind: 'label', label: 'env', fields: ['10:03 PM', 'Saturday', 'Ronnie\'s flat', 'Clear night'] },
    ]);
    assert.deepEqual(parsed.sections, []);
    assert.deepEqual(parsed.empty, []);
});

test('a heading line starts a section and its dash lines become entries split at the bars', () => {
    const parsed = parseAnswer('present:\n- Jackson | jeans | on the couch\n- Peter | jeans |');
    assert.deepEqual(parsed.top, []);
    assert.deepEqual(parsed.sections, [{
        title: 'present',
        items: [
            { kind: 'entry', fields: ['Jackson', 'jeans', 'on the couch'] },
            { kind: 'entry', fields: ['Peter', 'jeans'] },
        ],
    }]);
});

test('a category holding only none, a dash, or nothing is listed as empty instead of shown', () => {
    const parsed = parseAnswer([
        'offscreen:', '- none',
        'bonds: none',
        'firsts:', '-',
        'mess:',
        'threads:', '- Ronnie | might call their mum',
    ].join('\n'));
    assert.deepEqual(parsed.sections.map(s => s.title), ['threads']);
    assert.deepEqual(parsed.empty, ['offscreen', 'bonds', 'firsts', 'mess']);
});

test('an empty labeled line inside a section is listed as empty without ending the section', () => {
    const parsed = parseAnswer('Seraphina:\nOutfit: none\nMood: tired');
    assert.deepEqual(parsed.sections, [{ title: 'Seraphina', items: [{ kind: 'label', label: 'Mood', fields: ['tired'] }] }]);
    assert.deepEqual(parsed.empty, ['Outfit']);
});

test('other lines inside a section are kept as text', () => {
    const parsed = parseAnswer('present:\n(nobody else is here)');
    assert.deepEqual(parsed.sections, [{ title: 'present', items: [{ kind: 'text', text: '(nobody else is here)' }] }]);
});

test('an answer written in sentences is marked plain', () => {
    assert.equal(parseAnswer('Alex and Seraphina are on the forest road at dusk.\n\nIt is raining.').plain, true);
});

test('a sentence with a colon in it is not mistaken for a label', () => {
    assert.equal(parseAnswer('Alex whispered to her: stay close.').plain, true);
});

test('Windows line endings and surrounding spaces are ignored', () => {
    const parsed = parseAnswer('turn: 2\r\npresent:\r\n  - Jackson | jeans  \r\n');
    assert.deepEqual(parsed.top, [{ kind: 'label', label: 'turn', fields: ['2'] }]);
    assert.deepEqual(parsed.sections, [{ title: 'present', items: [{ kind: 'entry', fields: ['Jackson', 'jeans'] }] }]);
});

test('a dash line is an entry even when it contains a colon', () => {
    const parsed = parseAnswer('convictions:\n- note: tired\n- Ronnie | bedtime | cost: none');
    assert.deepEqual(parsed.sections[0].items, [
        { kind: 'entry', fields: ['note: tired'] },
        { kind: 'entry', fields: ['Ronnie', 'bedtime', 'cost: none'] },
    ]);
    assert.deepEqual(parsed.empty, []);
});
