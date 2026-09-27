// Export file format and import merge rules (spec section 7.6).
import { newId, normalizeTracker, uniqueMacroName, uniqueName } from './settings.js';
import { MACRO_NAME_PATTERN, RESERVED_NAMES } from './validate.js';

export const EXPORT_FORMAT = 'sillytavern-state-tracker';
export const EXPORT_VERSION = 1;

export function buildExport(trackers, profileNameOf = () => '') {
    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        trackers: trackers.map(t => ({ ...t, profileName: t.profileId ? (profileNameOf(t.profileId) || '') : '' })),
    };
}

export function parseImport(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('The file is not valid JSON.');
    }
    if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT) {
        throw new Error('The file is not a State Tracker export.');
    }
    if (!Number.isInteger(data.version) || data.version < 1) throw new Error('The file has no valid format version.');
    if (data.version > EXPORT_VERSION) {
        throw new Error(`The file uses format version ${data.version}, which this version of State Tracker cannot read.`);
    }
    if (!Array.isArray(data.trackers) || data.trackers.length === 0) throw new Error('The file contains no trackers.');
    return data.trackers.map(raw => ({ tracker: normalizeTracker(raw), profileName: String(raw?.profileName ?? '') }));
}

// Turns an imported macro name into one the editor would accept (spec section 3.3).
function allowedMacroName(raw, trackerName) {
    let name = String(raw ?? '').trim() || String(trackerName ?? '').trim().toLowerCase();
    name = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'tracker';
    if (!MACRO_NAME_PATTERN.test(name)) name = `m${name}`;
    if (RESERVED_NAMES.includes(name.toLowerCase())) name = `${name}2`;
    return name;
}

export function applyImport(existing, picks, { resolveProfile, isMacroTakenElsewhere = () => false, idFn = newId }) {
    const trackers = existing.map(t => ({ ...t }));
    const notes = [];
    for (const { tracker: incoming, profileName = '', action = 'keep-both' } of picks) {
        const t = { ...incoming };
        const index = trackers.findIndex(x => x.id === t.id);
        const replacing = index !== -1 && action === 'replace';
        if (index !== -1 && !replacing) t.id = idFn();
        const others = replacing ? trackers.filter((_, i) => i !== index) : trackers;

        const originalName = t.name;
        t.name = uniqueName(t.name, others.map(x => x.name));
        if (t.name !== originalName) {
            notes.push({ name: t.name, message: `Renamed from "${originalName}" because that name was taken.` });
        }

        if (t.delivery === 'macro') {
            const base = allowedMacroName(t.macroName, t.name);
            const taken = others.filter(x => x.delivery === 'macro').map(x => x.macroName);
            let macro = base;
            while (taken.some(n => n.toLowerCase() === macro.toLowerCase()) || isMacroTakenElsewhere(macro)) {
                taken.push(macro);
                macro = uniqueMacroName(base, taken);
            }
            if (!t.macroName) {
                notes.push({ name: t.name, message: `Macro name was empty, so it is now {{${macro}}}.` });
            } else if (macro !== t.macroName) {
                const reason = base !== t.macroName ? 'is not allowed' : 'was taken';
                notes.push({ name: t.name, message: `Macro renamed from {{${t.macroName}}} to {{${macro}}} because the original name ${reason}.` });
            }
            t.macroName = macro;
        }

        if (t.profileId) {
            const resolved = resolveProfile(t.profileId, profileName) || '';
            if (!resolved) notes.push({ name: t.name, message: 'Its connection profile does not exist here, so it now uses "Same as chat".' });
            t.profileId = resolved;
        }

        if (replacing) trackers[index] = t;
        else trackers.push(t);
    }
    return { trackers, notes };
}
