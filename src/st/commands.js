// Slash commands (spec section 7.7).
import { ctx } from './context.js';
import { findTrackerByName } from '../core/settings.js';
import { getEntry, hasValue, latestAiIndex } from '../core/answers.js';

export function registerCommands(runtime) {
    const { SlashCommandParser, SlashCommand, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx();
    const nameArgument = isRequired => SlashCommandNamedArgument.fromProps({
        name: 'name',
        description: 'The tracker name (case does not matter).',
        typeList: [ARGUMENT_TYPE.STRING],
        isRequired,
    });
    const requireTracker = name => {
        const tracker = findTrackerByName(runtime.settings().trackers, name);
        if (!tracker) throw new Error(`State Tracker: no tracker named "${name}".`);
        return tracker;
    };

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tracker-run',
        helpString: 'Runs every State Tracker tracker that is on and has no answer on the latest AI message. With name=, runs only that tracker.',
        namedArgumentList: [nameArgument(false)],
        callback: async args => {
            const chat = ctx().chat ?? [];
            const index = latestAiIndex(chat);
            if (index === -1) {
                toastr.info('There is no AI message to run trackers on.', 'State Tracker');
                return '';
            }
            const message = chat[index];
            if (!args.name) {
                await runtime.runMissing(message);
                return '';
            }
            const tracker = requireTracker(args.name);
            const reason = !tracker.enabled ? 'is off'
                : runtime.isRunning(message, tracker.id) ? 'is already running'
                    : hasValue(getEntry(message, tracker.id)) ? 'already has an answer'
                        : null;
            if (reason) {
                toastr.info(`${tracker.name} ${reason}.`, 'State Tracker');
                return '';
            }
            await runtime.runMissing(message, tracker.id);
            return '';
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tracker-get',
        helpString: 'Returns the current answer of a State Tracker tracker, or nothing if it is off or has no answer.',
        namedArgumentList: [nameArgument(true)],
        returns: 'the tracker\'s current answer',
        callback: async args => runtime.currentValue(requireTracker(args.name)),
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tracker-toggle',
        helpString: 'Switches a State Tracker tracker on or off. Without state=, it flips the switch. Returns the new state.',
        namedArgumentList: [
            nameArgument(true),
            SlashCommandNamedArgument.fromProps({
                name: 'state', description: 'on or off', typeList: [ARGUMENT_TYPE.STRING], enumList: ['on', 'off'],
            }),
        ],
        returns: 'on or off',
        callback: async args => {
            const tracker = requireTracker(args.name);
            const state = String(args.state ?? '').trim().toLowerCase();
            if (state && state !== 'on' && state !== 'off') throw new Error('State Tracker: state must be "on" or "off".');
            tracker.enabled = state ? state === 'on' : !tracker.enabled;
            runtime.saveSettings();
            return tracker.enabled ? 'on' : 'off';
        },
    }));
}
