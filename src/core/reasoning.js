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
