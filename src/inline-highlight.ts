
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { MyPluginSettings } from './settings';

// Interface to avoid circular dependency
interface IPlugin {
    settings: MyPluginSettings;
}

// ============================================================
// 2. 行内高亮 (Inline)
// ============================================================

export function createInlineHighlighter(plugin: IPlugin) {
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
            if (plugin && !plugin.settings.enableInlineHighlight) return builder.finish();

            const { state } = view;
            const doc = state.doc;
            const selection = state.selection.main;
            
            // Check view mode
            const isLivePreview = view.dom.closest('.is-live-preview');
            
            // Marker configuration
            const marker = plugin ? plugin.settings.inlineMarker : '::';
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Regex: ::(?:([rgbycm]):)?(.*?)::
            const regex = new RegExp(`${escapedMarker}(?:([rgbycm]):)?(.*?)${escapedMarker}`, 'g');
            
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
                    const node = tree.resolveInner(matchStart + 1, -1);
                    const nodeName = node.type.name;
                    if (nodeName.includes("code") || nodeName.includes("Code") || nodeName.includes("math")) {
                        continue;
                    }
                    
                    const colorCode = match[1]; // r, g, b, y, c, m or undefined
                    const content = match[2] || "";
                    
                    // Determine Color Class
                    let colorClass = 'tinted-inline-yellow'; // default
                    if (colorCode === 'r') colorClass = 'tinted-inline-red';
                    if (colorCode === 'g') colorClass = 'tinted-inline-green';
                    if (colorCode === 'b') colorClass = 'tinted-inline-blue';
                    if (colorCode === 'y') colorClass = 'tinted-inline-yellow';
                    if (colorCode === 'c') colorClass = 'tinted-inline-cyan';
                    if (colorCode === 'm') colorClass = 'tinted-inline-magenta';
                    
                    // Check cursor position
                    const isCursorInside = selection.head >= matchStart && selection.head <= matchEnd;
                    
                    // Calculate sub-ranges
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
                    
                    // If Source Mode (not Live Preview), we ALWAYS show markers (no auto-hide).
                    // If Live Preview, we show markers only if cursor is inside.
                    const showMarkers = !isLivePreview || isCursorInside;

                    if (showMarkers) {
                        // 1. Start Marker (Visible)
                        builder.add(startMarkerFrom, startMarkerTo, Decoration.mark({ 
                            class: `tinted-inline-marker tinted-inline-visible tinted-inline-start ${colorClass}` 
                        }));
                        
                        // 2. Content (Normal + Background)
                        builder.add(contentFrom, contentTo, Decoration.mark({ 
                            class: `tinted-inline-content ${colorClass}` 
                        }));
                        
                        // 3. End Marker (Visible)
                        builder.add(endMarkerFrom, endMarkerTo, Decoration.mark({ 
                            class: `tinted-inline-marker tinted-inline-visible tinted-inline-end ${colorClass}` 
                        }));
                        
                    } else {
                        // Cursor outside (Live Preview only): Hide markers, show content
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

export function processInlineHighlight(element: HTMLElement, settings: MyPluginSettings) {
    const marker = settings.inlineMarker; // "::"
    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Regex: ::(?:([rgbycm]):)?(.*?)::
    const regex = new RegExp(`${escapedMarker}(?:([rgbycm]):)?(.*?)${escapedMarker}`, 'g');

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
             const matches: RegExpMatchArray[] = [];
             let match;
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
             if (colorCode === 'c') colorClass = 'tinted-inline-cyan';
             if (colorCode === 'm') colorClass = 'tinted-inline-magenta';
             
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
