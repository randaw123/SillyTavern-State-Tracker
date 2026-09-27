// Runs trackers for messages (spec sections 4.3 to 4.6): the in-order chain, parallel
// runs, lock accounting, duplicate prevention, cancellation and timeouts. Pure: the
// caller supplies `execute` (send one request) and `commit` (store one result).

export class RunCancelledError extends Error {
    constructor() {
        super('Run cancelled');
        this.name = 'RunCancelledError';
    }
}

/** Settles with `promise`, but rejects with RunCancelledError as soon as `signal` aborts. */
export function raceAbort(promise, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new RunCancelledError());
            return;
        }
        const onAbort = () => reject(new RunCancelledError());
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
            value => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            error => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

export function errorText(error) {
    if (error === undefined || error === null) return 'Unknown error';
    const main = error?.message || String(error);
    const cause = error?.cause?.message;
    return cause && cause !== main ? `${main}: ${cause}` : main;
}

export function describeLockStatus(progress, waiting) {
    if (waiting) return 'Waiting for trackers…';
    if (!progress.locked) return null;
    if (progress.current) {
        return `Updating trackers ${Math.min(progress.done + 1, progress.total)}/${progress.total} · ${progress.current}`;
    }
    return `Updating trackers · ${progress.running} running`;
}

export class RunEngine {
    #deps;
    #jobs = new Set();
    #locked = false;
    #lockTotal = 0;
    #lockDone = 0;
    #unlockWaiters = [];

    constructor(deps) {
        this.#deps = deps;
    }

    get locked() {
        return this.#locked;
    }

    jobStatus(message, swipeId, trackerId) {
        for (const job of this.#jobs) {
            if (job.message === message && job.swipeId === swipeId && job.tracker.id === trackerId) return job.status;
        }
        return null;
    }

    isRunning(message, swipeId, trackerId) {
        return this.jobStatus(message, swipeId, trackerId) !== null;
    }

    start({ message, swipeId, trackers, lockChain, meta = {} }) {
        const fresh = trackers.filter(t => !this.isRunning(message, swipeId, t.id));
        const make = (tracker, locking) => {
            const job = {
                tracker, message, swipeId, locking, meta,
                status: 'queued', finished: false, timedOut: false, controller: new AbortController(),
            };
            this.#jobs.add(job);
            if (locking) this.#lockTotal += 1;
            return job;
        };
        const chain = fresh.filter(t => t.runMode !== 'async').map(t => make(t, Boolean(lockChain)));
        const parallel = fresh.filter(t => t.runMode === 'async').map(t => make(t, Boolean(t.lockWhileRunning)));
        this.#refreshLock();
        this.#changed();
        const chainDone = (async () => {
            for (const job of chain) await this.#run(job);
        })();
        return Promise.all([chainDone, ...parallel.map(job => this.#run(job))]).then(() => undefined);
    }

    cancel(predicate = () => true) {
        const doomed = [...this.#jobs].filter(predicate);
        for (const job of doomed) {
            this.#finish(job);
            job.controller.abort();
        }
        if (doomed.length) {
            this.#refreshLock();
            this.#changed();
        }
        return doomed.length;
    }

    waitForUnlock() {
        if (!this.#locked) return Promise.resolve();
        return new Promise(resolve => this.#unlockWaiters.push(resolve));
    }

    lockProgress() {
        const active = [...this.#jobs].filter(job => job.locking);
        const current = active.find(job => job.status === 'running' && job.tracker.runMode !== 'async');
        return {
            locked: this.#locked,
            total: this.#lockTotal,
            done: this.#lockDone,
            current: current ? current.tracker.name : null,
            running: active.filter(job => job.status === 'running').length,
        };
    }

    async #run(job) {
        if (job.finished) return;
        job.status = 'running';
        this.#changed();
        const timeoutMs = this.#deps.timeoutMs?.() ?? 60000;
        const timer = setTimeout(() => {
            job.timedOut = true;
            job.controller.abort();
        }, timeoutMs);
        let outcome = null;
        try {
            const request = Promise.resolve().then(() => this.#deps.execute(job, job.controller.signal));
            const value = await raceAbort(request, job.controller.signal);
            outcome = { value: String(value ?? '') };
        } catch (error) {
            if (job.timedOut) outcome = { error: `Timed out after ${timeoutMs / 1000} seconds` };
            else if (!(error instanceof RunCancelledError)) outcome = { error: errorText(error) };
        } finally {
            clearTimeout(timer);
        }
        if (this.#finish(job) && outcome) {
            try {
                this.#deps.commit(job, outcome);
            } catch (error) {
                console.error('[State Tracker] Failed to store a tracker result', error);
            }
        }
        this.#refreshLock();
        this.#changed();
    }

    #finish(job) {
        if (job.finished) return false;
        job.finished = true;
        this.#jobs.delete(job);
        if (job.locking) this.#lockDone += 1;
        return true;
    }

    #refreshLock() {
        const wanted = [...this.#jobs].some(job => job.locking);
        if (wanted === this.#locked) return;
        this.#locked = wanted;
        if (!wanted) {
            this.#lockTotal = 0;
            this.#lockDone = 0;
            for (const resolve of this.#unlockWaiters.splice(0)) resolve();
        }
        this.#deps.onLockChange?.(wanted);
    }

    #changed() {
        this.#deps.onChange?.();
    }
}
