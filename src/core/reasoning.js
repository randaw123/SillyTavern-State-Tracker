// Removes the "thinking" part reasoning models put before their answer (spec section 4.5, step 6).
// Mirrors SillyTavern's strict parser, and also handles a missing opening tag and unclosed reasoning.

const DEFAULT_TEMPLATE = { prefix: '<think>', suffix: '</think>' };

export function stripReasoning(text, template) {
    const source = String(text ?? '');
    const templates = [template, DEFAULT_TEMPLATE].filter(t => t?.prefix && t?.suffix);
    for (const { prefix, suffix } of templates) {
        const start = source.indexOf(prefix);
        if (start !== -1 && source.slice(0, start).trim() === '') {
            const end = source.indexOf(suffix, start + prefix.length);
            return end === -1 ? '' : source.slice(end + suffix.length).trim();
        }
        if (start === -1) {
            const end = source.indexOf(suffix);
            if (end !== -1) return source.slice(end + suffix.length).trim();
        }
    }
    return source.trim();
}

// Why an answer came back empty. `raw` is the reply text before reasoning was removed, and
// `reasoning` is any thinking the provider returned separately from it.
export function emptyAnswerError({ raw, reasoning }) {
    if (String(raw ?? '').trim()) return 'The model returned only reasoning and no answer. Try a larger max answer length.';
    if (String(reasoning ?? '').trim()) {
        return 'The model used its whole answer length on thinking and returned no answer. Raise the max answer length, or lower the reasoning effort in the connection profile\'s preset.';
    }
    return 'The model returned an empty answer. The provider may have blocked it; the SillyTavern server window shows its response.';
}
