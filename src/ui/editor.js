// Tracker editor popup with the Test button (spec sections 7.2 and 7.5).
import { button, el, iconButton } from './dom.js';
import { renderRun } from './answer-view.js';
import { ctx } from '../st/context.js';
import { normalizeTracker } from '../core/settings.js';
import { validateTracker } from '../core/validate.js';
import { latestAiIndex } from '../core/answers.js';

const FILTER_LABELS = { ai: 'AI only', user: 'Mine only', all: 'All' };
const POSITION_LABELS = { in_chat: 'In chat', before_prompt: 'Before main prompt', after_prompt: 'After main prompt' };
const ROLE_LABELS = { system: 'System', user: 'User', assistant: 'Assistant' };

function select(options, value) {
    return el('select', { class: 'text_pole', value },
        Object.entries(options).map(([key, label]) => el('option', { value: key, text: label })));
}

function radioGroup(name, options, value) {
    const inputs = {};
    const group = el('div', { class: 'st-radio-group' }, Object.entries(options).map(([key, label]) => {
        inputs[key] = el('input', { type: 'radio', name, value: key, checked: key === value });
        return el('label', { class: 'checkbox_label' }, inputs[key], el('span', { text: label }));
    }));
    return { group, get value() { return Object.keys(inputs).find(key => inputs[key].checked); } };
}

function field(label, control, hint) {
    return el('div', { class: 'st-field' },
        el('label', { text: label }),
        control,
        hint ? el('small', { class: 'st-muted', text: hint }) : null);
}

function numberInput(value, min) {
    return el('input', { type: 'number', class: 'text_pole st-number', min, value: String(value) });
}

function profileSelect(runtime, selectedId) {
    const profiles = runtime.profiles();
    const options = [el('option', { value: '', text: 'Same as chat' }), ...profiles.map(p => el('option', { value: p.id, text: p.name }))];
    if (selectedId && !profiles.some(p => p.id === selectedId)) {
        options.push(el('option', { value: selectedId, text: 'Missing profile', disabled: true }));
    }
    return el('select', { class: 'text_pole', value: selectedId }, options);
}

export async function openEditor(runtime, trackerId, draft = null) {
    const { callGenericPopup, POPUP_TYPE, POPUP_RESULT } = ctx();
    const base = trackerId ? runtime.settings().trackers.find(t => t.id === trackerId) : draft;
    if (!base) return;
    const uid = `st_${Math.random().toString(36).slice(2, 8)}`;

    const name = el('input', { type: 'text', class: 'text_pole', value: base.name });
    const enabled = el('input', { type: 'checkbox', checked: base.enabled });
    const runMode = radioGroup(`${uid}_mode`, { sync: 'In order', async: 'Parallel' }, base.runMode);
    const lockWhileRunning = el('input', { type: 'checkbox', checked: base.lockWhileRunning });
    const lockRow = el('label', { class: 'checkbox_label' }, lockWhileRunning, el('span', { text: 'Lock while running' }));
    const everyN = numberInput(base.everyN, 1);
    const profile = profileSelect(runtime, base.profileId);
    const maxTokens = numberInput(base.maxTokens, 1);
    const messageCount = numberInput(base.messageCount, 1);
    const messageFilter = select(FILTER_LABELS, base.messageFilter);
    const systemPrompt = el('textarea', { class: 'text_pole', rows: 3, value: base.systemPrompt });
    const prompt = el('textarea', { class: 'text_pole', rows: 10, value: base.prompt });
    const extraList = el('div', { class: 'st-extra-list' });
    const extraRows = [];
    const addExtraRow = ({ text = '', role = 'system', depth = 0 } = {}) => {
        const row = {
            role: select(ROLE_LABELS, role),
            depth: numberInput(depth, 0),
            text: el('textarea', { class: 'text_pole', rows: 2, value: text }),
        };
        const remove = iconButton('fa-trash', 'Remove this prompt', () => {
            extraRows.splice(extraRows.indexOf(row), 1);
            row.node.remove();
            showReport(validate());
        });
        row.node = el('div', { class: 'st-extra-prompt' },
            el('div', { class: 'st-inline' }, field('Role', row.role), field('Depth', row.depth), remove),
            row.text);
        extraRows.push(row);
        extraList.append(row.node);
    };
    for (const extra of base.extraPrompts ?? []) addExtraRow(extra);
    const delivery = radioGroup(`${uid}_delivery`, { inject: 'Inject', macro: 'Macro', none: 'None (panel only)' }, base.delivery);
    const macroName = el('input', { type: 'text', class: 'text_pole', value: base.macroName });
    const position = select(POSITION_LABELS, base.position);
    const depth = numberInput(base.depth, 0);
    const role = select(ROLE_LABELS, base.role);
    const wrapper = el('textarea', { class: 'text_pole', rows: 2, value: base.wrapper });
    const messages = el('div', { class: 'st-editor-messages' });
    const testOutput = el('div', { class: 'st-test-output' });

    const macroSection = el('div', { class: 'st-section' },
        field('Macro name', el('div', { class: 'st-inline' }, el('span', { text: '{{' }), macroName, el('span', { text: '}}' }))));
    const depthRow = field('Depth', depth, '0 means the very end of the chat.');
    const injectSection = el('div', { class: 'st-section' },
        field('Position', position), depthRow, field('Role', role),
        field('Wrapper', wrapper, '{{state}} is replaced by the answer.'));

    const read = () => normalizeTracker({
        ...base,
        name: name.value,
        enabled: enabled.checked,
        runMode: runMode.value,
        lockWhileRunning: lockWhileRunning.checked,
        everyN: everyN.value,
        profileId: profile.value,
        maxTokens: maxTokens.value,
        messageCount: messageCount.value,
        messageFilter: messageFilter.value,
        systemPrompt: systemPrompt.value,
        prompt: prompt.value,
        extraPrompts: extraRows.map(row => ({ text: row.text.value, role: row.role.value, depth: row.depth.value })),
        delivery: delivery.value,
        macroName: macroName.value,
        position: position.value,
        depth: depth.value,
        role: role.value,
        wrapper: wrapper.value,
    });
    const validate = () => validateTracker(read(), runtime.settings().trackers, { isMacroTakenElsewhere: runtime.isMacroTakenElsewhere });
    const showReport = ({ errors, warnings }) => messages.replaceChildren(
        ...errors.map(text => el('div', { class: 'st-error', text })),
        ...warnings.map(text => el('div', { class: 'st-warning', text })));

    const updateVisibility = () => {
        lockRow.hidden = runMode.value !== 'async';
        macroSection.hidden = delivery.value !== 'macro';
        injectSection.hidden = delivery.value !== 'inject';
        depthRow.hidden = position.value !== 'in_chat';
    };

    const canTest = latestAiIndex(ctx().chat ?? []) !== -1;
    const test = async () => {
        testOutput.replaceChildren(el('div', { class: 'st-muted', text: 'Running…' }));
        try {
            const result = await runtime.testTracker(read());
            const last = result.messages.length - 1;
            const label = (m, i) => (i === last && m.role === 'assistant' ? 'ASSISTANT (START OF ANSWER)' : m.role.toUpperCase());
            testOutput.replaceChildren(
                result.run ? renderRun(result.run) : null,
                ...result.messages.map((m, i) => el('div', { class: 'st-test-message' }, el('b', { text: label(m, i) }), el('pre', { text: m.content }))),
                el('div', { class: 'st-test-message' }, el('b', { text: 'ANSWER' }), el('pre', { text: result.answer })));
        } catch (error) {
            testOutput.replaceChildren(el('div', { class: 'st-error', text: error?.message || String(error) }));
        }
    };

    const form = el('div', { class: 'st-editor' },
        el('h3', { text: trackerId ? 'Edit tracker' : 'New tracker' }),
        el('div', { class: 'st-inline' }, field('Name', name), el('label', { class: 'checkbox_label' }, enabled, el('span', { text: 'On' }))),
        field('Run mode', el('div', { class: 'st-inline' }, runMode.group, lockRow), 'In order: runs one at a time in list order. Parallel: starts right away.'),
        field('Run every N AI replies', everyN),
        el('div', { class: 'st-inline' }, field('Model', profile), field('Max answer length (tokens)', maxTokens)),
        el('div', { class: 'st-inline' }, field('Messages to include', messageCount), field('Counting', messageFilter)),
        field('System prompt (optional)', systemPrompt),
        field('Prompt', prompt, 'Placeholders: {{previous_state}} and {{recent_messages}}. SillyTavern macros such as {{char}} and {{user}} also work.'),
        field('Extra prompts (optional)',
            el('div', { class: 'st-extra-prompts' }, extraList, el('div', { class: 'st-buttons' }, button('Add prompt', () => addExtraRow(), { icon: 'fa-plus' }))),
            'Each extra prompt is sent as its own message, and the same placeholders and macros work. Depth 0 puts it after the prompt, 1 before the prompt, and 2 or more before the system prompt. An Assistant prompt at depth 0 is the start of the answer: the model continues from it, and it is kept at the front of the answer.'),
        field('Delivery', delivery.group),
        macroSection,
        injectSection,
        messages,
        el('div', { class: 'st-buttons' },
            button('Test', test, { icon: 'fa-flask', disabled: !canTest }),
            canTest ? null : el('small', { class: 'st-muted', text: 'Open a chat with at least one AI message to test.' })),
        testOutput);

    form.addEventListener('change', updateVisibility);
    form.addEventListener('input', () => showReport(validate()));
    updateVisibility();
    showReport(validate());

    await callGenericPopup(form, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        leftAlign: true,
        onClosing: popup => {
            if (popup.result !== POPUP_RESULT.AFFIRMATIVE) return true;
            const report = validate();
            showReport(report);
            if (report.errors.length) return false;
            const tracker = read();
            const trackers = runtime.settings().trackers;
            const index = trackers.findIndex(t => t.id === tracker.id);
            if (index === -1) trackers.push(tracker);
            else trackers[index] = tracker;
            runtime.saveSettings();
            return true;
        },
    });
}
