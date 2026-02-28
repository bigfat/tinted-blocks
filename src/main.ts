
import { Plugin, MarkdownPostProcessorContext, Editor, Menu, MarkdownView } from 'obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS, TintedBlocksSettingTab } from './settings';
import { createBlockTinter, processBlockTint, cleanupBlockTintObservers } from './block-tint';
import { createInlineHighlighter, processInlineHighlight } from './inline-highlight';
import { createTableTintPlugin, createTableMarkerHighlighter, processTableTinting } from './table-tint';
import { createBlockFoldService } from './folding';

export default class MyBlockPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Register extensions
        this.registerEditorExtension([
            createBlockTinter(this), 
            createInlineHighlighter(this), 
            createTableTintPlugin(this), 
            createTableMarkerHighlighter(this),
            createBlockFoldService(this.settings)
        ]);

        // Register Markdown Post Processor (Reading View)
        this.registerMarkdownPostProcessor((element, context) => {
            this.processPreviewMode(element, context);
        });

        // Add Settings Tab
        this.addSettingTab(new TintedBlocksSettingTab(this.app, this));

        // Add Command
        this.addCommand({
            id: 'toggle-block-tint',
            name: 'Tint block',
            checkCallback: (checking: boolean) => {
                if (!this.settings.enableBlockTint) return false;
                if (checking) return true;
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    this.toggleBlockTint(view.editor);
                }
                return true;
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "'" }]
        });

        this.addCommand({
            id: 'toggle-inline-highlight',
            name: 'Highlight text',
            checkCallback: (checking: boolean) => {
                if (!this.settings.enableInlineHighlight) return false;
                if (checking) return true;
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    this.toggleInlineHighlight(view.editor);
                }
                return true;
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "b" }]
        });

        // Add Context Menu Item
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
                if (this.settings.enableBlockTint) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Tint block')
                            .setIcon('paint-bucket')
                            .onClick(() => {
                                this.toggleBlockTint(editor);
                            });
                    });
                }

                if (this.settings.enableInlineHighlight) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Highlight text')
                            .setIcon('highlighter')
                            .onClick(() => {
                                this.toggleInlineHighlight(editor);
                            });
                    });
                }
            })
        );
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        
        // Ensure markers are not empty or invalid
        if (!this.settings.blockStartMarker) this.settings.blockStartMarker = DEFAULT_SETTINGS.blockStartMarker;
        if (!this.settings.blockEndMarker) this.settings.blockEndMarker = DEFAULT_SETTINGS.blockEndMarker;
        if (!this.settings.inlineMarker) this.settings.inlineMarker = DEFAULT_SETTINGS.inlineMarker;
        if (!this.settings.defaultColor) this.settings.defaultColor = DEFAULT_SETTINGS.defaultColor;
        
        // Sanity check
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
                 const editor = leaf.view.editor;
                 // @ts-ignore
                 if (editor && editor.cm) {
                     // @ts-ignore
                     const cm = editor.cm;
                     // Trigger update
                     cm.dispatch({});
                 }
            }
        });
    }

    toggleBlockTint(editor: Editor) {
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
            // Order matters: remove bottom first so line numbers don't shift
            editor.replaceRange('', { line: endLine, ch: 0 }, { line: endLine + 1, ch: 0 });
            editor.replaceRange('', { line: startLine, ch: 0 }, { line: startLine + 1, ch: 0 });
        } else {
            // Add block
            if (editor.somethingSelected()) {
                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');
                
                const startLine = selectionStart.line;
                const endLine = selectionEnd.line;
                
                // If selection ends at the start of a line (e.g. standard line selection), don't include that line
                let effectiveEndLine = endLine;
                if (selectionEnd.ch === 0 && selectionEnd.line > selectionStart.line) {
                    effectiveEndLine = endLine - 1;
                }

                // Insert End Marker AFTER the last line
                editor.replaceRange(
                    `\n${endMarker}\n`,
                    { line: effectiveEndLine, ch: editor.getLine(effectiveEndLine).length }
                );
                
                // Insert Start Marker BEFORE the first line
                editor.replaceRange(
                    `${startMarker}\n`,
                    { line: startLine, ch: 0 }
                );

            } else {
                // No selection: wrap current line
                const lineContent = editor.getLine(cursor.line);
                editor.replaceRange(
                    `${startMarker}\n${lineContent}\n${endMarker}\n`,
                    { line: cursor.line, ch: 0 },
                    { line: cursor.line + 1, ch: 0 }
                );
                
                // Restore cursor position relative to the original text
                // The original text is now on the next line (cursor.line + 1)
                editor.setCursor({
                    line: cursor.line + 1,
                    ch: cursor.ch
                });
            }
        }
    }

    toggleInlineHighlight(editor: Editor) {
        const marker = this.settings.inlineMarker;
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fullRegex = new RegExp(`^${escapedMarker}(?:[rgbycm]:)?(.*)${escapedMarker}$`);

        if (editor.somethingSelected()) {
             const selection = editor.getSelection();
             if (selection.match(fullRegex)) {
                 // Unwrap
                 const match = selection.match(fullRegex);
                 if (match) {
                     editor.replaceSelection(match[1] || "");
                 }
            } else {
                // Check if the selection is ALREADY wrapped by markers, but user selected markers too
                // e.g. selected "::text::"
                // The fullRegex check above handles "::text::" or "::r:text::" if selected fully.
                
                // What if user selected "text" inside "::text::"?
                // We should check the surroundings of the selection.
                
                const start = editor.getCursor('from');
                const end = editor.getCursor('to');
                
                const beforeRange = editor.getRange(
                    { line: start.line, ch: Math.max(0, start.ch - marker.length) },
                    start
                );
                const afterRange = editor.getRange(
                    end,
                    { line: end.line, ch: end.ch + marker.length }
                );
                
                if (beforeRange === marker && afterRange === marker) {
                    // It is wrapped! Unwrap it.
                    // Remove end marker first
                    editor.replaceRange('', end, { line: end.line, ch: end.ch + marker.length });
                    editor.replaceRange('', { line: start.line, ch: start.ch - marker.length }, start);
                    
                    // Restore selection? 
                    // The offsets shifted.
                    // Start shifted back by marker.length.
                    // End shifted back by marker.length (because start shifted) AND removed end marker (another marker.length) -> Total 2*marker.length?
                    // Wait.
                    // Start position: we removed `marker` BEFORE start. So new start is start.ch - marker.length.
                    // End position: we removed `marker` AFTER end. AND we removed `marker` BEFORE start (which is before end).
                    // So new end is end.ch - marker.length.
                    
                    editor.setSelection(
                        { line: start.line, ch: start.ch - marker.length },
                        { line: end.line, ch: end.ch - marker.length }
                    );
                    
                    return;
                }

                // Check if multi-line
                
                if (start.line !== end.line) {
                    // Multi-line selection: Wrap segments per line
                    // 1. First line: from start.ch to end of line
                    // 2. Middle lines: full line
                    // 3. Last line: from 0 to end.ch
                    
                    const doc = editor.getDoc();
                    let newText = "";
                    
                    for (let i = start.line; i <= end.line; i++) {
                        const lineText = editor.getLine(i);
                        
                        let segment = "";
                        if (i === start.line) {
                            segment = lineText.substring(start.ch);
                        } else if (i === end.line) {
                            segment = lineText.substring(0, end.ch);
                        } else {
                            segment = lineText;
                        }
                        
                        // Wrap segment if not empty
                        if (segment) {
                            segment = `${marker}${segment}${marker}`;
                        }
                        
                        if (i > start.line) {
                            newText += "\n";
                        }
                        newText += segment;
                    }
                    
                    editor.replaceSelection(newText);
                    
                } else {
                    // Single line
                    editor.replaceSelection(`${marker}${selection}${marker}`);
                    
                    // Restore selection to cover the original text (excluding markers)
                    // Current cursor is at the end of the inserted text
                    const newHead = editor.getCursor('head');
                    const newAnchor = editor.getCursor('anchor');
                    
                    // We want to select "selection"
                    // Start: newHead - marker.length - selection.length
                    // End: newHead - marker.length
                    
                    // Wait, replaceSelection puts cursor at end of replacement usually?
                    // Or it preserves selection direction?
                    // Obsidian API `replaceSelection` usually places cursor at end of inserted text.
                    
                    // Let's calculate manually based on original `start`
                    editor.setSelection(
                        { line: start.line, ch: start.ch + marker.length },
                        { line: end.line, ch: end.ch + marker.length }
                    );
                }
            }
        } else {
            // No selection: Auto-expand to word
            const cursor = editor.getCursor();
            const wordRange = editor.wordAt(cursor);
            if (wordRange) {
                const wordText = editor.getRange(wordRange.from, wordRange.to);
                
                // Check if the word is already wrapped
                // We need to look at the text surrounding the wordRange
                const beforeRange = editor.getRange(
                    { line: wordRange.from.line, ch: Math.max(0, wordRange.from.ch - marker.length) },
                    wordRange.from
                );
                const afterRange = editor.getRange(
                    wordRange.to,
                    { line: wordRange.to.line, ch: wordRange.to.ch + marker.length }
                );
                
                if (beforeRange === marker && afterRange === marker) {
                    // It is wrapped! Unwrap it.
                    // Remove end marker first to keep positions valid
                    editor.replaceRange('', wordRange.to, { line: wordRange.to.line, ch: wordRange.to.ch + marker.length });
                    editor.replaceRange('', { line: wordRange.from.line, ch: wordRange.from.ch - marker.length }, wordRange.from);
                    
                    // Restore cursor position relative to word
                    // Original cursor: cursor.ch
                    // New cursor: cursor.ch - marker.length
                    editor.setCursor({ line: cursor.line, ch: cursor.ch - marker.length });
                } else {
                    // Not wrapped. Wrap it.
                    editor.replaceRange(`${marker}${wordText}${marker}`, wordRange.from, wordRange.to);
                    
                    // Restore cursor position relative to word
                    // Original cursor: cursor.ch
                    // New cursor: cursor.ch + marker.length
                    editor.setCursor({ line: cursor.line, ch: cursor.ch + marker.length });
                }
            } else {
                 // No word found? Just insert empty markers?
                 // Standard behavior: insert empty markers
                 editor.replaceSelection(`${marker}${marker}`);
                 // Move cursor inside
                 const newCursor = editor.getCursor();
                 editor.setCursor({ line: newCursor.line, ch: newCursor.ch - marker.length });
            }
        }
    }

    processPreviewMode(element: HTMLElement, context: MarkdownPostProcessorContext) {
        // 1. Inline Highlight
        if (this.settings.enableInlineHighlight) {
            processInlineHighlight(element, this.settings);
        }

        // 2. Block Tint (Reading View)
        if (this.settings.enableBlockTint) {
            processBlockTint(element, this.settings);
        }
        
        // 3. Table Cell Tinting (Reading View)
        if (this.settings.enableTableTint) {
            processTableTinting(element, this.settings);
        }
    }

    onunload() {
        cleanupBlockTintObservers();
    }
}
