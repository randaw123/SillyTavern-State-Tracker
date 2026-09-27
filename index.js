// State Tracker entry point.
import { LOG_PREFIX } from './src/st/context.js';
import { createRuntime } from './src/st/runtime.js';
import { wireEvents } from './src/st/events.js';
import { registerCommands } from './src/st/commands.js';

try {
    const runtime = await createRuntime();
    wireEvents(runtime);
    registerCommands(runtime);
    console.log(`${LOG_PREFIX} Loaded.`);
} catch (error) {
    console.error(`${LOG_PREFIX} Failed to load`, error);
}
