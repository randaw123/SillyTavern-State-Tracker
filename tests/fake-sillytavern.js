// A small fake of the SillyTavern context, enough to run src/st against in Node.
// It mimics the behaviours the bridge depends on: event emission, the send-button
// lock (body[data-generating]), injections, macros and raw generation.

export const EVENTS = {
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_SWIPED: 'message_swiped',
    CHAT_CHANGED: 'chat_id_changed',
};

export function installFakeSillyTavern() {
    const handlers = {};
    const body = { dataset: {} };
    const state = { prompts: {}, macros: new Map(), log: [], raw: [], rawInFlight: 0, rawMaxInFlight: 0, rawReply: () => 'answer' };
    const emit = (name, ...args) => {
        for (const fn of handlers[name] ?? []) fn(...args);
    };
    const ctx = {
        chat: [],
        groupId: null,
        extensionSettings: {},
        powerUserSettings: { reasoning: { prefix: '<think>', suffix: '</think>' }, auto_continue: { enabled: false }, auto_swipe: false },
        saveSettingsDebounced() {},
        saveChat: async () => {},
        substituteParams: text => text,
        generateRaw: async request => {
            state.raw.push(request);
            state.rawInFlight += 1;
            state.rawMaxInFlight = Math.max(state.rawMaxInFlight, state.rawInFlight);
            try {
                await new Promise(resolve => setTimeout(resolve, 5));
                return state.rawReply(request);
            } finally {
                state.rawInFlight -= 1;
            }
        },
        setExtensionPrompt: (key, value) => {
            state.prompts[key] = value;
        },
        macros: {
            registry: { hasMacro: name => state.macros.has(name), unregisterMacro: name => state.macros.delete(name) },
            register: (name, definition) => state.macros.set(name, definition),
        },
        deactivateSendButtons: () => {
            state.log.push('deactivate');
            body.dataset.generating = 'true';
        },
        activateSendButtons: () => {
            state.log.push('activate');
            delete body.dataset.generating;
        },
        stopGeneration: () => emit(EVENTS.GENERATION_STOPPED),
        eventSource: { on: (name, fn) => (handlers[name] ??= []).push(fn) },
        eventTypes: EVENTS,
        SlashCommandParser: { addCommandObject() {} },
        SlashCommand: { fromProps: props => props },
        SlashCommandNamedArgument: { fromProps: props => props },
        ARGUMENT_TYPE: { STRING: 'string' },
    };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = { body };
    globalThis.toastr = { info() {}, warning() {}, error() {}, success() {} };
    return { ctx, state, emit, body };
}
