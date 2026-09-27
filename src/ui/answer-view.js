// Draws a tracker answer in the side panel from its line structure (core/answer-format.js).
// Display only: the stored answer, the Edit box and the injected state are unchanged.
// Text goes through el(), so it is always set with textContent.
import { el } from './dom.js';
import { parseAnswer } from '../core/answer-format.js';

export function caret(collapsed) {
    return el('i', { class: `fa-solid ${collapsed ? 'fa-caret-right' : 'fa-caret-down'}` });
}

function renderEntry(item) {
    if (item.fields.length === 1) return el('div', { class: 'st-entry st-entry-single', text: item.fields[0] });
    const [name, ...fields] = item.fields;
    return el('div', { class: 'st-entry' },
        el('div', { class: 'st-entry-name', text: name }),
        fields.map(field => el('div', { class: 'st-entry-field', text: field })));
}

// Consecutive labeled lines share one grid so their values line up.
function renderItems(items) {
    const out = [];
    let labels = [];
    const flushLabels = () => {
        if (labels.length) {
            out.push(el('div', { class: 'st-labels' }, labels.flatMap(item => [
                el('span', { class: 'st-label', text: item.label }),
                el('span', { text: item.fields.join(' · ') }),
            ])));
        }
        labels = [];
    };
    for (const item of items) {
        if (item.kind === 'label') {
            labels.push(item);
            continue;
        }
        flushLabels();
        out.push(item.kind === 'entry' ? renderEntry(item) : el('div', { text: item.text }));
    }
    flushLabels();
    return out;
}

// One line naming the model that ran and how long it took, such as "z-ai/glm-4.7 · 38 s".
// The connection profile, model, exact time and amount of thinking are in the hover text.
// A run that timed out while still queued has no time.
export function renderRun(run) {
    const hasTime = typeof run.ms === 'number';
    const seconds = !hasTime ? null : run.ms < 10000 ? (run.ms / 1000).toFixed(1) : String(Math.round(run.ms / 1000));
    const source = run.profile === 'Same as chat' ? ['Same as chat', run.model] : [run.model || run.profile];
    const title = [
        `Connection: ${run.profile}`,
        `Model: ${run.model || 'unknown'}`,
        `Time: ${hasTime ? `${run.ms} ms` : 'not sent'}`,
        ...(run.thinkingChars ? [`Thinking: ${run.thinkingChars.toLocaleString()} characters`] : []),
    ].join('\n');
    return el('div', {
        class: 'st-muted st-run',
        text: [...source.filter(Boolean), ...(hasTime ? [`${seconds} s`] : [])].join(' · '),
        title,
    });
}

export function renderAnswer(text, { isCollapsed, onToggle }) {
    const parsed = parseAnswer(text);
    if (parsed.plain) return el('div', { class: 'st-answer', text });
    return el('div', { class: 'st-answer-structured' },
        renderItems(parsed.top),
        parsed.sections.map(section => {
            const collapsed = isCollapsed(section.title);
            return el('div', { class: 'st-category' },
                el('button', {
                    type: 'button',
                    class: 'st-toggle st-category-title',
                    'aria-expanded': String(!collapsed),
                    onclick: () => onToggle(section.title),
                }, caret(collapsed), el('span', { text: section.title }),
                collapsed ? el('span', { class: 'st-badge', text: `(${section.items.length})` }) : null),
                collapsed ? null : renderItems(section.items));
        }),
        parsed.empty.length ? el('div', { class: 'st-muted st-empty', text: `Empty: ${parsed.empty.join(', ')}` }) : null);
}
