
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { MyPluginSettings } from './settings';

// Interface to avoid circular dependency
interface IPlugin {
    settings: MyPluginSettings;
}

// ============================================================
// 4. 编辑模式 (Live Preview) - Table Cell Tinting
// ============================================================

export function createTableTintPlugin(plugin: IPlugin) {
    return ViewPlugin.fromClass(class {
        tintedCells: Set<HTMLElement> = new Set();
        
        constructor(view: EditorView) {
            this.processTables(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.processTables(update.view);
            }
        }
        
        processTables(view: EditorView) {
             if (!plugin || !plugin.settings.enableTableTint) return;

             // Use requestAnimationFrame to scan DOM after update
             requestAnimationFrame(() => {
                 const tables = view.contentDOM.querySelectorAll('table');
                 
                 // Check cursor position for visibility logic
                 const selection = window.getSelection();
                 let activeCell: HTMLElement | null = null;
                 if (selection && selection.anchorNode) {
                      const node = selection.anchorNode;
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          activeCell = (node as HTMLElement).closest('td, th');
                      } else if (node.parentElement) {
                          activeCell = node.parentElement.closest('td, th');
                      }
                  }

                 tables.forEach(table => {
                     const rows = table.querySelectorAll('tr');
                     rows.forEach(row => {
                         const cells = row.querySelectorAll('td, th');
                         cells.forEach(cell => {
                             const text = cell.textContent || "";
                             const match = text.match(/^(\s*)(:[rgbcyma]:)/);
                             
                             if (match && match[2]) {
                                  const colorCode = match[2].charAt(1);
                                  this.applyTint(cell as HTMLElement, colorCode);
                                  
                                  // Handle Marker Hiding/Showing
                                  this.handleMarkerWrapper(cell as HTMLElement, match[0], match[1] || "", match[2], activeCell === cell);
                              } else {
                                 // No marker found, clear tint
                                 this.clearTint(cell as HTMLElement);
                                 // Remove wrapper if exists
                                 this.unwrapMarker(cell as HTMLElement);
                             }
                         });
                     });
                 });
             });
        }
        
        handleMarkerWrapper(cell: HTMLElement, fullMatch: string, whitespace: string, marker: string, isActive: boolean) {
            // Check if wrapper exists
            let wrapper = cell.querySelector('.tinted-cell-marker-wrapper') as HTMLElement;
            
            if (!wrapper) {
                // Create wrapper
                // We need to find the text node containing the marker
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
                let node = walker.nextNode();
                let foundNode: Node | null = null;
                
                // Find the node that starts with the marker (ignoring whitespace)
                // match[0] is e.g. " :r:"
                // The text node might contain " :r: content"
                while (node) {
                    // Check if node is inside a CodeMirror line (source text)
                    // We only want to process preview/widget content, not editable source text
                    // which should be handled by Decorations.
                    const parent = node.parentElement;
                    if (parent && parent.closest('.cm-line')) {
                         node = walker.nextNode();
                         continue;
                    }

                    if (node.textContent && node.textContent.includes(marker)) {
                         foundNode = node;
                         break;
                    }
                    node = walker.nextNode();
                }
                
                if (foundNode) {
                    const text = foundNode.textContent || "";
                    const markerIndex = text.indexOf(marker);
                    
                    if (markerIndex >= 0) {
                        // Split text node
                        // Before: "  :r: content"
                        // After: "  " + <span class="wrapper">:r:</span> + " content"
                        
                        const beforeText = text.substring(0, markerIndex);
                        const afterText = text.substring(markerIndex + marker.length);
                        
                        const newWrapper = document.createElement('span');
                        newWrapper.className = 'tinted-cell-marker-wrapper tinted-inline-marker tinted-cell-marker-visible'; // Add visible class by default
                        newWrapper.textContent = marker;
                        
                        const parent = foundNode.parentNode;
                        if (parent) {
                            if (beforeText) parent.insertBefore(document.createTextNode(beforeText), foundNode);
                            parent.insertBefore(newWrapper, foundNode);
                            if (afterText) parent.insertBefore(document.createTextNode(afterText), foundNode);
                            
                            parent.removeChild(foundNode);
                            wrapper = newWrapper;
                        }
                    }
                }
            }
            
            // Update visibility class
            if (wrapper) {
                // If active (cursor in cell), show it (faint, small)
                // If inactive, hide it (width 0)
                
                const visibleClass = 'tinted-cell-marker-visible';
                const hiddenClass = 'tinted-cell-marker-hidden'; // We need to define this in CSS
                
                // Also ensure we don't trigger unnecessary DOM mutations
                if (isActive) {
                    if (!wrapper.classList.contains(visibleClass)) {
                        wrapper.classList.remove(hiddenClass);
                        wrapper.classList.add(visibleClass);
                    }
                } else {
                    if (!wrapper.classList.contains(hiddenClass)) {
                        wrapper.classList.remove(visibleClass);
                        wrapper.classList.add(hiddenClass);
                    }
                }
            }
        }
        
        unwrapMarker(cell: HTMLElement) {
            const wrapper = cell.querySelector('.tinted-cell-marker-wrapper');
            if (wrapper) {
                const parent = wrapper.parentNode;
                if (parent) {
                    const text = wrapper.textContent || "";
                    const textNode = document.createTextNode(text);
                    parent.replaceChild(textNode, wrapper);
                    parent.normalize(); // Merge adjacent text nodes
                }
            }
        }
        
        applyTint(cell: HTMLElement, colorCode: string) {
            let colorClass = 'tinted-cell-gray';
            if (colorCode === 'r') colorClass = 'tinted-cell-red';
            if (colorCode === 'g') colorClass = 'tinted-cell-green';
            if (colorCode === 'b') colorClass = 'tinted-cell-blue';
            if (colorCode === 'y') colorClass = 'tinted-cell-yellow';
            if (colorCode === 'c') colorClass = 'tinted-cell-cyan';
            if (colorCode === 'm') colorClass = 'tinted-cell-magenta';
            if (colorCode === 'a') colorClass = 'tinted-cell-gray';
            
            // Optimization: check if already has class
            if (cell.classList.contains(colorClass)) return;
            
            this.clearTint(cell);
            cell.classList.add(colorClass);
        }
        
        clearTint(cell: HTMLElement) {
             const classes = ['tinted-cell-red', 'tinted-cell-green', 'tinted-cell-blue', 
                 'tinted-cell-yellow', 'tinted-cell-cyan', 'tinted-cell-magenta', 'tinted-cell-gray'];
             cell.classList.remove(...classes);
        }
    });
}

export function createTableMarkerHighlighter(plugin: IPlugin) {
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
            if (plugin && !plugin.settings.enableTableTint) return builder.finish();

            // Check view mode
            const isLivePreview = view.dom.closest('.is-live-preview');

            const { state } = view;
            const doc = state.doc;
            const selection = state.selection.main;
            
            // Scan visible ranges
            for (const { from, to } of view.visibleRanges) {
                const rangeText = doc.sliceString(from, to);
                
                // Regex: Match :r: at start of line OR after a pipe
                // Support both standard tables (| :r:) and nested editor content (:r:)
                const regex = /(?:^|\|)(\s*)(:[rgbcyma]:)/g;
                
                let match;
                while ((match = regex.exec(rangeText)) !== null) {
                    const matchStartInString = match.index;
                    const fullMatchStr = match[0];
                    
                    let offset = 0;
                    if (fullMatchStr.startsWith('|')) {
                        offset = 1; 
                    }
                    
                    const markerStart = from + matchStartInString + offset + (match[1] ? match[1].length : 0);
                    const markerEnd = markerStart + (match[2] ? match[2].length : 0);
                    
                    const isCursorInside = selection.head >= markerStart && selection.head <= markerEnd;
                    
                    if (!isLivePreview) {
                        // Source Mode -> Show Faint
                        builder.add(markerStart, markerEnd, Decoration.mark({
                            class: 'tinted-cell-marker-visible' 
                        }));
                    } else if (isCursorInside) {
                         // Live Preview + Active -> Show Faint (Small)
                         builder.add(markerStart, markerEnd, Decoration.mark({
                            class: 'tinted-cell-marker-visible' 
                        }));
                    } else {
                         // Live Preview + Inactive -> Hide
                         builder.add(markerStart, markerEnd, Decoration.replace({}));
                    }
                }
            }
            return builder.finish();
        }
    }, { decorations: v => v.decorations });
}

export function processTableTinting(element: HTMLElement, settings: MyPluginSettings) {
    // Find all tables in the element
    const tables = element.querySelectorAll('table');
    tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            cells.forEach(cell => {
                const text = cell.textContent || "";
                // Regex: Look for :([rgbcyma]): at the START of the cell content.
                const match = text.match(/^\s*:([rgbcyma]):/);
                
                if (match) {
                    const colorCode = match[1];
                    
                    // Determine class
                    let colorClass = 'tinted-cell-gray'; // default/auto
                    if (colorCode === 'r') colorClass = 'tinted-cell-red';
                    if (colorCode === 'g') colorClass = 'tinted-cell-green';
                    if (colorCode === 'b') colorClass = 'tinted-cell-blue';
                    if (colorCode === 'y') colorClass = 'tinted-cell-yellow';
                    if (colorCode === 'c') colorClass = 'tinted-cell-cyan';
                    if (colorCode === 'm') colorClass = 'tinted-cell-magenta';
                    if (colorCode === 'a') colorClass = 'tinted-cell-gray';

                    // Apply class to cell (TD/TH)
                    cell.addClass(colorClass);
                    
                    // Remove the marker from the text content
                    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
                    const node = walker.nextNode();
                    if (node && node.textContent) {
                        const nodeText = node.textContent;
                        const nodeMatch = nodeText.match(/^\s*:([rgbcyma]):/);
                        if (nodeMatch) {
                            node.textContent = nodeText.substring(nodeMatch[0].length);
                        }
                    }
                }
            });
        });
    });
}
