// State Tracker entry point.
import { LOG_PREFIX } from './src/st/context.js';
import { createRuntime } from './src/st/runtime.js';
import { wireEvents } from './src/st/events.js';
import { registerCommands } from './src/st/commands.js';
import { initSettingsPanel } from './src/ui/settings-panel.js';
import { initSidePanel } from './src/ui/side-panel.js';
import { initMenuItem, initMessageButton } from './src/ui/message-button.js';
import { initStatusLine } from './src/ui/status-line.js';

try {
    const runtime = await createRuntime();
    wireEvents(runtime);
    registerCommands(runtime);
    initSettingsPanel(runtime);
    const panel = initSidePanel(runtime);
    initMessageButton(panel);
    initMenuItem(panel);
    initStatusLine(runtime);
    console.log(`${LOG_PREFIX} Loaded.`);
} catch (error) {
    console.error(`${LOG_PREFIX} Failed to load`, error);
}
