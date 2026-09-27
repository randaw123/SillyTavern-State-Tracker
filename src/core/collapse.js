// Remembers which trackers and answer categories are collapsed in the side panel, per
// browser. Storage can be missing or blocked (private windows), so every read and write
// is guarded and the in-memory copy keeps working for the session.

const STORAGE_KEY = 'state_tracker_collapsed';

function keyOf(trackerId, category) {
    return category === undefined ? trackerId : `${trackerId}\u0000${String(category).toLowerCase()}`;
}

function load(storage) {
    try {
        const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
        return new Set(Array.isArray(saved) ? saved : []);
    } catch {
        return new Set();
    }
}

export function createCollapseStore(storage) {
    const collapsed = load(storage);
    return {
        isCollapsed: (trackerId, category) => collapsed.has(keyOf(trackerId, category)),
        toggle(trackerId, category) {
            const key = keyOf(trackerId, category);
            if (collapsed.has(key)) collapsed.delete(key);
            else collapsed.add(key);
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
            } catch {
                // Not saved; the setting still holds until the page reloads.
            }
        },
    };
}
