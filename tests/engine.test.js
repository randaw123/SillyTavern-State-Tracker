import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunEngine, describeLockStatus, errorText } from '../src/core/engine.js';
import { tracker } from './helpers.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const M = { name: 'message' };
const T = (name, overrides = {}) => tracker({ id: name, name: name.toUpperCase(), ...overrides });

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function harness({ timeoutMs = 1000, now } = {}) {
    const calls = [];
    const commits = [];
    const lockChanges = [];
    const engine = new RunEngine({
        execute: (job, signal) => {
            const d = deferred();
            calls.push({ job, signal, ...d });
            return d.promise;
        },
        commit: (job, outcome) => commits.push({ id: job.tracker.id, ...outcome }),
        onLockChange: locked => lockChanges.push(locked),
        timeoutMs: () => timeoutMs,
        now,
    });
    return { engine, calls, commits, lockChanges };
}

test('in-order trackers run one at a time, in list order', async () => {
    const h = harness();
    const done = h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b')], lockChain: true });
    await tick();
    assert.deepEqual(h.calls.map(c => c.job.tracker.id), ['a']);
    h.calls[0].resolve('A');
    await tick();
    assert.deepEqual(h.calls.map(c => c.job.tracker.id), ['a', 'b']);
    h.calls[1].resolve('B');
    await done;
    assert.deepEqual(h.commits, [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }]);
});

test('parallel trackers start immediately, alongside the in-order chain', async () => {
    const h = harness();
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b'), T('p', { runMode: 'async' })], lockChain: true });
    await tick();
    assert.deepEqual(h.calls.map(c => c.job.tracker.id).sort(), ['a', 'p']);
});

test('the in-order chain holds the lock until it finishes when the chain lock is on', async () => {
    const h = harness();
    const done = h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: true });
    assert.equal(h.engine.locked, true);
    await tick();
    h.calls[0].resolve('A');
    await done;
    assert.equal(h.engine.locked, false);
    assert.deepEqual(h.lockChanges, [true, false]);
});

test('nothing locks when the chain lock is off and parallel trackers have their lock off', async () => {
    const h = harness();
    const done = h.engine.start({
        message: M, swipeId: 0, trackers: [T('a'), T('p', { runMode: 'async', lockWhileRunning: false })], lockChain: false,
    });
    assert.equal(h.engine.locked, false);
    await tick();
    h.calls.forEach(c => c.resolve('x'));
    await done;
    assert.deepEqual(h.lockChanges, []);
});

test('a parallel tracker with its lock on holds the lock even when the chain lock is off', async () => {
    const h = harness();
    h.engine.start({ message: M, swipeId: 0, trackers: [T('p', { runMode: 'async', lockWhileRunning: true })], lockChain: false });
    assert.equal(h.engine.locked, true);
});

test('a tracker already queued or running on the same message and swipe is not started twice', async () => {
    const h = harness();
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false });
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false });
    await tick();
    assert.equal(h.calls.length, 1);
    assert.equal(h.engine.isRunning(M, 0, 'a'), true);
    assert.equal(h.engine.jobStatus(M, 0, 'a'), 'running');
    assert.equal(h.engine.isRunning(M, 1, 'a'), false);
    h.engine.start({ message: M, swipeId: 1, trackers: [T('a')], lockChain: false });
    await tick();
    assert.equal(h.calls.length, 2);
});

test('cancelling locking runs aborts them, stores nothing, releases the lock and skips queued trackers', async () => {
    const h = harness();
    const done = h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b')], lockChain: true });
    await tick();
    assert.equal(h.engine.jobStatus(M, 0, 'b'), 'queued');
    assert.equal(h.engine.cancel(job => job.locking), 2);
    assert.equal(h.calls[0].signal.aborted, true);
    assert.equal(h.engine.locked, false);
    await done;
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.commits, []);
});

test('a result that arrives after cancellation is ignored', async () => {
    const h = harness();
    const done = h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false });
    await tick();
    h.engine.cancel();
    h.calls[0].resolve('late');
    await done;
    assert.deepEqual(h.commits, []);
});

test('a run that takes too long fails with a timeout and aborts its request', async () => {
    const h = harness({ timeoutMs: 20 });
    await h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false });
    assert.deepEqual(h.commits, [{ id: 'a', error: 'Timed out after 0.02 seconds' }]);
    assert.equal(h.calls[0].signal.aborted, true);
});

test('a failed run stores the error, including its cause, and the chain moves on', async () => {
    const h = harness();
    const done = h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b')], lockChain: true });
    await tick();
    h.calls[0].reject(new Error('API request failed', { cause: new Error('HTTP 500') }));
    await tick();
    h.calls[1].resolve('B');
    await done;
    assert.deepEqual(h.commits, [{ id: 'a', error: 'API request failed: HTTP 500' }, { id: 'b', value: 'B' }]);
});

test('execute throwing synchronously counts as a failure', async () => {
    const commits = [];
    const engine = new RunEngine({
        execute: () => { throw new Error('message gone'); },
        commit: (job, outcome) => commits.push(outcome),
    });
    await engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false });
    assert.deepEqual(commits, [{ error: 'message gone' }]);
});

test('waitForUnlock resolves once every locking run has finished', async () => {
    const h = harness();
    await h.engine.waitForUnlock();
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: true });
    let released = false;
    const waiting = h.engine.waitForUnlock().then(() => { released = true; });
    await tick();
    assert.equal(released, false);
    h.calls[0].resolve('A');
    await waiting;
    assert.equal(released, true);
});

test('lockProgress and describeLockStatus report the chain position', async () => {
    const h = harness({ now: () => 1000 });
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b')], lockChain: true });
    await tick();
    const first = h.engine.lockProgress();
    assert.deepEqual(first, { locked: true, total: 2, done: 0, current: 'A', running: 1, currentStartedAt: 1000, lockStartedAt: 1000 });
    assert.equal(describeLockStatus(first, false, 1000), 'Updating trackers 1/2 · A · 0 s');
    h.calls[0].resolve('A');
    await tick();
    assert.equal(describeLockStatus(h.engine.lockProgress(), false, 1000), 'Updating trackers 2/2 · B · 0 s');
    assert.equal(describeLockStatus(h.engine.lockProgress(), true, 1000), 'Waiting for trackers… · 0 s');
    assert.equal(describeLockStatus({ locked: true, total: 1, done: 0, current: null, running: 1 }, false), 'Updating trackers · 1 running');
    assert.equal(describeLockStatus({ locked: false, total: 0, done: 0, current: null, running: 0 }, false), null);
});

test('meta is passed through to jobs', async () => {
    const h = harness();
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a')], lockChain: false, meta: { stamp: 's1' } });
    await tick();
    assert.deepEqual(h.calls[0].job.meta, { stamp: 's1' });
});

test('errorText falls back sensibly', () => {
    assert.equal(errorText(new Error('boom')), 'boom');
    assert.equal(errorText('plain'), 'plain');
    assert.equal(errorText(undefined), 'Unknown error');
});

test('the status line shows how long the current in-order tracker has been running', () => {
    const progress = { locked: true, total: 1, done: 0, current: 'Continuity', running: 1, currentStartedAt: 1000, lockStartedAt: 500 };
    assert.equal(describeLockStatus(progress, false, 13500), 'Updating trackers 1/1 · Continuity · 12 s');
});

test('parallel runs and waiting show how long trackers have been running overall', () => {
    const progress = { locked: true, total: 1, done: 0, current: null, running: 1, currentStartedAt: null, lockStartedAt: 0 };
    assert.equal(describeLockStatus(progress, false, 5400), 'Updating trackers · 1 running · 5 s');
    assert.equal(describeLockStatus(progress, true, 5400), 'Waiting for trackers… · 5 s');
});

test('the next in-order tracker starts its own timer', async () => {
    let clock = 0;
    const h = harness({ now: () => clock });
    h.engine.start({ message: M, swipeId: 0, trackers: [T('a'), T('b')], lockChain: true });
    await tick();
    clock = 7000;
    h.calls[0].resolve('A');
    await tick();
    const progress = h.engine.lockProgress();
    assert.equal(progress.current, 'B');
    assert.equal(progress.currentStartedAt, 7000);
    assert.equal(progress.lockStartedAt, 0);
});
