import { Plugin, MarkdownPostProcessorContext, Editor, Menu, MarkdownView } from 'obsidian';
import { RangeSetBuilder, StateField, Transaction, EditorState } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { MyPluginSettings, DEFAULT_SETTINGS, TintedBlocksSettingTab } from './settings';

// Global reference to the plugin instance to access settings from StateFields
let pluginInstance: MyBlockPlugin;

// ============================================================
// 1. 编辑模式 (Live Preview) - 块级高亮
// ============================================================

const bgDecoration = (color: string, type: 'start' | 'mid' | 'end', active: boolean) => {
    const classes = ['tinted-block'];
    if (type === 'start') classes.push('tinted-block-start');
    if (type === 'end') classes.push('tinted-block-end');
    if (active) classes.push('tinted-block-active');
    
    // Check if color is a valid CSS color or variable, if not assume it's a raw color string
    // We put it in a CSS variable.
    const style = `--tint-color: ${color}`;
    
    return Decoration.line({
        attributes: { 
            class: classes.join(' '),
            style: style
        }
    });
};

function buildBlockDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc;
    const selection = state.selection.main;
    
    if (!pluginInstance || !pluginInstance.settings.enableBlockHighlight) return builder.finish();

    const startMarker = pluginInstance.settings.blockStartMarker;
    const endMarker = pluginInstance.settings.blockEndMarker;
    
    // Create regex based on settings, escaping special characters
    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Strict syntax: marker + optional space + color + NO more spaces inside color (to avoid matching tags or sentences)
    // But user wants:
    // 1. ::>blue (no space)
    // 2. ::> blue (space)
    // 3. ::> bg-red (unrecognized color -> default)
    // And NO space AFTER the color to avoid matching tags?
    // User said: "Don't add space, because #color might be mistaken for tag."
    // Actually, user said: "I suggest not adding space [in the command/default insertion?], because if there is space, #color might be mistaken for tag. Just write immediately after. [And] ignore ones with spaces."
    
    // Let's refine the regex:
    // It should match `^MARKER\s*(COLOR_STRING)$`
    // If COLOR_STRING is empty, default color.
    // If COLOR_STRING is invalid, CSS variable fallback handles it (it just won't render color, or we can detect it).
    // Actually, CSS variable with invalid value might be transparent or inherit.
    
    // Capture group 1 is the color part.
    // Use non-greedy match for color to avoid trailing spaces
    // The previous regex `\s*(.*)$` allowed spaces inside the capture group and then we trimmed.
    // But user wants `::> blue` (space separator) -> color "blue"
    // `::>blue` (no space) -> color "blue"
    // `::>bg-blue` (no space) -> color "bg-blue" (invalid -> default)
    // `::> #0000ff` (space) -> color "#0000ff"
    // `::>#0000ff` (no space) -> color "#0000ff"
    
    // BUT user said: `::>bg-blue` should be default.
    // Currently `normalizeColor` handles invalid CSS color "bg-blue" by returning defaultColor.
    // The only issue is `::>blue` vs `::> blue`.
    
    // The issue with the previous implementation was that `\s*` consumed the space, 
    // and `(.*)` captured the rest. `trim()` removed extra spaces.
    // BUT `normalizeColor` rejected if `c.includes(' ')`.
    // If user typed `::> blue`, match[1] is "blue". trim() is "blue". includes(' ') is false. Valid.
    // If user typed `::>blue`, match[1] is "blue". trim() is "blue". includes(' ') is false. Valid.
    // If user typed `::>bg-blue`, match[1] is "bg-blue". Valid string, but `CSS.supports` rejects it. Returns default. Correct.
    
    // The user claimed `::>bg-blue` was "default color" in his test, which is correct behavior.
    // The user claimed `::> blue` was "default color" in his test. Wait.
    // If `::> blue` became default color, it means `normalizeColor` returned default.
    // Why? "blue" is valid CSS.
    // Maybe `startMatch[1]` contained a space?
    // Regex: `^::>\s*(.*)$`
    // Text: `::> blue`
    // `\s*` matches " ". `(.*)` matches "blue".
    // `startMatch[1]` is "blue". `trim()` is "blue".
    // Should work.
    
    // Unless the regex engine behavior with `\s*` and `(.*)` captured the space into group 1?
    // `\s*` is greedy? No.
    // Actually, let's make it explicit.
    // We want to capture the color string.
    
    // User requirement: "Don't add space, because #color might be mistaken for tag."
    // User meant: "I advise against using space as separator... but if I do use space, treat it as separator."
    
    // Let's change regex to: `^MARKER( ?)(.*)$`
    // Group 1: optional space. Group 2: color.
    
    // Actually, the user's report that `::> blue` -> default color is strange if my previous logic was correct.
    // Let's look at `c.includes(' ')`.
    // If `startMatch[1]` was " blue" (leading space), `trim()` fixes it.
    
    // WAIT. User said: "::> blue" -> Default Color.
    // This implies `normalizeColor("blue")` failed or `startMatch` failed?
    // If `::> blue` works, it should be blue.
    // Maybe the user's previous test was with a version where I disallowed spaces completely?
    // In previous turn I added `if (c.includes(' ')) return default`.
    // "blue" does not include space.
    
    // Maybe the issue is `::>bg-blue`?
    // "bg-blue" is invalid CSS. Returns default. Correct.
    
    // Maybe the user wants to ENFORCE no space separator?
    // "::>blue" -> blue
    // "::> blue" -> invalid (default) ??
    // User said: "::> blue" -> "默认色" (Default color).
    // This means he WANTS "::> blue" to fail? Or he observed it failed?
    // He listed it as an example of what happened or what he wants?
    // "你这个规则还是没有完全按照我想的，我现在举几个例子，你来理解一下"
    // "::>blue" -> 蓝色 (Correct)
    // "::> blue" -> 默认色 (He wants this to be default/invalid? Or he observed it?)
    // Context: "另外语法上面，我建议不要加空格了... 带空格的就全都不认就好。"
    // YES. He wants "::> blue" (with space) to be INVALID (Default color).
    // He wants to ban the space separator.
    
    // So Regex should NOT allow space between marker and color.
    // Regex: `^MARKER(.*)$`
    // And `(.*)` must NOT start with space.
    // Actually, if we just capture `(.*)`, and if it starts with space, we treat as invalid.
    
    const startRegex = new RegExp(`^${escapeRegExp(startMarker)}(.*)$`);
    const endRegex = new RegExp(`^${escapeRegExp(endMarker)}\\s*$`);

    const blocks: {start: number, end: number, color: string}[] = [];
    let currentStart = -1;
    let currentColor = "";

    // Helper to validate/normalize color
    const normalizeColor = (raw: string): string => {
        // We do NOT trim initially to detect leading spaces.
        // User wants `::> blue` (with leading space) to be INVALID (Default Color).
        // Only `::>blue` (no leading space) is valid.
        
        // 1. If empty, use default color setting
        if (!raw) return pluginInstance.settings.defaultColor;

        // 2. If starts with space, treat as invalid -> default color
        // This enforces NO space separator.
        if (raw.startsWith(' ')) return pluginInstance.settings.defaultColor;

        const c = raw.trim(); // Now we can trim trailing spaces if any

        // 3. If contains spaces (e.g. "bg blue"), treat as invalid -> default color
        if (c.includes(' ')) return pluginInstance.settings.defaultColor;

        // 4. Check validity using CSS.supports
        if (window.CSS && window.CSS.supports && !window.CSS.supports('color', c)) {
            return pluginInstance.settings.defaultColor;
        }

        return c;
    };

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const startMatch = line.text.match(startRegex);
        const endMatch = line.text.match(endRegex);

        if (startMatch) {
            currentStart = i;
            currentColor = normalizeColor(startMatch[1] || "");
        } else if (endMatch && currentStart !== -1) {
            blocks.push({ start: currentStart, end: i, color: currentColor });
            currentStart = -1;
            currentColor = "";
        }
    }

    const lineActions = new Map<number, {type: 'start'|'mid'|'end', color: string, active: boolean}>();
    
    for (let block of blocks) {
        // Check if cursor is inside this block (inclusive of start/end lines)
        const startLineObj = doc.line(block.start);
        const endLineObj = doc.line(block.end);
        
        // A block is active if the selection head (cursor) is anywhere from start of startLine to end of endLine
        const isActive = selection.head >= startLineObj.from && selection.head <= endLineObj.to;

        lineActions.set(block.start, { type: 'start', color: block.color, active: isActive });
        lineActions.set(block.end, { type: 'end', color: block.color, active: isActive });
        for (let k = block.start + 1; k < block.end; k++) {
            lineActions.set(k, { type: 'mid', color: block.color, active: isActive });
        }
    }

    for (let i = 1; i <= doc.lines; i++) {
        const action = lineActions.get(i);
        if (!action) continue;
        const line = doc.line(i);

        builder.add(line.from, line.from, bgDecoration(action.color, action.type, action.active));
    }
    return builder.finish();
}

const blockHighlighter = StateField.define<DecorationSet>({
    create(state) { return buildBlockDecorations(state); },
    update(oldDecos, tr) {
        if (tr.docChanged || tr.selection) return buildBlockDecorations(tr.state);
        return oldDecos;
    },
    provide: field => EditorView.decorations.from(field)
});

// ============================================================
// 2. 行内高亮 (Inline)
// ============================================================

// Helper to create the ViewPlugin with current settings
function createInlineHighlighter() {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;
        
        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            if (pluginInstance && !pluginInstance.settings.enableInlineHighlight) return builder.finish();

            const { state } = view;
            const doc = state.doc;
            const selection = state.selection.main;
            
            // Marker configuration
            const marker = pluginInstance ? pluginInstance.settings.inlineMarker : '::';
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Regex: ::(?:([rgby]):)?(.*?)::
            // Matches: ::r:text:: or ::text::
            // Group 1: color code (r,g,b,y) or undefined
            // Group 2: content
            const regex = new RegExp(`${escapedMarker}(?:([rgby]):)?(.*?)${escapedMarker}`, 'g');
            
            // Iterate over visible ranges for performance
            for (const { from, to } of view.visibleRanges) {
                const rangeText = doc.sliceString(from, to);
                let match;
                
                while ((match = regex.exec(rangeText)) !== null) {
                    const matchStart = from + match.index;
                    const fullMatch = match[0];
                    const matchEnd = matchStart + fullMatch.length;

                    // Check if inside code block/inline code
                    const tree = syntaxTree(state);
                    // Resolve at start + 1 to be safely inside the match (in case match starts at boundary)
                    // But if match is `::...` inside `...` it should be fine.
                    // Resolving at matchStart is usually enough if the node covers it.
                    // But for inline code `...` the backtick is separate node usually.
                    // Let's check the middle of the match to be safe?
                    // Or check start.
                    const node = tree.resolveInner(matchStart + 1, -1);
                    const nodeName = node.type.name;
                    if (nodeName.includes("code") || nodeName.includes("Code") || nodeName.includes("math")) {
                        continue;
                    }
                    
                    const colorCode = match[1]; // r, g, b, y or undefined
                    const content = match[2] || "";
                    
                    // Determine Color Class
                    let colorClass = 'tinted-inline-yellow'; // default
                    if (colorCode === 'r') colorClass = 'tinted-inline-red';
                    if (colorCode === 'g') colorClass = 'tinted-inline-green';
                    if (colorCode === 'b') colorClass = 'tinted-inline-blue';
                    if (colorCode === 'y') colorClass = 'tinted-inline-yellow';
                    
                    // Check cursor position
                    const isCursorInside = selection.head >= matchStart && selection.head <= matchEnd;
                    
                    // Calculate sub-ranges
                    // Start Marker: from matchStart to matchStart + (fullLen - contentLen - endMarkerLen)
                    // End Marker: from matchEnd - endMarkerLen to matchEnd
                    
                    const endMarkerLen = marker.length;
                    const contentLen = content.length;
                    const startMarkerLen = fullMatch.length - contentLen - endMarkerLen;
                    
                    const startMarkerFrom = matchStart;
                    const startMarkerTo = matchStart + startMarkerLen;
                    
                    const contentFrom = startMarkerTo;
                    const contentTo = contentFrom + contentLen;
                    
                    const endMarkerFrom = contentTo;
                    const endMarkerTo = matchEnd;
                    
                    // Add Decorations
                    
                    // Unified Block approach:
                    // Instead of separate marks, we mark the WHOLE range with the background color.
                    // And we apply specific classes to the start/end parts to style the text (faint).
                    
                    if (isCursorInside) {
                        // Whole range gets the background color + rounded corners
                        // But wait, if we use one mark for the whole range, we can't easily style the text of just the markers differently 
                        // unless we use span wrapping logic which CodeMirror decorations do well.
                        
                        // Actually, we can stack decorations or use multiple classes.
                        // Let's stick to separate ranges but ensure they have matching classes that join them visually.
                        
                        // 1. Start Marker
                        builder.add(startMarkerFrom, startMarkerTo, Decoration.mark({ 
                            class: `tinted-inline-marker tinted-inline-start ${colorClass}` 
                        }));
                        
                        // 2. Content
                        builder.add(contentFrom, contentTo, Decoration.mark({ 
                            class: `tinted-inline-content ${colorClass}` 
                        }));
                        
                        // 3. End Marker
                        builder.add(endMarkerFrom, endMarkerTo, Decoration.mark({ 
                            class: `tinted-inline-marker tinted-inline-end ${colorClass}` 
                        }));
                        
                    } else {
                        // Cursor outside: Hide markers, show content
                        builder.add(startMarkerFrom, startMarkerTo, Decoration.replace({})); 
                        builder.add(contentFrom, contentTo, Decoration.mark({ class: `tinted-inline ${colorClass}` }));
                        builder.add(endMarkerFrom, endMarkerTo, Decoration.replace({}));
                    }
                }
            }
            return builder.finish();
        }
    }, { decorations: v => v.decorations });
}


// ============================================================
// 3. Main Plugin Class
// ============================================================
export default class MyBlockPlugin extends Plugin {
    settings: MyPluginSettings;
    private inlinePlugin: any;

    async onload() {
        pluginInstance = this;
        await this.loadSettings();

        // Register extensions
        this.inlinePlugin = createInlineHighlighter();
        this.registerEditorExtension([blockHighlighter, this.inlinePlugin]);

        // Register Markdown Post Processor (Reading View)
        this.registerMarkdownPostProcessor((element, context) => {
            this.processPreviewMode(element, context);
        });

        // Add Settings Tab
        this.addSettingTab(new TintedBlocksSettingTab(this.app, this));

        // Add Command
        this.addCommand({
            id: 'toggle-block-highlight',
            name: 'Tint block',
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "'" }],
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.toggleBlockHighlight(editor);
            }
        });

        this.addCommand({
            id: 'toggle-inline-highlight',
            name: 'Highlight text',
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "b" }],
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.toggleInlineHighlight(editor);
            }
        });

        // Add Context Menu Item
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
                // Add items to the context menu
                // There is no explicit "Format" submenu in API, so we just add them.
                // Or we can try to find a section if Obsidian exposes it, but usually adding to root is standard.
                
                menu.addItem((item) => {
                    item
                        .setTitle('Tint block')
                        .setIcon('paint-bucket')
                        .onClick(() => {
                            this.toggleBlockHighlight(editor);
                        });
                });

                menu.addItem((item) => {
                    item
                        .setTitle('Highlight text')
                        .setIcon('highlighter')
                        .onClick(() => {
                            this.toggleInlineHighlight(editor);
                        });
                });
            })
        );
    }

    async loadSettings() {
        // Try to load data
        const data = await this.loadData();
        
        // If data is null (first run) or object, merge with default
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        
        // Ensure markers are not empty or invalid
        if (!this.settings.blockStartMarker) this.settings.blockStartMarker = DEFAULT_SETTINGS.blockStartMarker;
        if (!this.settings.blockEndMarker) this.settings.blockEndMarker = DEFAULT_SETTINGS.blockEndMarker;
        if (!this.settings.inlineMarker) this.settings.inlineMarker = DEFAULT_SETTINGS.inlineMarker;
        
        // Sanity check: prevent start == end
        if (this.settings.blockStartMarker === this.settings.blockEndMarker) {
            console.warn('[Tinted Blocks] Start and End markers cannot be the same. Resetting to defaults.');
            this.settings.blockStartMarker = DEFAULT_SETTINGS.blockStartMarker;
            this.settings.blockEndMarker = DEFAULT_SETTINGS.blockEndMarker;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Force refresh of views to apply new settings
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof MarkdownView) {
                // Trigger rebuild
                 const editor = leaf.view.editor;
                 // @ts-ignore
                 if (editor && editor.cm) {
                     // @ts-ignore
                     const cm = editor.cm as EditorView;
                     // Trigger update
                     cm.dispatch({});
                 }
            }
        });
    }

    toggleBlockHighlight(editor: Editor) {
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();
        const startMarker = this.settings.blockStartMarker;
        const endMarker = this.settings.blockEndMarker;
        
        // Check if we are inside a block
        let startLine = -1;
        let endLine = -1;
        let foundStart = false;
        let foundEnd = false;

        // Look upwards for start
        for (let i = cursor.line; i >= 0; i--) {
            const lineText = editor.getLine(i);
            if (lineText.startsWith(startMarker)) {
                startLine = i;
                foundStart = true;
                break;
            }
            if (lineText.startsWith(endMarker) && i < cursor.line) {
                break;
            }
        }

        // Look downwards for end
        if (foundStart) {
            for (let i = cursor.line; i < lineCount; i++) {
                const lineText = editor.getLine(i);
                if (lineText.startsWith(endMarker)) {
                    endLine = i;
                    foundEnd = true;
                    break;
                }
                if (lineText.startsWith(startMarker) && i > cursor.line) {
                    break;
                }
            }
        }

        if (foundStart && foundEnd) {
            // Remove the block
            editor.replaceRange('', { line: endLine, ch: 0 }, { line: endLine + 1, ch: 0 });
            editor.replaceRange('', { line: startLine, ch: 0 }, { line: startLine + 1, ch: 0 });
        } else {
            // Add block
            const selection = editor.getSelection();
            if (selection) {
                const newText = `${startMarker}\n${selection}\n${endMarker}\n`;
                editor.replaceSelection(newText);
            } else {
                const lineContent = editor.getLine(cursor.line);
                editor.replaceRange(
                    `${startMarker}\n${lineContent}\n${endMarker}\n`,
                    { line: cursor.line, ch: 0 },
                    { line: cursor.line + 1, ch: 0 }
                );
            }
        }
    }

    toggleInlineHighlight(editor: Editor) {
        const selection = editor.getSelection();
        const marker = this.settings.inlineMarker;
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Regex to check if already wrapped (supports optional color code)
        // Matches ::r:text:: or ::text::
        const fullRegex = new RegExp(`^${escapedMarker}(?:[rgby]:)?(.*)${escapedMarker}$`);
        
        if (selection.match(fullRegex)) {
             // Unwrap
             // We need to capture the inner content
             // The regex above captures the content in group 1
             const match = selection.match(fullRegex);
             if (match) {
                 editor.replaceSelection(match[1] || "");
             }
        } else {
            // Wrap
            // Use default (yellow) -> ::text::
            editor.replaceSelection(`${marker}${selection}${marker}`);
        }
    }

    // Helper to validate/normalize color (Exposed for reuse if needed, but here it's fine)
    normalizeColor(raw: string): string {
        // Debug Log
        // console.log(`[Tinted Blocks] Normalizing color: '${raw}'`);

        // Strict Validation Rule:
        // 1. If empty -> Default
        if (!raw) {
            // console.log(`[Tinted Blocks] Empty -> Default`);
            return this.settings.defaultColor;
        }

        // 2. If starts with space -> Default (Invalid syntax)
        if (raw.startsWith(' ')) {
            // console.log(`[Tinted Blocks] Starts with space -> Default`);
            return this.settings.defaultColor;
        }
        
        // 3. If contains space -> Default (Invalid syntax)
        if (raw.includes(' ')) {
             // console.log(`[Tinted Blocks] Contains space -> Default`);
             return this.settings.defaultColor;
        }

        // 4. Strictest Check: Assign to style.color and see if it sticks
        const s = new Option().style;
        s.color = raw;
        // If s.color is empty string, it means the browser rejected it.
        if (s.color === '') {
             // console.log(`[Tinted Blocks] Invalid CSS color (rejected by browser) -> Default`);
             return this.settings.defaultColor;
        }

        // console.log(`[Tinted Blocks] Valid color -> '${raw}'`);
        return raw;
    }

    // Use MutationObserver instead of timeout for reliable detection
    private activeObservers = new Map<HTMLElement, MutationObserver>();

    queueWrapping(element: HTMLElement) {
        if (!element.parentElement) {
            // Wait for attachment
            let attempts = 0;
            const checkParent = () => {
                if (element.parentElement) {
                    this.setupObserver(element.parentElement);
                } else if (attempts < 10) {
                    attempts++;
                    window.setTimeout(checkParent, 20);
                }
            };
            checkParent();
        } else {
            this.setupObserver(element.parentElement);
        }
    }

    setupObserver(container: HTMLElement) {
        if (this.activeObservers.has(container)) return;

        // Debounce the actual processing
        let timeout: number | null = null;
        
        const process = () => {
            this.wrapMarkedBlocks(container);
        };

        const observer = new MutationObserver((mutations) => {
            // Disconnect immediately to prevent loops
            observer.disconnect();
            
            if (timeout) window.clearTimeout(timeout);
            timeout = window.setTimeout(process, 100);
        });

        observer.observe(container, { childList: true });
        this.activeObservers.set(container, observer);
        
        // Also trigger once initially in case everything is already there
        if (timeout) window.clearTimeout(timeout);
        timeout = window.setTimeout(process, 100);
    }
    
    wrapMarkedBlocks(container: HTMLElement) {
        // Re-establish observer connection first (it was disconnected in callback or we need to ensure it's on)
        // Actually, we should only reconnect AFTER we are done modifying.
        // But the `process` function is called async via setTimeout.
        // So the observer is already disconnected if it came from a mutation callback.
        // If it came from initial setup, it's connected.
        
        // Let's grab the observer
        const observer = this.activeObservers.get(container);
        if (observer) observer.disconnect();

        try {
            // console.log(`[Tinted Blocks] Wrapping blocks in container`, container);
            const children = Array.from(container.children) as HTMLElement[];
            
            // CLEANUP STEP: Remove all existing styling classes from this container's children.
            children.forEach(child => {
                child.classList.remove('tinted-block-item', 'tinted-block-item-start', 'tinted-block-item-end');
                child.style.removeProperty('--tint-color');
            });
            
            // Prepare Regex for Fallback Scanning
            const startMarker = this.settings.blockStartMarker;
            const endMarker = this.settings.blockEndMarker;
            const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Regex must match what processPreviewMode uses
            const startRegex = new RegExp(`^\\s*${escapeRegExp(startMarker)}(.*)`); 
            const endRegex = new RegExp(`${escapeRegExp(endMarker)}\\s*$`); 

            let startEl: HTMLElement | null = null;
            let elementsToWrap: HTMLElement[] = [];
            let currentColor = "";
            let startMarkerText = "";

            for (const child of children) {
                let isStart = false;
                let isEnd = false;
                let currentStartMarker = "";
                let currentEndMarker = "";
                let color = "";

                // Check dataset first (fast path)
                if (child.dataset.tintedStart) {
                    isStart = true;
                    currentStartMarker = child.dataset.tintedStartMarker || "";
                    color = child.dataset.tintedColor || "";
                } else {
                    // Fallback: Check text content
                    const text = child.textContent || "";
                    const match = text.match(startRegex);
                    if (match) {
                        isStart = true;
                        currentStartMarker = match[0];
                        color = this.normalizeColor(match[1] || "");
                        // Save to dataset for future efficiency
                        child.dataset.tintedStart = "true";
                        child.dataset.tintedStartMarker = currentStartMarker;
                        child.dataset.tintedColor = color;
                    }
                }

                // Check End
                if (child.dataset.tintedEnd) {
                    isEnd = true;
                    currentEndMarker = child.dataset.tintedEndMarker || "";
                } else {
                    // Fallback
                    const text = child.textContent || "";
                    const match = text.match(endRegex);
                    if (match) {
                        isEnd = true;
                        currentEndMarker = match[0];
                        child.dataset.tintedEnd = "true";
                        child.dataset.tintedEndMarker = currentEndMarker;
                    }
                }

                // Logic State Machine
                if (isStart) {
                    if (startEl) {
                        // We found a NEW start marker while a previous one was open.
                        // This means the previous block was not closed (missing end marker).
                        // We should close the previous block implicitly? Or just abandon it?
                        // If we abandon it, the elements remain unstyled.
                        // Let's assume nested blocks are not allowed, so we restart.
                        // console.log(`[Tinted Blocks] Found new start '${currentStartMarker}' before closing previous. Restarting from here.`);
                        // Ideally we should process the previous elements? 
                        // No, without end marker it's invalid.
                    }
                    startEl = child;
                    currentColor = color;
                    startMarkerText = currentStartMarker;
                    elementsToWrap = [child];
                    
                    // If this same element is ALSO an end marker (single line block)
                    if (isEnd) {
                        this.performWrap(container, elementsToWrap, currentColor, startMarkerText, currentEndMarker);
                        startEl = null;
                        elementsToWrap = [];
                    }
                    continue;
                }

                if (startEl) {
                    // We are inside a block
                    elementsToWrap.push(child);
                    
                    if (isEnd) {
                        // Found end
                        this.performWrap(container, elementsToWrap, currentColor, startMarkerText, currentEndMarker);
                        startEl = null;
                        elementsToWrap = [];
                    }
                } else if (isEnd) {
                    // Found an end marker but no start marker was open.
                    // Orphaned end marker. Ignore.
                    // console.log(`[Tinted Blocks] Found orphaned end marker.`);
                }
            }
        } finally {
            // Reconnect observer
            if (observer) {
                observer.observe(container, { childList: true });
            }
        }
    }

    performWrap(container: HTMLElement, elements: HTMLElement[], color: string, startMarker: string, endMarker: string) {
        if (elements.length === 0) return;
        
        // Strategy: Apply classes to existing elements instead of wrapping
        // This prevents Obsidian's DOM diffing from flattening our wrapper
        
        elements.forEach((el, index) => {
            el.addClass("tinted-block-item");
            el.style.setProperty("--tint-color", color);
            
            if (index === 0) {
                el.addClass("tinted-block-item-start");
            }
            if (index === elements.length - 1) {
                el.addClass("tinted-block-item-end");
            }
            
            // Cleanup attributes
            // CRITICAL FIX: Do NOT remove dataset attributes (data-tinted-start/end).
            // We need them to persist because we remove the text content.
            // If `wrapMarkedBlocks` runs again (e.g. after a neighbor edit), it needs these attributes
            // to identify the marker elements since the text "::>blue" is gone.
            
            // el.removeAttribute('data-tinted-start');
            // el.removeAttribute('data-tinted-end');
            // el.removeAttribute('data-tinted-color');
            // el.removeAttribute('data-tinted-start-marker');
            // el.removeAttribute('data-tinted-end-marker');
        });

        // Clean text
        // Start
        const firstEl = elements[0];
        if (elements.length > 0 && startMarker && firstEl) {
             this.removeTextFromStart(firstEl, startMarker);
        }
        // End
        const lastEl = elements[elements.length-1];
        if (elements.length > 0 && endMarker && lastEl) {
             this.removeTextFromEnd(lastEl, endMarker);
        }
    }

    processPreviewMode(element: HTMLElement, context: MarkdownPostProcessorContext) {
        // Unconditional Log to prove execution
        // console.log(`[Tinted Blocks] PostProcessor called at ${new Date().toISOString()}`);
        
        // 1. Inline Highlight
        if (this.settings.enableInlineHighlight) {
            this.processInlineHighlight(element);
        }

        // 2. Block Highlight (Reading View)
        if (!this.settings.enableBlockHighlight) return;
        
        // Mark elements and queue wrapping
        
        const startMarker = this.settings.blockStartMarker;
        const endMarker = this.settings.blockEndMarker;
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const startRegex = new RegExp(`^\\s*${escapeRegExp(startMarker)}(.*)`); 
        const endRegex = new RegExp(`${escapeRegExp(endMarker)}\\s*$`); 
        
        let children = Array.from(element.children) as HTMLElement[];
        if (children.length === 0) children = [element];

        let hasWork = false;

        for (const child of children) {
            const text = child.textContent || "";
            // Debug the exact content being matched
            // console.log(`[Tinted Blocks] Checking content (len=${text.length}): '${text.replace(/\n/g, '\\n')}'`);
            
            // Check Start
            const startMatch = text.match(startRegex);
            if (startMatch) {
                // console.log(`[Tinted Blocks] Marking START on wrapper:`, element);
                // Mark the ELEMENT (wrapper), not just the child
                element.dataset.tintedStart = "true";
                element.dataset.tintedStartMarker = startMatch[0]; 
                
                const rawColor = startMatch[1] || "";
                element.dataset.tintedColor = this.normalizeColor(rawColor);
                hasWork = true;
            }

            // Check End
            const endMatch = text.match(endRegex);
            if (endMatch) {
                // console.log(`[Tinted Blocks] Marking END on wrapper:`, element);
                element.dataset.tintedEnd = "true";
                element.dataset.tintedEndMarker = endMatch[0];
                hasWork = true;
            }
        }

        if (hasWork) {
            this.queueWrapping(element);
        } else {
            // Even if this specific element has no markers, it might be a new middle-child of an existing block.
            // Or it might be an element that broke a block.
            // We should queue the parent to re-evaluate the whole container.
            
            // PERFORMANCE FIX: 
            // Do NOT queue wrapping for every single element without markers!
            // This causes massive performance issues (thousands of timers) on large documents.
            // Only rely on MutationObserver (set up by marked blocks) to handle dynamic updates.
            // If a block has NO markers at all, it doesn't need to be observed initially.
            // When a marker IS added, this function will run again with hasWork=true, setting up the observer.
            
            // However, if we are inside a container that IS already observed, the observer handles it.
            // If we are inside a container that is NOT observed, and we have no markers, we do nothing.
            // This is safe and performant.
            
            // EXCEPTION: If we are editing and REMOVE a marker, this element now has no markers.
            // But the parent is likely already observed (from previous state).
            // The MutationObserver will detect the text change and trigger a re-scan of the parent.
            // So we don't need to manually queue here either.
        }
    }

    onunload() {
        // Clean up all observers
        for (const observer of this.activeObservers.values()) {
            observer.disconnect();
        }
        this.activeObservers.clear();
    }

    // Robust text removal helpers
    removeTextFromStart(element: HTMLElement, textToRemove: string) {
        // Safety Check: Verify the text actually starts with the marker
        const currentText = element.textContent || "";
        
        // Use a loose check to account for potential whitespace differences, 
        // but strict enough to prevent removing content if marker is gone.
        if (!currentText.includes(textToRemove) && !currentText.trim().startsWith(textToRemove.trim())) {
            return;
        }

        // We traverse text nodes and eat characters until we removed enough.
        let charsLeft = textToRemove.length;
        
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        
        while (node && charsLeft > 0) {
            const val = node.textContent || "";
            if (val.length <= charsLeft) {
                charsLeft -= val.length;
                node.textContent = "";
                node = walker.nextNode();
            } else {
                node.textContent = val.substring(charsLeft);
                charsLeft = 0;
            }
        }
        
        // Remove any leading <br> tags immediately following the removed text
        this.removeLeadingBR(element);
         
        // Post-processing: If the element is now effectively empty
        const text = element.textContent?.trim();
        
         const hasContent = Array.from(element.childNodes).some(node => {
             if (node.nodeType === Node.TEXT_NODE && node.textContent?.replace(/\u200B/g, '').trim()) return true;
             if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'BR') return true;
             return false;
         });
 
         if (!text && !hasContent) {
             element.style.display = 'none';
              element.addClass('tinted-block-hidden');
              element.classList.remove('tinted-block-item'); 
              
              let next = element.nextElementSibling as HTMLElement;
              while (next && (next.style.display === 'none' || next.classList.contains('tinted-block-hidden'))) {
                  next = next.nextElementSibling as HTMLElement;
              }
              
              if (next && next.classList.contains('tinted-block-item')) {
                  next.classList.add('tinted-block-item-start');
              }
         }
    }

    removeTextFromEnd(element: HTMLElement, textToRemove: string) {
        // Safety Check: Verify the text actually ends with the marker
        const currentText = element.textContent || "";
        
        // If the element text doesn't end with the marker (ignoring trailing whitespace), return.
        // We trim the comparison to be robust against trailing newlines/spaces in DOM vs Marker.
        if (!currentText.trimEnd().endsWith(textToRemove.trimEnd())) {
            // console.log(`[Tinted Blocks] End marker '${textToRemove}' not found at end of '${currentText}'. Skipping removal.`);
            return;
        }

        const nodes: Node[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        while(node = walker.nextNode()) nodes.push(node);
        
        let charsToCut = textToRemove.length;
        
        // Iterate backwards
        for (let i = nodes.length - 1; i >= 0; i--) {
            if (charsToCut <= 0) break;
            
            const n = nodes[i];
            if (!n) continue; // Safety check
            
            const val = n.textContent || "";
            
            if (val.length <= charsToCut) {
                charsToCut -= val.length;
                n.textContent = "";
            } else {
                n.textContent = val.substring(0, val.length - charsToCut);
                charsToCut = 0;
            }
        }
        
        // Check end element for emptiness too
        const text = element.textContent?.trim();
        const hasContent = Array.from(element.childNodes).some(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
            if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'BR') return true;
            return false;
        });

        if (!text && !hasContent) {
             // console.log(`[Tinted Blocks] End element is empty after removal. Hiding and promoting previous sibling.`);
             element.style.display = 'none';
             element.classList.remove('tinted-block-item');
             
             let prev = element.previousElementSibling as HTMLElement;
             while (prev && prev.style.display === 'none') {
                 prev = prev.previousElementSibling as HTMLElement;
             }
             
             if (prev && prev.classList.contains('tinted-block-item')) {
                 prev.classList.add('tinted-block-item-end');
             }
        }
    }

    removeLeadingBR(element: Node): boolean {
        // Returns true if we should stop (found text or removed BR)
        const children = Array.from(element.childNodes);
        for (const child of children) {
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.textContent && child.textContent.replace(/\u200B/g, '').trim().length > 0) {
                    return true; // Found text, stop
                }
                // Whitespace text, ignore and continue
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as HTMLElement;
                if (el.tagName === 'BR') {
                    // Found it!
                    // console.log(`[Tinted Blocks] Removing phantom <br> in`, el.parentElement);
                    el.remove();
                    return true; // Done
                }
                // Recurse into other elements (like p, span, strong)
                if (this.removeLeadingBR(el)) {
                    return true;
                }
            }
        }
        return false;
    }

    processInlineHighlight(element: HTMLElement) {
        const marker = this.settings.inlineMarker; // "::"
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Regex: ::(?:([rgby]):)?(.*?)::
        const regex = new RegExp(`${escapedMarker}(?:([rgby]):)?(.*?)${escapedMarker}`, 'g');

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        const nodesToReplace: {node: Text, matches: RegExpMatchArray[]}[] = [];
        
        while (node = walker.nextNode()) {
            // Skip if inside code block or inline code
            const parent = node.parentElement;
            if (parent && (parent.tagName === 'CODE' || parent.tagName === 'PRE' || parent.closest('code') || parent.closest('pre'))) {
                continue;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                 const text = node.textContent || "";
                 // Use matchAll to find all occurrences if supported, or loop with exec
                 const matches: RegExpMatchArray[] = [];
                 let match;
                 // Reset regex lastIndex just in case
                 regex.lastIndex = 0;
                 while ((match = regex.exec(text)) !== null) {
                     matches.push(match);
                 }
                 
                 if (matches.length > 0) {
                     nodesToReplace.push({ node: node as Text, matches });
                 }
            }
        }
        
        // Perform replacements
        for (const { node, matches } of nodesToReplace) {
             const fragment = document.createDocumentFragment();
             let lastIndex = 0;
             const text = node.textContent || "";
             
             for (const match of matches) {
                 const matchIndex = match.index!;
                 
                 // Add text before match
                 if (matchIndex > lastIndex) {
                     fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
                 }
                 
                 // Create span
                 const colorCode = match[1];
                 const content = match[2] || "";
                 
                 let colorClass = 'tinted-inline-yellow';
                 if (colorCode === 'r') colorClass = 'tinted-inline-red';
                 if (colorCode === 'g') colorClass = 'tinted-inline-green';
                 if (colorCode === 'b') colorClass = 'tinted-inline-blue';
                 if (colorCode === 'y') colorClass = 'tinted-inline-yellow';
                 
                 const span = document.createElement('span');
                 span.className = `tinted-inline ${colorClass}`;
                 span.textContent = content;
                 
                 fragment.appendChild(span);
                 
                 lastIndex = matchIndex + match[0].length;
             }
             
             // Add remaining text
             if (lastIndex < text.length) {
                 fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
             }
             
             node.parentNode?.replaceChild(fragment, node);
        }
    }
}
