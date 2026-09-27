import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearGenerationAnchor, currentAnchor, setGenerationAnchor, withAnchor } from '../src/core/anchor.js';

test('defaults to the newest message, then the generation anchor, then an explicit anchor', () => {
    clearGenerationAnchor();
    assert.equal(currentAnchor(10), 9);
    setGenerationAnchor(7);
    assert.equal(currentAnchor(10), 7);
    assert.equal(withAnchor(3, () => currentAnchor(10)), 3);
    assert.equal(currentAnchor(10), 7);
    clearGenerationAnchor();
});

test('withAnchor nests and restores even when the callback throws', () => {
    clearGenerationAnchor();
    withAnchor(2, () => {
        assert.equal(withAnchor(1, () => currentAnchor(10)), 1);
        assert.equal(currentAnchor(10), 2);
    });
    assert.throws(() => withAnchor(4, () => { throw new Error('boom'); }));
    assert.equal(currentAnchor(10), 9);
});
