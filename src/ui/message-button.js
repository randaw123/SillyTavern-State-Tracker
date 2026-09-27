// Per-message tracker icon and the extensions (wand) menu item (spec section 7.3).
import { el } from './dom.js';
import { LOG_PREFIX } from '../st/context.js';

const BUTTON_HTML = '<div title="State Tracker" class="mes_button mes_state_tracker fa-solid fa-list-check"></div>';

function addButtons(root) {
    root.querySelectorAll('.extraMesButtons').forEach(container => {
        if (!container.querySelector('.mes_state_tracker')) container.insertAdjacentHTML('afterbegin', BUTTON_HTML);
    });
}

export function initMessageButton(panel) {
    const template = document.getElementById('message_template');
    if (template) addButtons(template);
    const chat = document.getElementById('chat');
    if (chat) addButtons(chat);
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('.mes_state_tracker') : null;
        if (!target) return;
        const id = Number(target.closest('.mes')?.getAttribute('mesid'));
        if (Number.isInteger(id)) panel.show(id);
    });
}

export function initMenuItem(panel) {
    const item = el('div', {
        id: 'state_tracker_menu_item',
        class: 'list-group-item flex-container flexGap5',
        title: 'Show or hide the State Tracker panel',
        onclick: () => panel.toggle(),
    }, el('div', { class: 'fa-solid fa-list-check extensionsMenuExtensionButton' }), el('span', { text: 'State Tracker' }));
    const attach = (attempt = 0) => {
        const menu = document.getElementById('extensionsMenu');
        if (menu) {
            menu.append(item);
            return;
        }
        if (attempt < 40) setTimeout(() => attach(attempt + 1), 250);
        else console.warn(`${LOG_PREFIX} Could not find the extensions menu.`);
    };
    attach();
}
