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
