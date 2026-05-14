# Review Session Decisions

## Context

The review page has to support two study modes without making the page feel like two separate products. The user also needs predictable behavior when testing the mode switch, pausing a problem, leaving the view, or exiting a session.

## Decisions

1. The review page is idle by default.
   - A due problem is not treated as an active review until the user presses the start button.
   - This avoids hidden timing and prevents a restored webview from looking like a half-started session.

2. Current review state lives in the extension host.
   - The webview may be destroyed and recreated by VS Code.
   - The extension owns the current problem, selected mode, elapsed active time, and paused state, then re-sends state when the webview reports ready.
   - The view provider also uses `retainContextWhenHidden` to reduce unnecessary rebuilds.

3. Pause excludes time from the review duration.
   - Pausing stores elapsed active time and clears the running timestamp.
   - Resuming starts a new running timestamp.
   - Rating while paused is allowed and records only elapsed active time.

4. Exit is not a review event.
   - Exiting clears the current problem and returns to the idle start screen.
   - It does not write a review log, change FSRS state, or close editor tabs.
   - Existing tabs are left alone because the user may still want to read or edit them; strict tab cleanup will run when the next problem is opened.

5. Quick review is a single toggle, not a two-button mode picker.
   - Off means normal review.
   - On means quick review.
   - The text next to the toggle states the current mode so the user can see what will happen before pressing feedback.

6. One feedback button set maps to mode-specific FSRS ratings.
   - The UI always shows `失败`, `困难`, `轻松`.
   - `失败` maps to `Again` in both modes.
   - `困难` maps to `Hard` in both modes.
   - `轻松` maps to `Easy` in normal mode and `Good` in quick mode.

7. Switching modes never opens external links.
   - The switch only changes the selected mode and feedback mapping.
   - The first start opens the external link only when the mode is still the default normal mode.
   - If the user toggled modes before starting, the first start suppresses automatic external opening.
   - Auto-advanced normal reviews may open the external link according to the user setting; quick reviews do not.

8. Development data does not keep compatibility layers.
   - The extension stores review data in `problemset.db.json` using the current v1 shape.
   - During the current pre-alpha phase, breaking shape changes are handled by deleting the local DB and letting the extension rebuild it from scanned Markdown files.
   - No compatibility layer is kept for old webview or review-state shapes.

9. New problem FSRS state follows `first_ac_date`.
   - If YAML has a non-null `first_ac_date`, the problem is initialized by applying `Easy` on that date.
   - This makes the card `Review` state and lets FSRS choose the next due time from the accepted date.
   - If `first_ac_date` is null or missing, the problem stays as a new FSRS card due now so the user learns it today.

10. Undo remains a recovery path, not a new external navigation event.
   - Undo can restore the previous problem as the active review.
   - If configured to reopen editors, it reopens local problem files but suppresses automatic external URL opening.
