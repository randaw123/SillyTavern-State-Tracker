import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollapseStore } from '../src/core/collapse.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
    };
}

const brokenStorage = {
    getItem() { throw new Error('storage is blocked'); },
    setItem() { throw new Error('storage is blocked'); },
};

test('everything starts expanded', () => {
    const store = createCollapseStore(memoryStorage());
    assert.equal(store.isCollapsed('trk_a'), false);
    assert.equal(store.isCollapsed('trk_a', 'present'), false);
});

test('toggling collapses and expands, and the setting survives a new store on the same storage', () => {
    const storage = memoryStorage();
    createCollapseStore(storage).toggle('trk_a');
    const reloaded = createCollapseStore(storage);
    assert.equal(reloaded.isCollapsed('trk_a'), true);
    reloaded.toggle('trk_a');
    assert.equal(createCollapseStore(storage).isCollapsed('trk_a'), false);
});

test('collapsing a category leaves its tracker and the same category in other trackers expanded', () => {
    const store = createCollapseStore(memoryStorage());
    store.toggle('trk_a', 'present');
    assert.equal(store.isCollapsed('trk_a', 'present'), true);
    assert.equal(store.isCollapsed('trk_a'), false);
    assert.equal(store.isCollapsed('trk_b', 'present'), false);
});

test('category names match regardless of case', () => {
    const store = createCollapseStore(memoryStorage());
    store.toggle('trk_a', 'present');
    assert.equal(store.isCollapsed('trk_a', 'PRESENT'), true);
});

test('blocked storage still collapses for this session', () => {
    const store = createCollapseStore(brokenStorage);
    store.toggle('trk_a');
    assert.equal(store.isCollapsed('trk_a'), true);
});

test('unreadable saved data starts everything expanded', () => {
    const storage = memoryStorage();
    storage.setItem('state_tracker_collapsed', '{not json');
    assert.equal(createCollapseStore(storage).isCollapsed('trk_a'), false);
});
