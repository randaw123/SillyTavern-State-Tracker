// Export download and import picker (spec section 7.6).
import { el } from './dom.js';
import { ctx } from '../st/context.js';
import { applyImport, buildExport, parseImport } from '../core/transfer.js';

export function exportTrackers(runtime) {
    const data = buildExport(runtime.settings().trackers, id => runtime.profileName(id));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `state-trackers-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importTrackers(runtime) {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        let items;
        try {
            items = parseImport(await file.text());
        } catch (error) {
            toastr.error(error.message, 'State Tracker import');
            return;
        }
        await chooseAndApply(runtime, items);
    });
    input.click();
}

async function chooseAndApply(runtime, items) {
    const { callGenericPopup, POPUP_TYPE, POPUP_RESULT } = ctx();
    const existing = runtime.settings().trackers;
    const rows = items.map(item => {
        const pick = el('input', { type: 'checkbox', checked: true });
        const conflict = existing.find(t => t.id === item.tracker.id);
        const action = conflict
            ? el('select', { class: 'text_pole', value: 'replace' },
                el('option', { value: 'replace', text: `Replace "${conflict.name}"` }),
                el('option', { value: 'keep-both', text: 'Keep both' }))
            : null;
        const node = el('div', { class: 'st-import-row' },
            el('label', { class: 'checkbox_label' }, pick, el('span', { text: item.tracker.name })), action);
        return { item, pick, action, node };
    });
    const body = el('div', { class: 'st-import' }, el('h3', { text: 'Import trackers' }), ...rows.map(r => r.node));
    const result = await callGenericPopup(body, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Import', cancelButton: 'Cancel', wide: true, allowVerticalScrolling: true, leftAlign: true,
    });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;
    const picks = rows.filter(r => r.pick.checked).map(r => ({ ...r.item, action: r.action?.value ?? 'keep-both' }));
    if (!picks.length) return;
    const { trackers, notes } = applyImport(existing, picks, {
        resolveProfile: (id, name) => runtime.resolveProfile(id, name),
        isMacroTakenElsewhere: runtime.isMacroTakenElsewhere,
    });
    runtime.settings().trackers = trackers;
    runtime.saveSettings();
    toastr.success(`Imported ${picks.length} tracker(s).`, 'State Tracker');
    for (const note of notes) toastr.warning(note.message, note.name, { timeOut: 10000 });
}
