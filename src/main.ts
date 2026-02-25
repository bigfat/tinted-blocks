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
    // Capture color: ::> color
    const startRegex = new RegExp(`^${escapeRegExp(startMarker)}\\s*(.*)$`);
    const endRegex = new RegExp(`^${escapeRegExp(endMarker)}\\s*$`);

    const blocks: {start: number, end: number, color: string}[] = [];
    let currentStart = -1;
    let currentColor = "";

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const startMatch = line.text.match(startRegex);
        const endMatch = line.text.match(endRegex);

        if (startMatch) {
            currentStart = i;
            currentColor = (startMatch[1] ? startMatch[1].trim() : "") || "var(--text-normal)";
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
            // Add block (default color blue if not specified, but user didn't specify default)
            // We use 'blue' as a sensible default if user just toggles.
            const defaultColor = "blue"; 
            
            const selection = editor.getSelection();
            if (selection) {
                const newText = `${startMarker} ${defaultColor}\n${selection}\n${endMarker}\n`;
                editor.replaceSelection(newText);
            } else {
                const lineContent = editor.getLine(cursor.line);
                editor.replaceRange(
                    `${startMarker} ${defaultColor}\n${lineContent}\n${endMarker}\n`,
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
        const startRegex = new RegExp(`^${escapeRegExp(startMarker)}\\s*(.*)$`);
        const endRegex = new RegExp(`^${escapeRegExp(endMarker)}\\s*$`);

        // We need to find the "Active" block for this element.
        // Since we don't have global state easily in post-processor without scanning,
        // we scan the whole document text to find all blocks.
        // Optimization: In a real large file, we might want to cache this map based on content hash,
        // but for now, we scan.
        
        const blocks: {start: number, end: number, color: string}[] = [];
        let currentStart = -1;
        let currentColor = "";

        // Scan all lines to build block map
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined) continue;
            const startMatch = line.match(startRegex);
            const endMatch = line.match(endRegex);

            if (startMatch) {
                currentStart = i;
                currentColor = (startMatch[1] ? startMatch[1].trim() : "") || "var(--text-normal)";
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
