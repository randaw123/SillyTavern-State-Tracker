// Status line above the input box while the lock is on (spec section 7.4).
import { el } from './dom.js';
import { ctx } from '../st/context.js';
import { describeLockStatus } from '../core/engine.js';

export function initStatusLine(runtime) {
    const text = el('span', { class: 'st-status-text' });
    const line = el('div', { id: 'state_tracker_status', class: 'state-tracker-status', hidden: true },
        el('i', { class: 'fa-solid fa-spinner fa-spin' }),
        text,
        el('button', { type: 'button', class: 'menu_button st-button', onclick: () => ctx().stopGeneration() }, el('span', { text: 'Stop' })));
    const form = document.getElementById('send_form');
    if (form?.parentElement) form.parentElement.insertBefore(line, form);
    else document.body.append(line);

    const update = () => {
        const message = describeLockStatus(runtime.engine.lockProgress(), runtime.isWaiting());
        line.hidden = !message;
        if (message) text.textContent = message;
    };
    runtime.subscribe(update);
    update();
}
