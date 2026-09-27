// SillyTavern event handlers and the pause point (spec sections 4.1, 4.4 and 8).
import { ctx, LOG_PREFIX } from './context.js';
import { refreshInjections } from './delivery.js';
import { isBusy } from './internals.js';
import { clearGenerationAnchor, setGenerationAnchor } from '../core/anchor.js';
import { adoptBlock, displayedSwipeId, generationAnchor, markOutdated, purgeStale, swipeStamp } from '../core/answers.js';
import {
    classifyTrigger, CONTINUE_TYPES, NEW_REPLY_TYPES, selectContinueTrackers, selectNewReplyTrackers,
} from '../core/schedule.js';

export function wireEvents(runtime) {
    const { eventSource, eventTypes } = ctx();
    const { engine, lock } = runtime;
    let stopped = false;          // Stop was pressed since the last generation started
    let stopDuringWait = false;   // Stop was pressed while a generation waited at the pause point
    let continued = null;         // { message, stamp } while a Continue re-times its message
    const pending = new Map();    // message -> 'new' | 'continue', waiting for SillyTavern to go idle
    let flushTimer = null;

    const refresh = (reason = 'state') => {
        refreshInjections();
        runtime.notify(reason);
    };

    // SillyTavern re-times the continued message as a Continue starts (before the pause point),
    // which changes its stamp. Carry the message's own block over to each new stamp.
    const adoptContinued = () => {
        if (continued) continued.stamp = adoptBlock(continued.message, continued.stamp);
    };

    const runTrigger = (message, kind) => {
        const chat = ctx().chat ?? [];
        const anchorIndex = chat.indexOf(message);
        if (anchorIndex === -1) return;
        const settings = runtime.settings();
        const swipeId = displayedSwipeId(message);
        const isRunning = id => engine.isRunning(message, swipeId, id);
        if (kind === 'new') {
            runtime.start(message, selectNewReplyTrackers({ trackers: settings.trackers, chat, anchorIndex, swipeId, isRunning }));
        } else {
            const trackers = selectContinueTrackers({ trackers: settings.trackers, message, swipeId, isRunning });
            engine.cancel(job => job.message === message);
            runtime.start(message, trackers);
        }
    };

    // Auto-continue and auto-swipe act right after a reply and refuse while SillyTavern is busy,
    // so with either on, automatic runs wait until SillyTavern is idle. A follow-up Continue on
    // the same reply merges into the reply's run. (Auto-continue never runs in group chats.)
    const shouldDefer = () => {
        const { groupId, powerUserSettings } = ctx();
        return !groupId && Boolean(powerUserSettings?.auto_continue?.enabled || powerUserSettings?.auto_swipe);
    };
    const flush = () => {
        if (isBusy()) {
            flushTimer = setTimeout(flush, 100);
            return;
        }
        flushTimer = null;
        const items = [...pending];
        pending.clear();
        for (const [message, kind] of items) runTrigger(message, kind);
        refresh();
    };
    const queueTrigger = (message, kind) => {
        if (pending.get(message) !== 'new') pending.set(message, kind);
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 0);
    };

    eventSource.on(eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
        if (dryRun || type === 'quiet') return;
        stopped = false;
        continued = null;
        if (type === 'continue') {
            const chat = ctx().chat ?? [];
            const last = chat[chat.length - 1];
            if (last && !last.is_user) continued = { message: last, stamp: swipeStamp(last, displayedSwipeId(last)) };
        }
    });

    eventSource.on(eventTypes.GENERATION_STOPPED, () => {
        stopped = true;
        if (runtime.isWaiting()) stopDuringWait = true;
        adoptContinued();
        engine.cancel(job => job.locking);
        lock.generationEnded();
        clearGenerationAnchor();
    });

    eventSource.on(eventTypes.GENERATION_ENDED, () => {
        adoptContinued();
        lock.generationEnded();
        clearGenerationAnchor();
        refresh();
    });

    eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
        const chat = ctx().chat ?? [];
        const message = chat[messageId];
        if (!message) return;
        if (!message.is_user && NEW_REPLY_TYPES.includes(type)) purgeStale(message);
        if (CONTINUE_TYPES.includes(type)) adoptContinued();

        const settings = runtime.settings();
        const kind = classifyTrigger({ type, message, stopped, minReplyChars: settings.minReplyChars, enabled: settings.enabled });
        if (kind) {
            if (shouldDefer()) queueTrigger(message, kind);
            else runTrigger(message, kind);
        } else if (!message.is_user && CONTINUE_TYPES.includes(type) && markOutdated(message)) {
            runtime.saveChat();
        }
        refresh();
    });

    eventSource.on(eventTypes.MESSAGE_EDITED, messageId => {
        const message = ctx().chat?.[messageId];
        if (!message || message.is_user) return;
        if (markOutdated(message)) runtime.saveChat();
        refresh();
    });

    eventSource.on(eventTypes.MESSAGE_DELETED, () => {
        const chat = ctx().chat ?? [];
        engine.cancel(job => !chat.includes(job.message));
        refresh();
    });

    for (const name of ['MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED', 'MESSAGE_UPDATED']) {
        if (eventTypes[name]) eventSource.on(eventTypes[name], () => refresh());
    }

    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        engine.cancel();
        stopped = false;
        continued = null;
        pending.clear();
        clearTimeout(flushTimer);
        flushTimer = null;
        lock.generationEnded();
        clearGenerationAnchor();
        refresh('chat');
    });

    globalThis.stateTrackerInterceptor = async (_chat, _contextSize, abort, type) => {
        try {
            if (type === 'quiet') {
                refreshInjections();
                return;
            }
            // SillyTavern shows its Stop button before the pause point, so from here on this
            // generation always ends with GENERATION_ENDED or GENERATION_STOPPED.
            lock.generationStarted();
            if (type === 'continue') adoptContinued();
            if (engine.locked) {
                stopDuringWait = false;
                runtime.setWaiting(true);
                try {
                    await engine.waitForUnlock();
                } finally {
                    runtime.setWaiting(false);
                }
                if (stopDuringWait) {
                    abort(true);
                    return;
                }
            }
            const anchor = generationAnchor(ctx().chat ?? [], type);
            setGenerationAnchor(anchor);
            refreshInjections(anchor);
        } catch (error) {
            console.error(`${LOG_PREFIX} The generation hook failed`, error);
        }
    };
}
