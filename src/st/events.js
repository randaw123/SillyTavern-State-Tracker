// SillyTavern event handlers and the pause point (spec sections 4.1, 4.4 and 8).
import { ctx, LOG_PREFIX } from './context.js';
import { refreshInjections } from './delivery.js';
import { clearGenerationAnchor, setGenerationAnchor } from '../core/anchor.js';
import { adoptBlock, displayedSwipeId, generationAnchor, markOutdated, purgeStale } from '../core/answers.js';
import {
    classifyTrigger, CONTINUE_TYPES, NEW_REPLY_TYPES, selectContinueTrackers, selectNewReplyTrackers,
} from '../core/schedule.js';

export function wireEvents(runtime) {
    const { eventSource, eventTypes } = ctx();
    const { engine, lock } = runtime;
    let stopped = false;          // Stop was pressed since the last generation started
    let stopDuringWait = false;   // Stop was pressed while a generation waited at the pause point

    const refresh = (reason = 'state') => {
        refreshInjections();
        runtime.notify(reason);
    };

    eventSource.on(eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
        if (dryRun || type === 'quiet') return;
        stopped = false;
        lock.generationStarted();
    });

    eventSource.on(eventTypes.GENERATION_STOPPED, () => {
        stopped = true;
        if (runtime.isWaiting()) stopDuringWait = true;
        engine.cancel(job => job.locking);
        lock.generationEnded();
        clearGenerationAnchor();
    });

    eventSource.on(eventTypes.GENERATION_ENDED, () => {
        lock.generationEnded();
        clearGenerationAnchor();
        refresh();
    });

    eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
        const chat = ctx().chat ?? [];
        const message = chat[messageId];
        if (!message) return;
        if (!message.is_user && NEW_REPLY_TYPES.includes(type)) purgeStale(message);
        if (!message.is_user && CONTINUE_TYPES.includes(type)) adoptBlock(message);

        const settings = runtime.settings();
        const kind = classifyTrigger({ type, message, stopped, minReplyChars: settings.minReplyChars, enabled: settings.enabled });
        const swipeId = displayedSwipeId(message);
        const isRunning = id => engine.isRunning(message, swipeId, id);
        if (kind === 'new') {
            runtime.start(message, selectNewReplyTrackers({ trackers: settings.trackers, chat, anchorIndex: messageId, swipeId, isRunning }));
        } else if (kind === 'continue') {
            const trackers = selectContinueTrackers({ trackers: settings.trackers, message, swipeId, isRunning });
            engine.cancel(job => job.message === message);
            runtime.start(message, trackers);
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
        clearGenerationAnchor();
        refresh('chat');
    });

    globalThis.stateTrackerInterceptor = async (_chat, _contextSize, abort, type) => {
        try {
            if (type !== 'quiet' && engine.locked) {
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
            if (type === 'quiet') {
                refreshInjections();
                return;
            }
            const anchor = generationAnchor(ctx().chat ?? [], type);
            setGenerationAnchor(anchor);
            refreshInjections(anchor);
        } catch (error) {
            console.error(`${LOG_PREFIX} The generation hook failed`, error);
        }
    };
}
