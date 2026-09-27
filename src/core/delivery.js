// Builds what an injecting tracker sends (spec section 6.2). The numeric values are
// SillyTavern's extension_prompt_types and extension_prompt_roles.

export const POSITION_VALUES = Object.freeze({ after_prompt: 0, in_chat: 1, before_prompt: 2 });
export const ROLE_VALUES = Object.freeze({ system: 0, user: 1, assistant: 2 });

export function injectionKey(trackerId) {
    return `state_tracker_${trackerId}`;
}

export function buildInjection(tracker, value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const wrapper = tracker.wrapper && tracker.wrapper.trim() ? tracker.wrapper : '{{state}}';
    return {
        text: wrapper.split('{{state}}').join(value),
        position: POSITION_VALUES[tracker.position] ?? POSITION_VALUES.in_chat,
        depth: tracker.depth,
        role: ROLE_VALUES[tracker.role] ?? ROLE_VALUES.system,
    };
}
