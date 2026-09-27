// Regression tests for the SillyTavern bridge, run against a fake SillyTavern context.
// They pin SillyTavern timing facts the original plan missed (see the final review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, installFakeSillyTavern } from './fake-sillytavern.js';
import { addSwipe, ai, user } from './helpers.js';

console.warn = () => {}; // the bridge warns that SillyTavern's internal modules are missing in Node
const fake = installFakeSillyTavern();
const { createRuntime } = await import('../src/st/runtime.js');
const { wireEvents } = await import('../src/st/events.js');
const { normalizeTracker } = await import('../src/core/settings.js');
const { getEntry, storeAnswer } = await import('../src/core/answers.js');
const runtime = await createRuntime();
wireEvents(runtime);

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const trackerOf = overrides => normalizeTracker({ id: overrides.name.toLowerCase(), ...overrides });

function reset(trackers, chat) {
    fake.emit(EVENTS.CHAT_CHANGED);
    fake.ctx.chat = chat;
    fake.ctx.powerUserSettings.auto_continue.enabled = false;
    delete fake.body.dataset.generating;
    fake.state.raw.length = 0;
    fake.state.log.length = 0;
    fake.state.rawMaxInFlight = 0;
    runtime.settings().trackers = trackers;
    runtime.saveSettings();
}

test('a generation that starts but never ends (a typed slash command) does not leave the lock stuck', async () => {
    reset([trackerOf({ name: 'Location' })], [user('A', 'hi'), ai('S', 'hello')]);
    fake.emit(EVENTS.GENERATION_STARTED, 'normal', {}, false); // SillyTavern exits early for commands, without GENERATION_ENDED
    await runtime.runMissing(fake.ctx.chat[1]);
    assert.equal(runtime.engine.locked, false);
    assert.deepEqual(fake.state.log, ['deactivate', 'activate']);
    assert.equal(fake.body.dataset.generating, undefined, 'the send button is back');
});

test('"Same as chat" requests never overlap, so SillyTavern\'s reply length setting is never overwritten', async () => {
    reset([
        trackerOf({ name: 'Location' }),
        trackerOf({ name: 'Mood', runMode: 'async' }),
        trackerOf({ name: 'Weather', runMode: 'async' }),
    ], [user('A', 'hi'), ai('S', 'hello')]);
    await runtime.runMissing(fake.ctx.chat[1]);
    assert.equal(fake.state.raw.length, 3);
    assert.equal(fake.state.rawMaxInFlight, 1);
});

test('a Continue delivers the continued message\'s own answers at the pause point', async () => {
    const location = trackerOf({ name: 'Location', wrapper: '[{{state}}]' });
    const chat = [user('A', 'hi'), ai('S', 'hello')];
    reset([location], chat);
    storeAnswer(chat[1], 0, location.id, 'tavern');
    fake.emit(EVENTS.GENERATION_STARTED, 'continue', {}, false);
    chat[1].gen_started = new Date(Date.parse('2030-01-01T00:00:00Z')); // SillyTavern re-times the message as Continue starts
    await globalThis.stateTrackerInterceptor([], 0, () => {}, 'continue');
    assert.equal(fake.state.prompts.state_tracker_location, '[tavern]');
    fake.emit(EVENTS.GENERATION_ENDED);
});

test('a Continue that fails keeps the message\'s answers', async () => {
    const location = trackerOf({ name: 'Location' });
    const chat = [user('A', 'hi'), ai('S', 'hello')];
    reset([location], chat);
    storeAnswer(chat[1], 0, location.id, 'tavern');
    fake.emit(EVENTS.GENERATION_STARTED, 'continue', {}, false);
    chat[1].gen_started = new Date(Date.parse('2030-01-01T00:00:00Z'));
    chat[1].send_date = 'later';
    fake.emit(EVENTS.GENERATION_ENDED); // an API error: no new-message event follows
    assert.equal(getEntry(chat[1], location.id)?.value, 'tavern');
});

test('a Continue never adopts answers copied from another swipe', async () => {
    const location = trackerOf({ name: 'Location' });
    const message = ai('S', 'one');
    reset([location], [user('A', 'hi'), message]);
    storeAnswer(message, 0, location.id, 'tavern');
    addSwipe(message, 'two'); // the new swipe failed, so its copied block was never purged
    fake.emit(EVENTS.GENERATION_STARTED, 'continue', {}, false);
    message.gen_started = new Date(Date.parse('2030-01-01T00:00:00Z'));
    fake.emit(EVENTS.MESSAGE_RECEIVED, 1, 'continue');
    await settle();
    assert.equal(getEntry(message, location.id), null);
    assert.equal(getEntry(message, location.id, 0).value, 'tavern');
});

test('with auto-continue on, trackers wait until SillyTavern is idle and run once on the final text', async () => {
    reset([trackerOf({ name: 'Location' })], [user('A', 'hi'), ai('S', 'hello')]);
    fake.ctx.powerUserSettings.auto_continue.enabled = true;
    fake.body.dataset.generating = 'true'; // SillyTavern is still busy with the reply
    fake.emit(EVENTS.MESSAGE_RECEIVED, 1, 'normal');
    await settle();
    assert.equal(fake.state.raw.length, 0, 'nothing runs while SillyTavern is busy');
    assert.equal(runtime.engine.locked, false, 'the lock does not block auto-continue');
    fake.ctx.chat[1].mes += ' and more'; // auto-continue extends the reply
    fake.emit(EVENTS.MESSAGE_RECEIVED, 1, 'continue');
    delete fake.body.dataset.generating; // SillyTavern goes idle
    await settle(300);
    assert.equal(fake.state.raw.length, 1);
    assert.match(fake.state.raw[0].prompt, /S: hello and more/);
});
