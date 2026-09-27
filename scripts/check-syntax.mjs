// Parses every extension source file with `node --check` so syntax errors in
// browser-only modules (which the unit tests never import) are still caught.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = [];
const walk = path => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
        for (const name of readdirSync(path)) walk(join(path, name));
    } else if (path.endsWith('.js')) {
        files.push(path);
    }
};
['index.js', 'src'].forEach(walk);
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax OK: ${files.length} files`);
