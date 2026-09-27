import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LockController } from '../src/core/lock.js';

function makeLock() {
    const log = [];
    const later = [];
    const lock = new LockController({
        apply: () => log.push('apply'),
        release: () => log.push('release'),
        defer: fn => later.push(fn),
    });
    return { lock, log, flush: () => later.splice(0).forEach(fn => fn()) };
}

test('applies when wanted and releases when no longer wanted while idle', () => {
    const { lock, log } = makeLock();
    lock.setWanted(true);
    lock.setWanted(false);
    assert.deepEqual(log, ['apply', 'release']);
});

test('setting the same state twice does nothing', () => {
    const { lock, log } = makeLock();
    lock.setWanted(true);
    lock.setWanted(true);
    lock.setWanted(false);
    lock.setWanted(false);
    assert.deepEqual(log, ['apply', 'release']);
});

test('never releases while SillyTavern is generating (trap 2)', () => {
    const { lock, log } = makeLock();
    lock.setWanted(true);
    lock.generationStarted();
    lock.setWanted(false);
    assert.deepEqual(log, ['apply']);
    lock.generationEnded();
    assert.deepEqual(log, ['apply']);
});

test('re-applies after SillyTavern ends a generation while the lock is still wanted (trap 1)', () => {
    const { lock, log, flush } = makeLock();
    lock.generationStarted();
    lock.setWanted(true);
    lock.generationEnded();
    assert.deepEqual(log, ['apply']);
    flush();
    assert.deepEqual(log, ['apply', 'apply']);
});

test('a deferred re-apply is skipped if the lock was released meanwhile', () => {
    const { lock, log, flush } = makeLock();
    lock.setWanted(true);
    lock.generationEnded();
    lock.setWanted(false);
    flush();
    assert.deepEqual(log, ['apply', 'release']);
});
