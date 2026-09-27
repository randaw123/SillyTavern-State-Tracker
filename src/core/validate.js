// Validation rules the tracker editor applies before saving (spec section 3.3).

export const MACRO_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const RESERVED_NAMES = ['state', 'previous_state', 'recent_messages'];

export function validateTracker(tracker, allTrackers, { isMacroTakenElsewhere = () => false } = {}) {
    const errors = [];
    const warnings = [];
    const others = allTrackers.filter(t => t.id !== tracker.id);

    const name = String(tracker.name ?? '').trim();
    if (!name) errors.push('Name cannot be empty.');
    else if (others.some(t => t.name.trim().toLowerCase() === name.toLowerCase())) {
        errors.push(`Another tracker is already named "${name}".`);
    }

    const prompt = String(tracker.prompt ?? '');
    if (!prompt.trim()) errors.push('Prompt cannot be empty.');
    else if (!prompt.includes('{{recent_messages}}')) {
        warnings.push('The prompt does not contain {{recent_messages}}, so the model will not see any chat messages.');
    }

    if (tracker.delivery === 'macro') {
        const macro = String(tracker.macroName ?? '').trim();
        if (!macro) errors.push('Macro name cannot be empty.');
        else if (!MACRO_NAME_PATTERN.test(macro)) {
            errors.push('Macro name may contain only letters, digits and underscores, and must start with a letter.');
        } else if (RESERVED_NAMES.includes(macro.toLowerCase())) {
            errors.push(`"${macro}" is reserved by State Tracker.`);
        } else if (others.some(t => t.delivery === 'macro' && t.macroName.toLowerCase() === macro.toLowerCase())) {
            errors.push(`Another tracker already uses {{${macro}}}.`);
        } else if (isMacroTakenElsewhere(macro)) {
            errors.push(`{{${macro}}} is already registered by SillyTavern or another extension.`);
        }
    }

    return { errors, warnings };
}
