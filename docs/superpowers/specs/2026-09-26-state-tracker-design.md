# State Tracker: Design Spec

- **Date:** 2026-09-26
- **Status:** Approved in conversation, awaiting written-spec review
- **Target:** SillyTavern 1.19 (the current release). The implementation plan confirms the minimum supported version.

## 1. Purpose

State Tracker is a SillyTavern UI extension that keeps track of the changing state of a roleplay, such as where the characters are, what they are wearing, and how they feel about each other. It does this with any number of user-defined **trackers**.

After each AI reply, every tracker sends a prompt that you wrote to a model of your choice. That prompt includes the tracker's previous answer and a chosen number of recent messages. The model returns an updated answer. The extension stores that answer with the message, shows it in a side panel, and delivers it to the AI for the next reply in the way you chose. The answer can be injected automatically, exposed as a macro you place yourself, or kept in the panel only.

The extension never changes the text of any chat message.

### Success criteria

- You can define several trackers, chat normally, and see each one run after each AI reply, with its answer shown in the side panel.
- Each tracker's answer reaches the AI exactly as its delivery setting says, and never reaches it any other way.
- Swiping, continuing, editing, and deleting messages keep each message's answers consistent with that message.
- A tracker run never modifies message text, and a failed tracker never loses the previous state.

## 2. Terms

- **Tracker:** one user-defined prompt, together with its settings.
- **Answer:** the text a tracker's model returns for one message. Answers are stored per message and per swipe.
- **Run:** one request that one tracker sends for one message.
- **Current answer:** the answer that is delivered to the AI for a tracker at a given moment. Section 6 defines how it is found.
- **In-order (sync) tracker:** a tracker that runs one at a time with the other in-order trackers, in list order.
- **Parallel (async) tracker:** a tracker that starts immediately and runs alongside the others.
- **The lock:** SillyTavern's supported "generation in progress" state. While it is on, the send, Continue, and impersonate buttons, the swipe arrows, and the last message's buttons are hidden, and the Stop button is shown.
- **The pause point:** SillyTavern's documented hook, called a generation interceptor, that runs just before each generation builds its prompt. SillyTavern waits for it to finish before continuing.
- **Macro:** a `{{name}}` placeholder that SillyTavern replaces with text wherever it builds a prompt.

## 3. Settings

### 3.1 Global settings

| Setting | Default | Meaning |
|---|---|---|
| Enabled | On | The master switch. While it is off, nothing runs, nothing is injected, and every tracker macro returns empty text. |
| Request timeout | 60 seconds | A run that takes longer than this counts as failed. The allowed range is 5 to 600 seconds. |
| Lock while in-order trackers run | On | When this is on, the in-order chain holds the lock from its start until its end. When it is off, the chain runs in the background. |
| Tracker list | Empty | This is the ordered list of trackers. Its order is the in-order run order. |

### 3.2 Tracker settings

| Setting | Default | Meaning |
|---|---|---|
| Name | "New tracker" | The name shown in the list, the panel, and slash commands. It must be unique, and matching ignores case. |
| On | On | When this is off, the tracker is **fully off**. It does not run, it delivers nothing, and its macro returns empty text. |
| Run mode | In order | This is either **In order (sync)** or **Parallel (async)**. |
| Lock while running | On | This applies to parallel trackers only. It controls whether this tracker holds the lock while it runs. |
| Run every N AI replies | 1 | See section 4.2. |
| Model | Same as chat | This is either "Same as chat" or one of your saved Connection Manager profiles. |
| Max answer length | 300 tokens | This caps the length of the answer. |
| Messages to include | 2 | This is the number of recent messages that `{{recent_messages}}` holds. The minimum is 1. |
| Counting | All | This is **AI only**, **Mine only**, or **All**. It decides which messages count toward the number above. |
| System prompt | Empty | This is optional. When it is filled in, it is sent as a system message. |
| Prompt | A template | The main instructions. See section 4.5. |
| Delivery | Inject | This is **Inject**, **Macro**, or **None (panel only)**. |
| Position (Inject only) | In chat | This is **In chat** (at the chosen depth), **Before main prompt**, or **After main prompt**. |
| Depth (Inject, in chat only) | 1 | This is the number of messages from the end of the chat at which the answer is inserted. A depth of 0 means the very end. |
| Role (Inject only) | System | This is System, User, or Assistant. |
| Wrapper (Inject only) | `{{state}}` | This is the text sent around the answer. `{{state}}` is replaced by the current answer. |
| Macro name (Macro only) | Empty | The name inside `{{...}}`. It must be set before a macro tracker can be saved. |

There is no starting value. Before a tracker's first answer in a chat, `{{previous_state}}` is empty and the tracker delivers nothing.

### 3.3 Validation in the editor

- **Macro name:** it may contain only letters, digits, and underscores, and it must start with a letter. The editor rejects a name that another tracker already uses, a name that SillyTavern or another extension has already registered as a macro, or one of this extension's own placeholder names (`state`, `previous_state`, `recent_messages`).
- **Name:** it must not be empty and must be unique, ignoring case.
- **Prompt:** it must not be empty. If it does not contain `{{recent_messages}}`, the editor shows a warning but still allows saving.
- **Profile:** if the chosen profile no longer exists, the dropdown shows it as "Missing profile," and runs fail with a clear error until you pick another one.

## 4. Running trackers

### 4.1 What starts a run

| Event | Behavior |
|---|---|
| A new AI reply, including each character's reply in a group chat | Every tracker that is on and due this reply runs (see section 4.2). |
| A new swipe | This works the same as a new reply. The answers are stored on the new swipe, and each swipe keeps its own answers. |
| Continue | Continue reruns every tracker that is on and already has an answer, a failed run, or a run in progress on that message. Runs in progress are cancelled first, because they are working from the old text. Trackers with nothing on that message are left alone. As a result, Continue never runs a tracker that was not due, and it never runs trackers automatically on a greeting that you haven't run by hand. |
| The "Run" button in the side panel | This runs one tracker that is on and has no answer on the message being viewed. |
| The "Run all missing" button in the side panel | This runs every tracker that is on and has no answer on the message being viewed. |
| The "Rerun" or "Retry" button in the side panel | This runs one tracker again on the message being viewed. |
| `/tracker-run` | This follows the same rule as the Run buttons, applied to the latest AI message (see section 7.6). |

These events never start a run: your own messages, impersonate, background generations started by other extensions, the greeting of a new chat, switching between greetings, and reopening a chat. The greeting is run by hand with the panel buttons or the slash command.

When you **edit an AI message's text**, nothing runs. Instead, that message's answers are marked **outdated**.

### 4.2 Run every N AI replies

A tracker is **due** for a message when that message is at least N AI replies after the nearest **earlier** message that holds an answer from this tracker. The count includes the message itself. If no earlier message holds an answer, the tracker is due.
- With N set to 1, the tracker runs on every reply.
- The rule counts messages, not swipes, so a new swipe of a reply is judged exactly like the reply itself.
- A manual run stores an answer, so the count restarts from that message.
- A failed run stores no answer, so the tracker stays due on the following reply.

*Example.* With N set to 3, the tracker runs on replies 3, 6, and 9. If you rerun it by hand on reply 4, its next automatic run is on reply 7.

### 4.3 Run order

When a set of trackers is triggered for a message, two things start at the same time:
- The **in-order chain.** The in-order trackers run one at a time, in list order. Each one starts after the previous one finishes, whether that one succeeded or failed.
- Every **parallel** tracker.

A later tracker in the chain whose prompt uses an earlier tracker's macro receives the fresh answer that was just stored. A parallel tracker sees whatever answer is current when it builds its prompt.

### 4.4 Locking and the pause point

- The lock is on while at least one **locking run** is running or waiting. A locking run is one of two things: any in-order run while "Lock while in-order trackers run" is on, or any parallel run whose "Lock while running" setting is on.
- The lock turns off once every locking run has finished, whether it succeeded, failed, timed out, or was cancelled. It is always released, including after errors.
- **Stop.** Pressing Stop while the lock is on cancels every locking run that is still running and releases the lock.
- **The pause point is a safety net.** A generation can still start while the lock is on, because the Enter key, some slash commands, and other extensions can bypass it. When that happens, the generation waits at the pause point until the locking runs finish. It then builds its prompt with the fresh answers. If Stop is pressed while a generation is waiting, the wait ends and SillyTavern's own stop behavior applies.
- The pause point holds only generations that write to the chat: normal replies, swipes, regenerates, Continue, and impersonate. Background generations started by other extensions are never held, but they still receive the current injections.
- Runs that do not lock never block or delay anything. A generation that starts while they are running uses their last finished answers.

*Example.* The chain lock is on. Location and Outfit are in order, Mood is parallel with its lock on, and Weather is parallel with its lock off. Reply #5 arrives and the lock turns on. Location runs, and then Outfit runs, while Mood and Weather start immediately. The lock turns off when Location, Outfit, and Mood have all finished. Weather keeps running in the background.

### 4.5 Building a tracker request

The **anchor** is the message being tracked.

1. **`{{recent_messages}}`.** Starting at the anchor and moving backward, the extension collects messages that match the Counting setting (AI only, Mine only, or All) until it has "Messages to include" of them. It skips messages that are hidden from the AI and SillyTavern's system notes. The messages are formatted oldest first, one per block, as `Name: message text`. Messages after the anchor are never included.
2. **`{{previous_state}}`.** This is this tracker's answer on the nearest message **before** the anchor, using the swipe that is showing on each message and skipping messages where the tracker has no answer. If there is none, it is empty.
3. **SillyTavern macros.** Macros such as `{{char}}`, `{{user}}`, `{{description}}`, and `{{scenario}}`, and other trackers' macros, are filled in within the system prompt and the prompt. Tracker macros resolve relative to the anchor, as described in section 6.
4. **Order of substitution.** SillyTavern macros are filled in on your template first. The two placeholders are filled in afterward, so text inside chat messages or answers is never treated as macros.
5. **The request.** The optional system prompt is sent as a system message, and the prompt is sent as a user message. With "Same as chat," the request goes through SillyTavern's raw generation on the current connection, and no chat history, character card, or World Info is added. With a profile, the request goes through Connection Manager to that profile. The max answer length applies in both cases.
6. **The answer.** Whitespace is trimmed from both ends. An empty answer counts as a failure.

*Example of what gets sent*, for an Outfit tracker with Messages to include set to 2 and Counting set to All:

```
SYSTEM: You track clothing in a roleplay. Reply with only the outfit list.
USER:   Previous outfits:
        Seraphina: green cloak, leather armor
        Alex: travel clothes

        Recent messages:
        Alex: I help you unbuckle the armor so you can rest.
        Seraphina: She sets the armor aside and sits by the fire in her linen tunic.

        Update what Seraphina and Alex are wearing. One line per person.
```

### 4.6 Failures, overlaps, and cancellation

- **Failure** covers an API error, a timeout, an empty answer, or a missing profile. The panel shows the error with a **Retry** button. Any answer the message already had is kept, and nothing new is stored. The next reply falls back to the most recent good answer.
- **No duplicate runs.** While a tracker is running on a message, its Run, Rerun, and Retry buttons show a spinner and cannot be clicked. `/tracker-run` skips that tracker and shows a notice.
- **Runs follow their message.** A run remembers the exact message and swipe it started on. When the answer arrives, it is stored on that message and swipe, even if you have swiped away or new messages have arrived since. If that message has been deleted, the answer is thrown away.
- **Switching chats** cancels every run, throws away its results, and releases the lock.
- **Cancelling a run** means its result is ignored. Where the request supports being aborted, which profile requests do, the request is also aborted. Raw generation on the chat's connection cannot always be aborted mid-request, so its result is simply ignored when it arrives.

## 5. Storage

- Answers are saved inside the chat file, as hidden data on each message, separately for each swipe. The text of the message is never touched.
- Answers are linked to each tracker's permanent internal ID, not to its name. Renaming a tracker or its macro keeps its history.
- Each stored entry holds the following:
  - **value:** the answer text. It is missing if the tracker has never succeeded on this message.
  - **outdated:** whether the message text was edited after this answer was produced.
  - **edited:** whether you changed the answer by hand.
  - **updatedAt:** the time the answer was last written.
  - **error:** the last failure message, if the most recent run failed. It is cleared by the next successful run.
- **Editing an answer** in the panel replaces its value and sets the edited marker. Correcting an older message's answer changes only that message. Later answers are not rerun.
- **Deleting a tracker** leaves its stored answers in chats, where they are hidden, never shown, and never delivered. Importing the same tracker again, with the same internal ID, reconnects them.

## 6. The current answer and delivery

### 6.1 Finding the current answer

For a given tracker and starting message, the extension walks backward through the chat, using the swipe that is showing on each message. It returns the first stored **value** it finds. Messages with no value are skipped, including those where the run failed. Outdated and hand-edited values count normally.

The starting message depends on the situation:

| Situation | Starting message |
|---|---|
| A normal generation or Continue | The newest message |
| Swiping or regenerating message #k | Message #k−1, because #k is being replaced |
| Building a tracker request (section 4.5) | The anchor. The tracker's own `{{previous_state}}` starts one message before the anchor. |
| `/tracker-get`, or any time no generation is running | The newest message |

A tracker that is off, or that has no value anywhere in the chat, delivers nothing.

### 6.2 Delivery modes

- **Inject.** Right before each generation, at the pause point, the extension sets one injection for each injecting tracker. The injection is the tracker's wrapper with `{{state}}` replaced by the current answer, placed at the tracker's position, depth, and role. If there is no current answer, that tracker's injection is cleared. Injections are recalculated before every generation, so swipes and regenerates always receive the right state.
- **Macro.** `{{macroname}}` returns the current answer, or empty text if there is none. It works anywhere SillyTavern fills in macros: presets, the Author's Note, character cards, World Info, STscript, and other trackers' prompts. Renaming the macro retires the old name immediately.
- **None (panel only).** Nothing is ever sent to the AI. The answer is visible only in the panel and through `/tracker-get`.

## 7. Interface

### 7.1 Settings panel

This is shown in SillyTavern's Extensions settings. It contains:
- The Enabled switch, the request timeout, and the "Lock while in-order trackers run" switch.
- The **Add tracker**, **Import**, and **Export** buttons.
- The tracker list. Each row shows the tracker's on/off switch, its name, its run mode, and its delivery mode. For a macro tracker, the delivery column shows the macro name. Each row has **up** and **down** arrow buttons to change the order, plus **Edit**, **Duplicate**, and **Delete** buttons. Deleting asks for confirmation.
- **Add tracker** creates a tracker with a unique default name, such as "New tracker" or "New tracker 2," and opens it in the editor.
- **Duplicate** creates a copy with a new internal ID, named "<name> (copy)." If the original is a macro tracker, the copy's macro name gets a number added, such as `outfit2`, to stay unique.

```
State Tracker                                   [x] Enabled
Request timeout: [60] seconds    [x] Lock while in-order trackers run
[ Add tracker ]  [ Import ]  [ Export ]

 ▲ ▼  [x] Location       In order  Inject             [Edit] [Duplicate] [Delete]
 ▲ ▼  [x] Outfit         In order  Macro {{outfit}}   [Edit] [Duplicate] [Delete]
 ▲ ▼  [x] Weather        Parallel  None (panel only)  [Edit] [Duplicate] [Delete]
```

### 7.2 Tracker editor

The editor opens in a popup. Changes take effect only when you click **Save**, and **Cancel** discards them. Fields that do not apply are hidden. For example, the injection fields are hidden unless Delivery is Inject, and "Lock while running" is hidden unless Run mode is Parallel. The popup also contains the **Test** button described in section 7.4.

```
Name: [Outfit]                               [x] On
Run mode: (•) In order  ( ) Parallel   [x] Lock while running (parallel only)
Run every [1] AI replies
Model: [Same as chat         ▼]              Max answer length: [300] tokens
Messages to include: [2]   Counting: [All ▼]   (AI only / Mine only / All)
System prompt (optional): [You track clothing. Reply with only the list.]
Prompt:                   [Previous outfits: {{previous_state}} ...    ]
Delivery: ( ) Inject   (•) Macro   ( ) None (panel only)
   Macro:   Macro name: {{ [outfit] }}
   Inject:  Position: [In chat ▼]  Depth: [1]  Role: [System ▼]
            Wrapper:  [[Current outfits: {{state}}]]
[ Test ]                                            [ Save ]  [ Cancel ]
```

The default prompt template for a new tracker is:

```
Previous state:
{{previous_state}}

Recent messages:
{{recent_messages}}

Update the state based on the recent messages. Reply with only the updated state.
```

### 7.3 Side panel

- **Opening and closing.** A **"State Tracker"** item in SillyTavern's extensions menu, the one behind the wand button, opens and closes the panel. Your browser remembers whether it was open.
- **Layout.** On a wide screen, the panel sits beside the chat. On a narrow screen, it becomes a drawer that slides over the chat.
- **Header.** The header shows which message is being viewed, either "Latest reply · Seraphina" or "Message #37 · Seraphina." When the viewed message is not the latest, a **"← Back to latest"** button appears.
- **Following new replies.** While you are viewing the latest reply, the panel moves to each new reply automatically. While you are viewing an older message, the panel stays where it is, and "Back to latest" signals that a new reply arrived.
- **Swipes.** The panel shows the answers for the swipe currently on screen.
- **Tracker rows.** There is one row for each tracker, in list order:
  - A tracker that is **off** shows as greyed out, with no buttons.
  - A tracker with **no answer** shows "no answer yet" and a **Run** button.
  - A tracker that is **running** shows a spinner, and its buttons are disabled.
  - A tracker that **has an answer** shows the full answer, which can span several lines. It has **Edit** and **Rerun** buttons, plus an "outdated" marker or an "edited" marker when those apply.
  - A tracker whose **last run failed** shows the error and a **Retry** button. If it also has an older answer, that answer is shown too.
- **Run all missing.** This button is shown whenever at least one tracker that is on has no answer on the viewed message.
- **Editing.** Clicking **Edit** turns the answer into a text box with **Save** and **Cancel** buttons.
- **Message icon.** Each AI message's row of buttons gets a tracker icon. Clicking it opens the panel on that message.

```
┌ State Tracker ────────────── ✕ ┐
│ Latest reply · Seraphina        │
│ [ Run all missing ]             │
│ Location  ✓                     │
│   The forest road, heading      │
│   north.       [Edit] [Rerun]   │
│ Outfit  ⚠ outdated · edited     │
│   Seraphina: linen tunic        │
│   Alex: travel clothes          │
│                [Edit] [Rerun]   │
│ Weather  ⟳ running…             │
│ Mood  no answer yet     [Run]   │
│ Party HP  off                   │
└─────────────────────────────────┘
```

### 7.4 Test button

The Test button runs the tracker exactly as it is currently typed in the editor, including unsaved changes, against the latest AI message in the open chat. It then shows:
- The exact system and user messages that were sent.
- The model or profile that was used.
- The answer.
- How long the request took.

It stores nothing, never holds the lock, and ignores the every-N rule. If no chat is open, the button is disabled and a note explains why.

### 7.5 Export and import

- **Export** downloads a file containing all trackers, including their internal IDs. Connection profiles are saved by ID and name only. API keys and other secrets are never included.
- **Import** reads such a file and lists its trackers with checkboxes, so you can choose which ones to add.
  - If a tracker with the same internal ID already exists, you choose whether to **replace** it or **keep both**. Keeping both gives the imported copy a new ID.
  - If an imported macro name clashes with an existing one, the imported tracker gets a number added, such as `location2`, and is flagged.
  - If a tracker's profile does not exist on this setup, the extension matches it by ID first and then by name. If neither matches, the tracker falls back to "Same as chat" and is flagged.
  - If the file is malformed, or comes from a newer format version, it is rejected with a clear message.

### 7.6 Slash commands

- **`/tracker-run`** runs every tracker that is on and has no answer on the latest AI message.
- **`/tracker-run name=<tracker name>`** runs just that tracker, under the same condition. Name matching ignores case.
  - Locking and duplicate prevention apply as usual.
  - An unknown name produces an error. A tracker that is off, already answered, or already running is skipped with a notice.
- **`/tracker-get name=<tracker name>`** returns that tracker's current answer, looking back from the newest message. It returns empty text if the tracker is off or has no answer. It works for every delivery mode.

## 8. Technical notes

These notes record the SillyTavern integration points that were verified against the 1.19 source and documentation, along with the traps the implementation must handle.

- **Entry points.** The extension uses `SillyTavern.getContext()` for everything it can, and one small adapter module is the only code that talks to SillyTavern. The manifest declares a `generate_interceptor`, which is the pause point.
- **Events.**
  - A new reply fires `MESSAGE_RECEIVED` with the message ID and a generation type. The type values the implementation must check are `'normal'`, `'swipe'`, the Continue values, and `'first_message'`. The greeting uses `'first_message'`, which must be ignored.
  - The other events used are `MESSAGE_EDITED` (which marks answers outdated), `MESSAGE_DELETED`, `MESSAGE_SWIPED`, `CHAT_CHANGED`, `GENERATION_STOPPED`, and `GENERATION_ENDED`.
  - The plan must confirm the exact Continue type values, and whether Continue also fires `MESSAGE_EDITED`. If it does, the outdated marker must not be set for a Continue.
- **Requests.**
  - "Same as chat" uses `generateRaw({ systemPrompt, prompt, responseLength })`.
  - Profiles use `ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true })`.
  - The profile dropdown is built from `getSupportedProfiles()`, with "Same as chat" as the default and missing profiles flagged.
  - Timeouts are enforced by the extension with its own timer.
- **The lock.**
  - `deactivateSendButtons()` turns the lock on and `activateSendButtons()` turns it off. SillyTavern's own `/genraw lock=on` uses the same pair.
  - **Trap 1:** SillyTavern calls `activateSendButtons()` itself at the end of every generation. That would release the tracker lock right after a reply arrives, while trackers triggered by that reply are still running. The extension must re-apply the lock after SillyTavern's end-of-generation cleanup, for example on `GENERATION_ENDED`, whenever locking runs are still active.
  - **Trap 2:** `activateSendButtons()` also clears SillyTavern's internal "sending" flag. The extension must not release the lock while a real generation is in progress, such as one waiting at the pause point. In that case, the generation's own end restores the buttons.
  - The Enter key checks a different internal flag, so it is not blocked by the lock. The pause point covers that gap.
- **Injection.** Injection uses `setExtensionPrompt(key, text, position, depth, scan=false, role)`, with a unique key for each tracker. The position values are in-chat 1, before main prompt 2, and after main prompt 0. The role values are system 0, user 1, and assistant 2. A tracker's injection is cleared when it has nothing to deliver, is turned off, is deleted, or changes to another delivery mode.
- **Macros.**
  - Macros are registered with `macros.register(name, { handler, description })` and removed with `macros.registry.unregisterMacro(name)`. Macro handlers must be synchronous, so they read stored answers directly.
  - The starting message from section 6.1 is supplied through a short-lived "anchor" that the pause point sets for generations and the run engine sets while building tracker requests. The anchor is cleared afterward.
  - The legacy `registerMacro` API is deprecated and is not used.
- **Per-swipe storage.**
  - Answers live under a single key inside the message's hidden data (`message.extra`). SillyTavern also keeps a copy of that data for each swipe (`swipe_info[i].extra`) and swaps it in and out when you swipe.
  - A write must update the swipe it belongs to. For the swipe on screen, that means both the live data and that swipe's saved copy. For a swipe that is not on screen, only its saved copy is updated.
  - After writing, the chat is saved. The plan must verify this behavior against SillyTavern's swipe code before it builds on it.
- **Hidden messages.** Messages hidden from the AI, and SillyTavern system notes, are skipped when collecting recent messages.
- **Settings** are stored in `extension_settings.stateTracker`. They carry a format version so that future changes can migrate older settings.

## 9. Testing approach

- **Automated tests.** Pure logic lives in modules with no SillyTavern dependency and is unit-tested with Node's built-in test runner, with no extra dependencies. The tested areas are:
  - Collecting and formatting recent messages, including the count, the Counting filter, and skipped messages.
  - Assembling prompts, including the order of substitution and the placeholders.
  - Finding the current answer, including each starting message, swipes, failed entries, and outdated entries.
  - The every-N rule.
  - Validating macro names and tracker names.
  - Import merge rules.
  - The run engine: the in-order chain, parallel runs, lock accounting, duplicate prevention, cancellation, runs following their message, and timeouts. These tests use fake request functions.
- **Manual testing.** The code that talks to SillyTavern stays thin and is checked by hand in a running SillyTavern, with this repository linked into its third-party extensions folder. The checklist covers:
  - New replies, swipes, Continue, edits, and deletions.
  - The greeting's manual run.
  - Group chats.
  - The lock, the Enter-key gap, and Stop.
  - Switching chats.
  - Profile and "Same as chat" requests.
  - Inject, Macro, and None delivery, including checking the injected text with SillyTavern's Inspect Prompts.
  - The panel on a wide screen and a narrow one.
  - Export and import.
  - Both slash commands.

## 10. Out of scope

These items were considered and deliberately left out:

- Scoping trackers to particular characters or chats. Trackers apply to every chat, and each has an on/off switch.
- A starting value.
- Running trackers automatically on the greeting.
- Rerunning later messages after you correct an older answer.
- Drag-and-drop reordering. Arrow buttons are used instead.
- A per-tracker lock inside the in-order chain. One chain-wide switch is used instead.
- A status bar under each message. The side panel with a per-message icon is used instead.
- A "show in panel" switch for each tracker.
- Combining all trackers into one request.
- Structured (JSON) answers.
- Streaming answers.
- Letting World Info scan injected answers.
