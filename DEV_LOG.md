# Developer Log & Technical Learnings

This log documents the technical challenges, solutions, and architectural decisions made during the development of the Tinted Blocks plugin for Obsidian.

## 1. Reading View Architecture

### The Problem: Fragmented DOM & Incremental Rendering
Obsidian's Reading View does not render a document as a single static HTML structure. Instead:
- It renders blocks (paragraphs, lists, etc.) incrementally.
- It may update individual blocks without re-rendering the entire section.
- Content is flattened: A block starting with `::>blue` and ending with `<::` is rendered as multiple sibling elements (e.g., `div.el-p`), not nested inside a container.

### Failed Attempt: Wrapper Div
Initially, we tried to physically move these sibling elements into a new `div.tinted-block-container`.
- **Why it failed**: Obsidian's virtual DOM / diffing algorithm gets confused when elements are moved. When switching between Editing and Reading modes, or when updating content, Obsidian would "lose" the elements or reset them, causing styles to flicker or disappear.

### Successful Solution: Class-Based Styling & MutationObserver
Instead of changing the DOM structure, we applied classes to the existing elements to simulate a block.
- **`tinted-block-item`**: Applied to all elements in the block. Sets background color and removes margins.
- **`tinted-block-item-start/end`**: Applied to the first and last elements to handle rounded corners and padding.
- **`MutationObserver`**: We use a `MutationObserver` on the parent container. This detects when Obsidian finishes inserting all sibling elements (debounced by 100ms) before we attempt to scan and style them. This ensures we don't miss elements during the initial incremental render.

## 2. Robust Block Detection

### The Problem: Lost State on Update
When a user edits text inside a block, Obsidian re-renders that specific paragraph.
- If we stripped the marker text (`::>blue`) during the first render, the re-rendered version (or neighbor scans) would no longer see the marker text.
- This caused blocks to "break" or lose styling after edits.

### Solution: Data Attributes as State
- We use `dataset.tintedStart`, `dataset.tintedEnd`, etc., to persist the block state on the DOM element itself.
- **Crucially**, we **DO NOT remove** these attributes after processing. They serve as the "memory" that this element is a start/end marker, even if the visible text has been removed.
- **Double-Scan Strategy**: The scanner checks for these attributes first. If not found (e.g., a newly rendered element), it falls back to scanning `textContent` with Regex.

## 3. Visual Polish

### Removing "Phantom" Empty Lines
- **Issue**: A line containing only `::>blue` often renders as `<p>::>blue<br></p>`. After removing the text, `<p><br></p>` remains, creating an ugly empty line at the top of the block.
- **Fix**:
    1.  **Recursive Cleanup**: A helper function `removeLeadingBR` recursively dives into the element to find and remove the specific `<br>` tag that follows the marker.
    2.  **Empty Element Hiding**: If an element is effectively empty (only whitespace/br) after cleanup, we hide it (`display: none`) and promote the next sibling to be the "Start Item" (applying the top rounded corners to it).

### Continuous Background
- **Issue**: Margins between paragraphs (`<p>`) caused white gaps in the background color.
- **Fix**:
    - Force `margin: 0 !important` on all child elements inside a tinted block.
    - Add `padding-top/bottom: 0.25em` to the container items to simulate the paragraph spacing while maintaining the background color.

## 4. Regex & Parsing
- **Strict Syntax**: Markers must be at the start of the line (`^\\s*::>`).
- **HTML Entities**: We use `textContent` to avoid issues with `&gt;` vs `>`.
- **Newline Handling**: Regex must handle cases where `textContent` includes trailing newlines or content on the same line (though we enforce strict line usage for clarity).

## 5. Summary of Best Practices
1.  **Respect the Host's DOM**: In Obsidian (and likely other VDOM-based apps), avoid moving elements around. Decorate them instead.
2.  **State Persistence**: Store state in the DOM (`dataset`) if the model is opaque or inaccessible.
3.  **Asynchronous Rendering**: Always assume elements appear asynchronously. Use `MutationObserver` over `setTimeout`.
4.  **CSS robustness**: Use `!important` sparingly but necessarily when overriding host app defaults that you cannot control via specificity alone.

## 6. Regression: Lost Content on Re-render
- **Issue**: A severe regression where the last word of a block's text was deleted in Reading View.
- **Cause**: The `removeTextFromEnd` function blindly removed `N` characters based on the marker length. Because we persisted `data-tinted-end` attributes (to fix the flickering issue), `performWrap` was called multiple times. The first pass correctly removed the marker `<::`. Subsequent passes (triggered by `MutationObserver`) saw the attribute, assumed the marker was still there, and removed the next `N` characters (valid content).
- **Fix**: Added a strict safety check in `removeTextFromStart` and `removeTextFromEnd`.
    - `removeTextFromEnd`: Only remove text if `element.textContent` actually ends with the marker string.
    - `removeTextFromStart`: Only remove text if `element.textContent` actually starts with the marker string.
- **Lesson**: When persisting state that triggers destructive operations (like text removal), **always verify the target content exists** before performing the operation. Idempotency is key.

## 7. Performance Critical: Infinite Loop in MutationObserver
- **Issue**: The application (Obsidian) would freeze/lock up completely when loading the plugin, especially in Reading View. This occurred even in small vaults.
- **Cause**: We created an infinite feedback loop.
    1. The plugin uses `MutationObserver` to detect DOM changes and apply styles (add classes, modify text).
    2. When `wrapMarkedBlocks` executes, it modifies the DOM.
    3. These modifications **immediately** trigger the `MutationObserver` again.
    4. The observer callback fires -> `wrapMarkedBlocks` runs again -> modifies DOM -> observer fires...
    5. This flooded the JS event loop, causing the UI to freeze.
- **Fix**: 
    - **Disconnect before Modify**: In `wrapMarkedBlocks`, we explicitly call `observer.disconnect()` **before** making any DOM changes.
    - **Reconnect after**: We use a `finally` block to ensure `observer.observe()` is called again after all changes are complete.
    - **Robust Defaults**: Added strict checks in `loadSettings` to prevent `undefined` or invalid marker settings (which could cause Regex to match empty strings, leading to other infinite loops).
- **Lesson**: When a plugin observes the DOM and also modifies it, it **MUST** stop observing during its own modifications to avoid infinite recursion.

## 8. Live Preview Table Cell Tinting & Marker Hiding
- **Goal**: Implement "Tinted Cells" in Editing/Live Preview mode, where markers (like `:r:`) are hidden when not editing, but visible when editing, without occupying layout space when hidden.
- **Challenge 1: CodeMirror Decorations vs Table Widgets**: Obsidian renders tables in Live Preview as opaque widgets. CodeMirror's `Decoration.replace({})` (which is perfect for hiding text) often fails to penetrate or reconcile correctly within these complex widgets, leading to markers remaining visible or layout breaking.
- **Challenge 2: CSS Custom Highlight API**: We attempted to use the modern `CSS.highlights` API. While it can make text transparent (`color: transparent`), it **cannot** collapse the space (`font-size: 0` is not reliably supported for layout suppression in the Highlight API spec). This resulted in "invisible but space-occupying" markers.
- **Successful Solution: DOM Manipulation with MutationObserver**:
    - We used a `MutationObserver` to scan the `contentDOM` of the editor.
    - When a marker like `:r:` is found in a table cell, we physically **wrap it in a `<span>`** (e.g., `<span class="tinted-cell-marker-wrapper">`).
    - **Hiding**: By default, this span is styled with `display: inline-block; width: 0; overflow: hidden;`. This effectively removes it from the visual layout.
    - **Showing**: When the cursor enters the cell (detected via `window.getSelection()`), we add an active class that resets styles to `display: inline; width: auto; opacity: 0.67`, making it visible for editing.
    - **Risk**: Modifying the DOM managed by CodeMirror is generally risky (can confuse the editor). However, for specific localized changes inside a Table Widget (which is a "block" to CodeMirror), this approach proved to be the only robust way to achieve "zero-width hiding" in Live Preview.

## 9. Advanced Live Preview Table Handling

### The Challenge: Nested Editors & Source Mode
- **Live Preview Architecture**: In Live Preview, tables are rendered as widgets. When a cell is focused, a *nested* CodeMirror editor (`.cm-editor`) is injected into the cell to allow editing.
- **Problem 1: Styling Conflicts**: Our initial DOM scanner (`createTableTintPlugin`) treated the cell's content as static text. When the nested editor appeared, the scanner would try to wrap the editor's content, breaking the editor or causing input freezes/crashes due to fighting with CodeMirror's DOM management.
- **Problem 2: Marker Styling in Active Cell**: When editing a cell, the marker `:r:` is inside the nested editor's `cm-line`. Our scanner (operating on the widget level) couldn't style this text effectively or safely.
- **Problem 3: Source Mode**: Users expect Source Mode to show raw Markdown without any hiding or special rendering. Our logic was running indiscriminately.

### The Solution: Dual-Plugin Strategy
1. **Background Tinting (Wrapper Level)**:
    - Use `ViewPlugin` with `requestAnimationFrame` to scan the **table widget structure** (the `td`/`th` elements) and apply background classes.
    - **Safety**: Explicitly **ignore** any content inside a `.cm-line` to avoid touching the active editor's DOM. This prevents input freezes.
    - **Marker Hiding**: For non-active cells, wrap the marker text in a `<span>` with `width: 0` to hide it completely from layout.

2. **Active Marker Styling (Editor Level)**:
    - Use a separate `ViewPlugin` (`createTableMarkerHighlighter`) that uses **CodeMirror Decorations** to style the marker text *inside* the active editor.
    - **Why**: Decorations are the native way to style text in CodeMirror. This allows us to make the marker `:r:` small and faint (`opacity: 0.35`, `font-size: 0.75em`) when the user is typing it, without breaking editing behavior.
    - **Regex**: Updated to handle both `| :r:` (start of line in source) and `:r:` (start of content in nested editor).

3. **Source Mode Check**:
    - Added a check for `.is-live-preview` class on the editor container. If absent (Source Mode), disable all table tinting logic.

### Key Takeaway
When working with complex CodeMirror widgets (like tables in Obsidian):
- **Respect Boundaries**: Don't let DOM scanners touch the internals of nested editors.
- **Use Native Tools**: Use CodeMirror Decorations for text inside editors, and DOM manipulation only for the container/widget structure.
- **Mode Awareness**: Always check the view mode (Source vs Live Preview) before applying heavy visual changes.

## 10. Horizontal Rule (HR) Styling in Live Preview

### The Challenge: White Bar Background
- **Problem**: When a Horizontal Rule (`---`) was placed inside a tinted block, it rendered as a white bar (from the default theme) with a thin line, breaking the colored block aesthetic.
- **Cause**: Obsidian's internal `hr` rendering applies a background color to the container div, which overrides our block's background color due to specificity or render order.
- **Initial Failure**: Using `Prec.high` in `StateField` decorations didn't consistently fix it because Obsidian's DOM updates would sometimes strip our classes or styles after our decoration logic ran.

### The Solution: ViewPlugin + CSS Patch
1.  **ViewPlugin for Robustness**:
    - Implemented a `ViewPlugin` that runs after every view update (using `requestAnimationFrame`).
    - It manually checks visible lines (`.cm-line`), determines if they belong to a tinted block, and forces the `tinted-block` class and `--tint-color` style onto the DOM element. This ensures our styles persist even if Obsidian refreshes the line.

2.  **CSS Pseudo-Element for the Line**:
    - **Hide Default HR**: We hide the default `<hr>` element (or whatever Obsidian renders inside) using `display: none !important`.
    - **Custom Rendering**: We use `::after` on the container to draw the line ourselves:
        - `position: absolute; top: 50%`: Vertically centered.
        - `height: 1px`: Thin line.
        - `width: 100%`: Spanning full width.
        - `background-color`: Calculated using `color-mix` to be 80% transparent version of the block's tint color.
    - **Layout Fix**: Set `display: block` and `line-height: normal` on the container to ensure it maintains the correct height (preventing it from collapsing to 0px or looking squeezed).

### Key Takeaway
For elements that Obsidian heavily styles or manages (like HRs, Callouts, etc.), standard CodeMirror decorations might be insufficient. A `ViewPlugin` that patches the DOM *after* the render cycle is a more reliable brute-force method to ensure your styles win.
