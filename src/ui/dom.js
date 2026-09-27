// Small DOM helpers. Text always goes through textContent, never innerHTML, because
// tracker answers are model output and may contain markup.

export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    let value;
    for (const [key, prop] of Object.entries(props)) {
        if (prop === undefined || prop === null || prop === false) continue;
        if (key === 'class') node.className = prop;
        else if (key === 'text') node.textContent = prop;
        else if (key === 'value') value = prop;
        else if (key === 'checked') node.checked = true;
        else if (key.startsWith('on') && typeof prop === 'function') node.addEventListener(key.slice(2), prop);
        else if (prop === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(prop));
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    if (value !== undefined) node.value = value;
    return node;
}

export function button(label, onClick, { disabled = false, title, icon } = {}) {
    return el('button', { type: 'button', class: 'menu_button st-button', title, disabled, onclick: onClick },
        icon ? el('i', { class: `fa-solid ${icon}` }) : null,
        el('span', { text: label }));
}

export function iconButton(icon, title, onClick, { disabled = false } = {}) {
    return el('button', { type: 'button', class: 'menu_button st-icon-button', title, disabled, onclick: onClick },
        el('i', { class: `fa-solid ${icon}` }));
}
