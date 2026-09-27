// Console logging at the level chosen in the settings: off, error (failed runs), info (every
// run) or debug (also the prompts sent and the raw responses, including any thinking).
import { getSettings, LOG_PREFIX } from './context.js';
import { logAllows } from '../core/settings.js';

const allowed = level => logAllows(getSettings()?.logLevel ?? 'error', level);

export const log = {
    error: (...args) => allowed('error') && console.error(LOG_PREFIX, ...args),
    info: (...args) => allowed('info') && console.info(LOG_PREFIX, ...args),
    // console.log rather than console.debug, which browsers hide unless verbose output is on.
    debug: (...args) => allowed('debug') && console.log(LOG_PREFIX, ...args),
};
