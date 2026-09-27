// Reads a tracker answer's line structure for the side panel: category headings, labeled
// lines, and dash entries whose fields are separated by bars. Display only; the stored
// answer is never changed. Pure module so it runs under `node --test`.

const HEADING = /^([^:|]+):$/;
const LABELED = /^([^:|]+):\s+(.+)$/;
const ENTRY = /^[-*•]\s*(.*)$/;
const EMPTY_VALUES = ['', '-', '—', 'none'];

// A heading or label is a short name, so a sentence that happens to contain a colon stays text.
function isName(text) {
    return text.length <= 40 && text.split(/\s+/).length <= 3;
}

function isEmptyValue(text) {
    return EMPTY_VALUES.includes(text.trim().replace(/\.$/, '').toLowerCase());
}

function splitFields(text) {
    return text.split('|').map(field => field.trim()).filter(Boolean);
}

export function parseAnswer(text) {
    const top = [];
    const sections = [];
    const empty = []; // [line number, name], so empty categories keep the answer's order
    let current = null;
    let structured = false;

    const closeSection = () => {
        if (current && current.items.length === 0) empty.push([current.at, current.title]);
        else if (current) sections.push({ title: current.title, items: current.items });
        current = null;
    };

    for (const [at, raw] of String(text ?? '').split(/\r?\n/).entries()) {
        const line = raw.trim();
        if (!line) continue;
        const heading = line.match(HEADING);
        const labeled = line.match(LABELED);
        const entry = line.match(ENTRY);
        // Dash lines come first: an entry may hold a colon ("- note: tired").
        if (entry) {
            structured = true;
            if (!isEmptyValue(entry[1])) (current ? current.items : top).push({ kind: 'entry', fields: splitFields(entry[1]) });
        } else if (heading && isName(heading[1].trim())) {
            closeSection();
            current = { at, title: heading[1].trim(), items: [] };
            structured = true;
        } else if (labeled && isName(labeled[1].trim())) {
            structured = true;
            if (isEmptyValue(labeled[2])) empty.push([at, labeled[1].trim()]);
            else (current ? current.items : top).push({ kind: 'label', label: labeled[1].trim(), fields: splitFields(labeled[2]) });
        } else if (!isEmptyValue(line)) {
            // A bare "none" under a heading leaves the category empty.
            (current ? current.items : top).push({ kind: 'text', text: line });
        }
    }
    closeSection();
    return { plain: !structured, top, sections, empty: empty.sort((a, b) => a[0] - b[0]).map(([, name]) => name) };
}
