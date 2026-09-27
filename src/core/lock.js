// Keeps SillyTavern's lock in step with the run engine while respecting SillyTavern's
// own generations (spec section 8, traps 1 and 2).

export class LockController {
    #apply;
    #release;
    #defer;
    #wanted = false;
    #generating = false;

    constructor({ apply, release, defer = fn => setTimeout(fn, 0) }) {
        this.#apply = apply;
        this.#release = release;
        this.#defer = defer;
    }

    get wanted() {
        return this.#wanted;
    }

    setWanted(wanted) {
        if (wanted === this.#wanted) return;
        this.#wanted = wanted;
        if (wanted) this.#apply();
        else if (!this.#generating) this.#release();
    }

    generationStarted() {
        this.#generating = true;
    }

    generationEnded() {
        this.#generating = false;
        if (!this.#wanted) return;
        this.#defer(() => {
            if (this.#wanted) this.#apply();
        });
    }
}
