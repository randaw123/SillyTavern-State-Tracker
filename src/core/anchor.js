// Which message tracker macros look back from (spec section 6.1). An explicit anchor
// (set while a tracker request is built) wins over the generation anchor (set by the
// pause point), which wins over the newest message.

const stack = [];
let generationIndex = null;

export function withAnchor(index, fn) {
    stack.push(index);
    try {
        return fn();
    } finally {
        stack.pop();
    }
}

export function setGenerationAnchor(index) {
    generationIndex = index;
}

export function clearGenerationAnchor() {
    generationIndex = null;
}

export function currentAnchor(chatLength) {
    if (stack.length) return stack[stack.length - 1];
    if (generationIndex !== null) return generationIndex;
    return chatLength - 1;
}
