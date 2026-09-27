// Keeps SillyTavern's lock in step with the run engine while respecting SillyTavern's
// own generations (spec section 8, traps 1 and 2).

export class LockController {
    #apply;
    #release;
    #defer;
    #wanted = false;
    #generating = false;
    #heldRelease = false;

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
        this.#heldRelease = false;
        if (wanted) this.#apply();
        else if (this.#generating) this.#heldRelease = true;
        else this.#release();
    }

    /** Called when a generation reaches the pause point; from then on SillyTavern always ends it with GENERATION_ENDED or GENERATION_STOPPED. */
    generationStarted() {
        this.#generating = true;
    }

    /** Called when SillyTavern's generation ends or is stopped. A release held back during it happens now. */
    generationEnded() {
        this.#generating = false;
        if (!this.#wanted) {
            if (this.#heldRelease) {
                this.#heldRelease = false;
                this.#release();
            }
            return;
        }
        this.#defer(() => {
            if (this.#wanted) this.#apply();
        });
    }
}
