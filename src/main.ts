import { Plugin, MarkdownPostProcessorContext, Editor, Menu, MarkdownView } from 'obsidian';
import { RangeSetBuilder, StateField, Transaction, EditorState } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view';
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
    
    if (!pluginInstance) return builder.finish();

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
const inlineMark = Decoration.mark({ class: "custom-inline-highlight" });

// Helper to create the ViewPlugin with current settings
function createInlineHighlighter() {
    return ViewPlugin.fromClass(class {
        decorator: MatchDecorator;
        decorations: DecorationSet;
        constructor(view: EditorView) {
            const marker = pluginInstance ? pluginInstance.settings.inlineMarker : '::';
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Regex to match content between markers: ::content::
            // Use non-greedy match .*?
            const regex = new RegExp(`${escapedMarker}(.*?)${escapedMarker}`, 'g');
            
            this.decorator = new MatchDecorator({ regexp: regex, decoration: inlineMark });
            this.decorations = this.decorator.createDeco(view);
        }
        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = this.decorator.updateDeco(update, this.decorations);
            }
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
            name: 'Toggle block highlight',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.toggleBlockHighlight(editor);
            }
        });

        // Add Context Menu Item
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
                menu.addItem((item) => {
                    item
                        .setTitle('Toggle block highlight')
                        .setIcon('paint-bucket')
                        .onClick(() => {
                            this.toggleBlockHighlight(editor);
                        });
                });
            })
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
            // Use configured default color or just empty to let it use default from logic
            // User said: "default color is text #999"
            // If we write just "::>" without color, normalizeColor picks defaultColor.
            // So we can write just the marker.
            // Or we can write the defaultColor explicitly?
            // Usually cleaner to write just the marker if it implies default.
            // But let's write just the marker.
            
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

    processPreviewMode(element: HTMLElement, context: MarkdownPostProcessorContext) {
        // 1. Inline Highlight
        this.processInlineHighlight(element);

        // 2. Block Highlight (Reading View)
        // In Reading View, Obsidian calls this for every block (p, ul, etc.).
        // We need to determine if this block is inside a tinted block range.
        
        const sectionInfo = context.getSectionInfo(element);
        if (!sectionInfo) return;

        const lines = sectionInfo.text.split('\n');
        const startLineNum = sectionInfo.lineStart;
        const endLineNum = sectionInfo.lineEnd;
        const startMarker = this.settings.blockStartMarker;
        const endMarker = this.settings.blockEndMarker;
        
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startRegex = new RegExp(`^${escapeRegExp(startMarker)}(.*)$`);
        const endRegex = new RegExp(`^${escapeRegExp(endMarker)}\\s*$`);

        // We need to find the "Active" block for this element.
        // Since we don't have global state easily in post-processor without scanning,
        // we scan the whole document text to find all blocks.
        // Optimization: In a real large file, we might want to cache this map based on content hash,
        // but for now, we scan.
        
        const blocks: {start: number, end: number, color: string}[] = [];
        let currentStart = -1;
        let currentColor = "";

        // Helper to validate/normalize color
        const normalizeColor = (raw: string): string => {
            // We do NOT trim initially to detect leading spaces.
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

        // Scan all lines to build block map
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined) continue;
            const startMatch = line.match(startRegex);
            const endMatch = line.match(endRegex);

            if (startMatch) {
                currentStart = i;
                currentColor = normalizeColor(startMatch[1] || "");
            } else if (endMatch && currentStart !== -1) {
                blocks.push({ start: currentStart, end: i, color: currentColor });
                currentStart = -1;
                currentColor = "";
            }
        }

        // Check if current element falls into any block
        // The element spans from startLineNum to endLineNum
        
        for (const block of blocks) {
            // Case 1: Element is the start marker itself (or contains it)
            // Usually start marker is a single paragraph
            const isStart = (startLineNum === block.start);
            
            // Case 2: Element is the end marker itself
            const isEnd = (endLineNum === block.end); // Note: endLineNum is inclusive in sectionInfo? 
            // Actually sectionInfo.lineEnd is usually the line number of the end of the block.
            // If the element is just the end marker line, start=end=block.end
            
            // Case 3: Element is strictly inside
            // e.g. block start=5, end=10. Element is 6-9.
            // Or Element is 6-6.
            const isInside = (startLineNum > block.start && endLineNum < block.end);
            
            // Case 4: Element overlaps? Usually Obsidian breaks sections by blocks.
            // But a list could trigger this.
            
            if (isStart || isEnd || isInside) {
                // Apply base class
                element.addClass("tinted-block-preview");
                element.style.setProperty("--tint-color", block.color);
                
                if (isStart) {
                    element.addClass("tinted-block-start");
                    // We need to make sure the text is correct for styling
                    // In Reading View, Obsidian renders the text. 
                    // If we want to hide it, CSS `color: transparent` handles it.
                }
                
                if (isEnd) {
                    element.addClass("tinted-block-end");
                }
                
                // If it's a list or quote inside, we might want to add helper classes if CSS selector isn't enough
                // But CSS `.tinted-block-preview ul` should work.
                break; // Found the block, stop.
            }
        }
    }

    processInlineHighlight(element: HTMLElement) {
        const marker = this.settings.inlineMarker;
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${escapedMarker}(.*?)${escapedMarker}`); 

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            if (text && text.match(regex)) {
                const span = document.createElement('span');
                const parts = text.split(new RegExp(`(${escapedMarker}.*?${escapedMarker})`, 'g'));
                
                parts.forEach(part => {
                    if (part.startsWith(marker) && part.endsWith(marker)) {
                        const highlightSpan = document.createElement('span');
                        highlightSpan.addClass('custom-inline-highlight');
                        highlightSpan.textContent = part.slice(marker.length, -marker.length);
                        span.appendChild(highlightSpan);
                    } else {
                        span.appendChild(document.createTextNode(part));
                    }
                });
                node.parentNode?.replaceChild(span, node);
            }
        }
    }
}
