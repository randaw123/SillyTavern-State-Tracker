// Shared runtime: owns the engine and the lock, and exposes the actions that events,
// slash commands and the interface use.
import { ctx, getSettings, LOG_PREFIX, MODULE_NAME } from './context.js';
import { loadInternals, setBusyFlag } from './internals.js';
import { buildJobPrompt, sendPrompt } from './requests.js';
import { log } from './log.js';
import { currentValue, isMacroTakenElsewhere, refreshInjections, syncMacros } from './delivery.js';
import { normalizeSettings } from '../core/settings.js';
import { raceAbort, RunCancelledError, RunEngine } from '../core/engine.js';
import { LockController } from '../core/lock.js';
import { displayedSwipeId, latestAiIndex, storeAnswer, storeEdit, storeError, swipeStamp } from '../core/answers.js';
import { selectMissingTrackers } from '../core/schedule.js';
import { toChatMessages } from '../core/prompt.js';

export async function createRuntime() {
    await loadInternals();
    const context = ctx();
    context.extensionSettings[MODULE_NAME] = normalizeSettings(context.extensionSettings[MODULE_NAME]);

    const listeners = new Set();
    let waiting = false;

    const notify = (reason = 'state') => {
        for (const listener of listeners) {
            try {
                listener(reason);
            } catch (error) {
                console.error(`${LOG_PREFIX} Interface update failed`, error);
            }
        }
    };
    const saveChat = () => ctx().saveChat();

    const lock = new LockController({
        apply: () => {
            ctx().deactivateSendButtons();
            setBusyFlag(true);
        },
        release: () => ctx().activateSendButtons(),
    });

    const messageLabel = message => {
        const index = (ctx().chat ?? []).indexOf(message);
        return index === -1 ? 'a message no longer in the chat' : `message #${index}`;
    };
    // The details worth saving from a run. A run that timed out never finished timing itself,
    // so its time is measured here; a run that never left the queue has no time at all.
    const runDetails = run => {
        if (!run?.profile) return null;
        const ms = run.ms ?? (run.startedAt === undefined ? undefined : Math.round(performance.now() - run.startedAt));
        return {
            profile: run.profile,
            model: run.model ?? '',
            ...(ms === undefined ? {} : { ms }),
            ...(run.thinkingChars ? { thinkingChars: run.thinkingChars } : {}),
        };
    };

    const engine = new RunEngine({
        execute: async (job, signal) => {
            // Filled by sendPrompt and read back in commit, so the engine only handles the answer text.
            job.run = {};
            log.info(`Running "${job.tracker.name}" on ${messageLabel(job.message)}.`);
            const { answer } = await sendPrompt(job.tracker, buildJobPrompt(job.tracker, job.message, job.swipeId), signal, job.run);
            return answer;
        },
        commit: (job, outcome) => {
            const details = runDetails(job.run);
            if (outcome.value !== undefined) {
                log.info(`Finished "${job.tracker.name}" on ${messageLabel(job.message)}.`, { ...details, answerChars: outcome.value.length });
            } else {
                log.error(`"${job.tracker.name}" failed on ${messageLabel(job.message)}: ${outcome.error}`, details ?? {});
            }
            if (!(ctx().chat ?? []).includes(job.message)) return;
            if (swipeStamp(job.message, job.swipeId) !== job.meta.stamp) return;
            if (outcome.value !== undefined) storeAnswer(job.message, job.swipeId, job.tracker.id, outcome.value, Date.now(), details);
            else storeError(job.message, job.swipeId, job.tracker.id, outcome.error, Date.now(), details);
            saveChat();
            refreshInjections();
        },
        onChange: () => notify('state'),
        onLockChange: locked => lock.setWanted(locked),
        timeoutMs: () => getSettings().timeoutSeconds * 1000,
    });

    const start = (message, trackers) => {
        if (!getSettings().enabled || !trackers.length) return Promise.resolve();
        const swipeId = displayedSwipeId(message);
        return engine.start({
            message, swipeId, trackers, lockChain: getSettings().lockChain, meta: { stamp: swipeStamp(message, swipeId) },
        });
    };

    const profiles = () => {
        try {
            return (ctx().ConnectionManagerRequestService?.getSupportedProfiles() ?? []).map(p => ({ id: p.id, name: p.name || p.id }));
        } catch {
            return [];
        }
    };
    const profileName = id => profiles().find(p => p.id === id)?.name ?? '';

    const runtime = {
        engine,
        lock,
        settings: getSettings,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        notify,
        saveSettings() {
            ctx().saveSettingsDebounced();
            syncMacros();
            refreshInjections();
            notify('settings');
        },
        saveChat,
        start,
        isRunning: (message, trackerId) => engine.isRunning(message, displayedSwipeId(message), trackerId),
        jobStatus: (message, trackerId) => engine.jobStatus(message, displayedSwipeId(message), trackerId),
        runMissing(message, trackerId = null) {
            const swipeId = displayedSwipeId(message);
            let trackers = selectMissingTrackers({
                trackers: getSettings().trackers, message, swipeId, isRunning: id => engine.isRunning(message, swipeId, id),
            });
            if (trackerId) trackers = trackers.filter(t => t.id === trackerId);
            return start(message, trackers);
        },
        rerun(message, trackerId) {
            const tracker = getSettings().trackers.find(t => t.id === trackerId);
            if (!tracker?.enabled || runtime.isRunning(message, trackerId)) return Promise.resolve();
            return start(message, [tracker]);
        },
        editAnswer(message, trackerId, value) {
            storeEdit(message, displayedSwipeId(message), trackerId, value);
            saveChat();
            refreshInjections();
            notify('state');
        },
        currentValue: tracker => currentValue(tracker),
        isMacroTakenElsewhere,
        profiles,
        profileName,
        resolveProfile: (id, name) => (profiles().find(p => p.id === id) ?? profiles().find(p => p.name === name))?.id ?? '',
        isWaiting: () => waiting,
        setWaiting(value) {
            waiting = value;
            notify('state');
        },
        async testTracker(tracker) {
            const chat = ctx().chat ?? [];
            const index = latestAiIndex(chat);
            if (index === -1) throw new Error('Open a chat with at least one AI message to test a tracker.');
            const message = chat[index];
            const prompt = buildJobPrompt(tracker, message, displayedSwipeId(message));
            const seconds = getSettings().timeoutSeconds;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), seconds * 1000);
            try {
                const { answer, details } = await raceAbort(sendPrompt(tracker, prompt, controller.signal), controller.signal);
                return { messages: toChatMessages(prompt), answer, run: runDetails(details) };
            } catch (error) {
                if (error instanceof RunCancelledError) throw new Error(`Timed out after ${seconds} seconds.`);
                throw error;
            } finally {
                clearTimeout(timer);
            }
        },
    };

    syncMacros();
    refreshInjections();
    return runtime;
}
