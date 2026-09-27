// Single access point for SillyTavern's documented extension API.

export const MODULE_NAME = 'stateTracker';
export const LOG_PREFIX = '[State Tracker]';

export function ctx() {
    return SillyTavern.getContext();
}

export function getSettings() {
    return ctx().extensionSettings[MODULE_NAME];
}
