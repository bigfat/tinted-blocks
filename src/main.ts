
import { Plugin, MarkdownPostProcessorContext, Editor, Menu, MarkdownView } from 'obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS, TintedBlocksSettingTab } from './settings';
import { createBlockTinter, processBlockTint, cleanupBlockTintObservers } from './block-tint';
import { createInlineHighlighter, processInlineHighlight } from './inline-highlight';
import { createTableTintPlugin, createTableMarkerHighlighter, processTableTinting } from './table-tint';

export default class MyBlockPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Register extensions
        this.registerEditorExtension([
            createBlockTinter(this), 
            createInlineHighlighter(this), 
            createTableTintPlugin(this), 
            createTableMarkerHighlighter(this)
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
        
        const fullRegex = new RegExp(`^${escapedMarker}(?:[rgbycm]:)?(.*)${escapedMarker}$`);
        
        if (selection.match(fullRegex)) {
             // Unwrap
             const match = selection.match(fullRegex);
             if (match) {
                 editor.replaceSelection(match[1] || "");
             }
        } else {
            // Wrap
            editor.replaceSelection(`${marker}${selection}${marker}`);
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
