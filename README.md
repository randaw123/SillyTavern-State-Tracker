# SillyTavern State Tracker

State Tracker keeps track of the changing state of a roleplay, such as where the characters are, what they are wearing, and how they feel, using trackers you define yourself.

After each AI reply, every tracker sends a prompt you wrote to a model you choose. The prompt includes the tracker's previous answer and the recent messages. The answer is stored with that message and swipe, shown in a side panel, and delivered to the next reply in the way you choose. Message text is never changed.

## Install

1. In SillyTavern (1.19 or newer), open **Extensions → Install extension** and paste this repository's URL.
2. For development, link the repository into SillyTavern instead:
   `ln -s /path/to/SillyTavern-State-Tracker /path/to/SillyTavern/public/scripts/extensions/third-party/SillyTavern-State-Tracker`
3. Reload SillyTavern.

## Use

- **Extensions → State Tracker** lists your trackers. Click **Add tracker** to create one.
- Each tracker has a prompt with two placeholders:
  - `{{previous_state}}` is the tracker's last answer.
  - `{{recent_messages}}` is the last N messages.

  SillyTavern macros such as `{{char}}` also work.
- **Delivery** decides how the AI sees the answer:
  - **Inject** adds it to every prompt automatically.
  - **Macro** makes `{{yourname}}` available to place anywhere.
  - **None** shows it in the panel only.
- **In order** trackers run one at a time and, by default, SillyTavern waits for them before the next reply. **Parallel** trackers run alongside them.
- Open the side panel from the **wand menu → State Tracker**, or with the tracker icon on any AI message.
- While trackers run, a line above the chat box shows progress and a timer, such as **Updating trackers 1/1 · Continuity · 12 s**.
- In the side panel, click a tracker's name to collapse or expand it. An answer written as `category:` headings with `- Name | field | field` lines shows one field per line, and each category collapses when you click its heading. Under each answer, a faded line shows the model that produced it and how long it took; hover over it for the connection profile and how much the model thought. A failed run shows the same line under its error.
- **Console logging** in the extension settings chooses what State Tracker writes to the browser console (F12): **Off**, **Errors** (failed runs, the default), **Runs** (every run with its connection, model and time), or **Everything** (also the prompts sent and the raw responses, including any thinking).

## Slash commands

- `/tracker-run [name=...]` runs trackers that are on and have no answer on the latest AI message.
- `/tracker-get name=...` returns a tracker's current answer.
- `/tracker-toggle name=... [state=on|off]` switches a tracker on or off.

## Development

- `npm test` runs the unit tests for `src/core`.
- `npm run check` checks the syntax of every source file.

The design is in `docs/superpowers/specs/2026-09-26-state-tracker-design.md`.
