// Settings drawer and tracker list (spec section 7.1).
import { button, el, iconButton } from './dom.js';
import { ctx } from '../st/context.js';
import { clampInt, createTracker, duplicateTracker, moveTracker } from '../core/settings.js';
import { openEditor } from './editor.js';
import { exportTrackers, importTrackers } from './transfer-ui.js';

const DELIVERY_LABELS = { inject: 'Inject', none: 'None (panel only)' };

export function initSettingsPanel(runtime) {
    const settings = () => runtime.settings();
    const list = el('div', { class: 'st-tracker-list' });

    const toggle = (label, key, title) => {
        const box = el('input', { type: 'checkbox', checked: settings()[key] });
        box.addEventListener('change', () => {
            settings()[key] = box.checked;
            runtime.saveSettings();
        });
        return el('label', { class: 'checkbox_label', title }, box, el('span', { text: label }));
    };
    const number = (label, key, fallback, min, max, title) => {
        const input = el('input', { type: 'number', class: 'text_pole st-number', min, max, value: String(settings()[key]) });
        input.addEventListener('change', () => {
            settings()[key] = clampInt(input.value, fallback, min, max);
            input.value = String(settings()[key]);
            runtime.saveSettings();
        });
        return el('label', { class: 'st-inline', title }, el('span', { text: label }), input);
    };

    const move = (index, delta) => {
        settings().trackers = moveTracker(settings().trackers, index, delta);
        runtime.saveSettings();
    };
    const remove = async tracker => {
        const { callGenericPopup, POPUP_TYPE, POPUP_RESULT } = ctx();
        const message = el('div', { text: `Delete the tracker "${tracker.name}"? Its stored answers stay hidden in your chats.` });
        if (await callGenericPopup(message, POPUP_TYPE.CONFIRM) !== POPUP_RESULT.AFFIRMATIVE) return;
        settings().trackers = settings().trackers.filter(t => t.id !== tracker.id);
        runtime.saveSettings();
    };

    const row = (tracker, index, count) => {
        const on = el('input', { type: 'checkbox', title: 'On', checked: tracker.enabled });
        on.addEventListener('change', () => {
            tracker.enabled = on.checked;
            runtime.saveSettings();
        });
        const mode = tracker.runMode === 'async' ? 'Parallel' : 'In order';
        const delivery = tracker.delivery === 'macro' ? `Macro {{${tracker.macroName}}}` : DELIVERY_LABELS[tracker.delivery];
        return el('div', { class: 'st-tracker-row' },
            iconButton('fa-arrow-up', 'Move up', () => move(index, -1), { disabled: index === 0 }),
            iconButton('fa-arrow-down', 'Move down', () => move(index, 1), { disabled: index === count - 1 }),
            on,
            el('span', { class: 'st-tracker-name', text: tracker.name }),
            el('span', { class: 'st-muted', text: `${mode} · ${delivery}` }),
            iconButton('fa-pen', 'Edit', () => openEditor(runtime, tracker.id)),
            iconButton('fa-copy', 'Duplicate', () => {
                settings().trackers.push(duplicateTracker(tracker, settings().trackers));
                runtime.saveSettings();
            }),
            iconButton('fa-trash', 'Delete', () => remove(tracker)));
    };

    const renderList = () => {
        const trackers = settings().trackers;
        list.replaceChildren(...(trackers.length
            ? trackers.map((t, i) => row(t, i, trackers.length))
            : [el('div', { class: 'st-muted', text: 'No trackers yet.' })]));
    };

    const content = el('div', { class: 'inline-drawer-content' },
        toggle('Enabled', 'enabled', 'Master switch. When off, nothing runs, nothing is injected, and tracker macros are empty.'),
        number('Request timeout (seconds)', 'timeoutSeconds', 60, 5, 600, 'A tracker request that takes longer than this counts as failed.'),
        toggle('Lock while in-order trackers run', 'lockChain', 'When on, SillyTavern acts busy until the in-order trackers finish.'),
        toggle('Clean messages with regex scripts', 'cleanWithRegex', 'Apply your prompt regex scripts to the messages sent to trackers.'),
        number('Skip replies shorter than (characters, 0 = off)', 'minReplyChars', 0, 0, 100000, 'Automatic runs skip AI replies shorter than this.'),
        el('div', { class: 'st-buttons' },
            button('Add tracker', () => openEditor(runtime, null, createTracker(settings().trackers)), { icon: 'fa-plus' }),
            button('Import', () => importTrackers(runtime), { icon: 'fa-file-import' }),
            button('Export', () => exportTrackers(runtime), { icon: 'fa-file-export' })),
        list);

    const drawer = el('div', { class: 'state-tracker-settings' },
        el('div', { class: 'inline-drawer' },
            el('div', { class: 'inline-drawer-toggle inline-drawer-header' },
                el('b', { text: 'State Tracker' }),
                el('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' })),
            content));
    document.getElementById('extensions_settings2')?.append(drawer);

    runtime.subscribe(reason => {
        if (reason === 'settings') renderList();
    });
    renderList();
}
