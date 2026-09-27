// Side panel (spec section 7.3). Answers are shown with textContent only.
import { button, el } from './dom.js';
import { caret, renderAnswer } from './answer-view.js';
import { ctx } from '../st/context.js';
import { displayedSwipeId, getEntries, latestAiIndex } from '../core/answers.js';
import { createCollapseStore } from '../core/collapse.js';

const OPEN_KEY = 'state_tracker_panel_open';

function readOpen() {
    try {
        return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
        return false;
    }
}

function writeOpen(open) {
    try {
        localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
        // Storage can be unavailable (private windows); the panel still works.
    }
}

export function initSidePanel(runtime) {
    const panel = el('div', { id: 'state_tracker_panel', class: 'state-tracker-panel', hidden: true });
    document.body.append(panel);
    let pinned = null;   // a message chosen with its icon, or null to follow the latest reply
    let editing = null;  // { message, trackerId, textarea } while an answer is being edited
    const collapse = createCollapseStore({
        getItem: key => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
    });
    const toggle = (trackerId, category) => {
        collapse.toggle(trackerId, category);
        render();
    };

    const chat = () => ctx().chat ?? [];

    const target = () => {
        const messages = chat();
        if (pinned && messages.includes(pinned)) return { message: pinned, index: messages.indexOf(pinned), latest: false };
        pinned = null;
        const index = latestAiIndex(messages);
        return index === -1 ? null : { message: messages[index], index, latest: true };
    };

    const startEditing = (message, trackerId, value) => {
        editing = { message, trackerId, textarea: el('textarea', { class: 'text_pole', rows: 4, value }) };
        render();
        editing.textarea.focus();
    };

    const renderRow = (tracker, message, entry, enabled) => {
        if (!tracker.enabled) {
            return el('div', { class: 'st-row st-off' },
                el('div', { class: 'st-row-title' }, el('b', { text: tracker.name }), el('span', { class: 'st-badge', text: 'off' })));
        }
        // A tracker being edited stays open, so its text box cannot be hidden mid-edit.
        const isEditing = editing && editing.message === message && editing.trackerId === tracker.id;
        const collapsed = !isEditing && collapse.isCollapsed(tracker.id);
        const title = el('button', {
            type: 'button',
            class: 'st-toggle st-row-title',
            'aria-expanded': String(!collapsed),
            disabled: isEditing,
            onclick: () => toggle(tracker.id),
        }, caret(collapsed), el('b', { text: tracker.name }));
        const row = el('div', { class: 'st-row' }, title);
        const status = runtime.jobStatus(message, tracker.id);
        if (status) title.append(el('span', { class: 'st-badge', text: status === 'queued' ? '⟳ queued' : '⟳ running…' }));
        else if (entry?.value) title.append(el('span', { class: 'st-badge st-ok', text: '✓' }));
        if (entry?.error) title.append(el('span', { class: 'st-badge st-error', text: '✗ failed' }));
        if (entry?.outdated) title.append(el('span', { class: 'st-badge st-warn', text: '⚠ outdated' }));
        if (entry?.edited) title.append(el('span', { class: 'st-badge', text: 'edited' }));
        if (collapsed) return row;

        if (isEditing) {
            row.append(editing.textarea, el('div', { class: 'st-row-buttons' },
                button('Save', () => {
                    runtime.editAnswer(message, tracker.id, editing.textarea.value);
                    editing = null;
                    render();
                }),
                button('Cancel', () => {
                    editing = null;
                    render();
                })));
            return row;
        }

        if (entry?.error) row.append(el('div', { class: 'st-error', text: `✗ ${entry.error}` }));
        if (entry?.value) {
            row.append(renderAnswer(entry.value, {
                isCollapsed: category => collapse.isCollapsed(tracker.id, category),
                onToggle: category => toggle(tracker.id, category),
            }));
        }
        else if (!status && !entry?.error) row.append(el('div', { class: 'st-muted', text: 'no answer yet' }));
        const label = entry?.error ? 'Retry' : entry?.value ? 'Rerun' : 'Run';
        row.append(el('div', { class: 'st-row-buttons' },
            button('Edit', () => startEditing(message, tracker.id, entry?.value ?? ''), { disabled: Boolean(status) }),
            button(label, () => runtime.rerun(message, tracker.id), { disabled: Boolean(status) || !enabled })));
        return row;
    };

    function render() {
        if (panel.hidden) return;
        const settings = runtime.settings();
        const children = [el('div', { class: 'st-panel-header' },
            el('b', { text: 'State Tracker' }),
            el('button', { type: 'button', class: 'menu_button st-icon-button', title: 'Close', onclick: () => setOpen(false) },
                el('i', { class: 'fa-solid fa-xmark' })))];
        const current = target();
        if (!current) {
            children.push(el('div', { class: 'st-muted', text: 'No AI messages in this chat yet.' }));
            panel.replaceChildren(...children);
            return;
        }
        const { message, index, latest } = current;
        const entries = getEntries(message, displayedSwipeId(message));
        children.push(el('div', { class: 'st-panel-target' },
            el('span', { text: latest ? `Latest reply · ${message.name}` : `Message #${index} · ${message.name}` }),
            latest ? null : button('← Back to latest', () => {
                pinned = null;
                editing = null;
                render();
            })));
        if (!settings.enabled) children.push(el('div', { class: 'st-muted', text: 'State Tracker is turned off in the extension settings.' }));
        if (!settings.trackers.length) children.push(el('div', { class: 'st-muted', text: 'No trackers yet. Add one in Extensions → State Tracker.' }));
        const missing = settings.enabled
            && settings.trackers.some(t => t.enabled && !entries[t.id]?.value && !runtime.isRunning(message, t.id));
        if (missing) children.push(button('Run all missing', () => runtime.runMissing(message), { icon: 'fa-play' }));
        for (const tracker of settings.trackers) children.push(renderRow(tracker, message, entries[tracker.id] ?? null, settings.enabled));
        panel.replaceChildren(...children);
    }

    function setOpen(open) {
        panel.hidden = !open;
        writeOpen(open);
        render();
    }

    runtime.subscribe(reason => {
        if (reason === 'chat') {
            pinned = null;
            editing = null;
        }
        if (editing) return; // keep the answer editor stable while typing
        render();
    });
    setOpen(readOpen());

    return {
        toggle: () => setOpen(panel.hidden),
        show(index) {
            const messages = chat();
            if (!messages[index]) return;
            pinned = index === latestAiIndex(messages) ? null : messages[index];
            editing = null;
            setOpen(true);
        },
    };
}
