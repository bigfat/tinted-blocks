
import { setIcon } from 'obsidian';
import { RangeSetBuilder, StateField, EditorState } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TintedBlocksSettings } from './settings';
import { normalizeColor, removeTextFromStart, removeTextFromEnd } from './utils';

// Interface to avoid circular dependency
interface IPlugin {
    settings: TintedBlocksSettings;
}

// ============================================================
// 1. Live Preview - Block Tinting
// ============================================================

const bgDecoration = (color: string, type: 'start' | 'mid' | 'end', active: boolean) => {
    const classes = ['tinted-block'];
    if (type === 'start') classes.push('tinted-block-start');
    if (type === 'end') classes.push('tinted-block-end');
    if (active) classes.push('tinted-block-active');
    
    const style = `--tint-color: ${color}`;
    
    return Decoration.line({
        attributes: { 
            class: classes.join(' '),
            style: style
        }
    });
};

function buildBlockDecorations(state: EditorState, plugin: IPlugin): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc;
    const selection = state.selection.main;
    
    if (!plugin || !plugin.settings.enableBlockTint) return builder.finish();

    const startMarker = plugin.settings.blockStartMarker;
    const endMarker = plugin.settings.blockEndMarker;
    
    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const startRegex = new RegExp(`^${escapeRegExp(startMarker)}(.*)$`);
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
            currentColor = normalizeColor(startMatch[1] || "", plugin.settings);
        } else if (endMatch && currentStart !== -1) {
            blocks.push({ start: currentStart, end: i, color: currentColor });
            currentStart = -1;
            currentColor = "";
        }
    }

    const lineActions = new Map<number, {type: 'start'|'mid'|'end', color: string, active: boolean}>();
    
    for (const block of blocks) {
        const startLineObj = doc.line(block.start);
        const endLineObj = doc.line(block.end);
        
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

export const createBlockTinter = (plugin: IPlugin) => [
    StateField.define<DecorationSet>({
        create(state) { return buildBlockDecorations(state, plugin); },
        update(oldDecos, tr) {
            if (tr.docChanged || tr.selection) return buildBlockDecorations(tr.state, plugin);
            return oldDecos;
        },
        provide: field => EditorView.decorations.from(field)
    }),
    // ViewPlugin to handle edge cases like Horizontal Rules where StateField decorations might be overridden
    ViewPlugin.fromClass(class {
        constructor(view: EditorView) {
            this.patchDOM(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.patchDOM(update.view);
            }
        }

        patchDOM(view: EditorView) {
            if (!plugin || !plugin.settings.enableBlockTint) return;
            
            // Re-calculate blocks from state (cheap enough)
            const doc = view.state.doc;
            const startMarker = plugin.settings.blockStartMarker;
            const endMarker = plugin.settings.blockEndMarker;
            const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const startRegex = new RegExp(`^${escapeRegExp(startMarker)}(.*)$`);
            const endRegex = new RegExp(`^${escapeRegExp(endMarker)}\\s*$`);

            const blocks: {start: number, end: number, color: string}[] = [];
            let currentStart = -1;
            let currentColor = "";

            // Identify blocks in the document
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const startMatch = line.text.match(startRegex);
                const endMatch = line.text.match(endRegex);

                if (startMatch) {
                    currentStart = i;
                    currentColor = normalizeColor(startMatch[1] || "", plugin.settings);
                } else if (endMatch && currentStart !== -1) {
                    blocks.push({ start: currentStart, end: i, color: currentColor });
                    currentStart = -1;
                    currentColor = "";
                }
            }
            
            // Map blocks to line numbers
            const lineColors = new Map<number, string>();
            for (const block of blocks) {
                // We only care about "mid" lines for HR patching, but let's map all
                for (let k = block.start; k <= block.end; k++) {
                    lineColors.set(k, block.color);
                }
            }

            // Iterate visible DOM elements
            // We use requestAnimationFrame to ensure we run AFTER Obsidian's updates
            requestAnimationFrame(() => {
                const lines = view.contentDOM.querySelectorAll('.cm-line');
                lines.forEach((lineEl: HTMLElement) => {
                    // Get line number for this DOM element
                    // posAtDOM returns the position in the document
                    try {
                        const pos = view.posAtDOM(lineEl);
                        const lineObj = view.state.doc.lineAt(pos);
                        const lineNumber = lineObj.number;
                        
                        const color = lineColors.get(lineNumber);
                        
                        if (color) {
                            // This line SHOULD be tinted
                            if (!lineEl.classList.contains('tinted-block')) {
                                lineEl.classList.add('tinted-block');
                                lineEl.style.setProperty('--tint-color', color);
                            }
                            // Ensure style is correct even if class exists
                            if (lineEl.style.getPropertyValue('--tint-color') !== color) {
                                lineEl.style.setProperty('--tint-color', color);
                            }
                        } else {
                            // Should NOT be tinted
                             if (lineEl.classList.contains('tinted-block')) {
                                lineEl.classList.remove('tinted-block');
                                lineEl.style.removeProperty('--tint-color');
                            }
                        }
                    } catch {
                        // Ignore errors if DOM pos is invalid (e.g. detached)
                    }
                });
            });
        }
    })
];


// ============================================================
// Reading View Logic
// ============================================================

// Use MutationObserver instead of timeout for reliable detection
const activeObservers = new Map<HTMLElement, MutationObserver>();

function queueWrapping(element: HTMLElement, settings: TintedBlocksSettings) {
    if (!element.parentElement) {
        // Wait for attachment
        let attempts = 0;
        const checkParent = () => {
            if (element.parentElement) {
                setupObserver(element.parentElement!, settings);
            } else if (attempts < 10) {
                attempts++;
                window.setTimeout(checkParent, 20);
            }
        };
        checkParent();
    } else {
        setupObserver(element.parentElement, settings);
    }
}

function setupObserver(container: HTMLElement, settings: TintedBlocksSettings) {
    if (activeObservers.has(container)) return;

    // Debounce the actual processing
    let timeout: number | null = null;
    
    const process = () => {
        wrapMarkedBlocks(container, settings);
    };

    const observer = new MutationObserver(() => {
        // Disconnect immediately to prevent loops
        observer.disconnect();
        
        if (timeout) window.clearTimeout(timeout);
        timeout = window.setTimeout(process, 100);
    });

    observer.observe(container, { childList: true });
    activeObservers.set(container, observer);
    
    // Also trigger once initially in case everything is already there
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(process, 100);
}

function wrapMarkedBlocks(container: HTMLElement, settings: TintedBlocksSettings) {
    const observer = activeObservers.get(container);
    if (observer) observer.disconnect();

    try {
        const children = Array.from(container.children) as HTMLElement[];
        
        // CLEANUP STEP: Remove all existing styling classes from this container's children.
        children.forEach(child => {
            child.classList.remove('tinted-block-item', 'tinted-block-item-start', 'tinted-block-item-end');
            child.classList.remove('tinted-block-clamped', 'tinted-block-hidden', 'tinted-block-collapsed-bottom');
            child.style.removeProperty('--tint-color');
            // Remove indicator if present to ensure we re-bind with correct elements
            const indicator = child.querySelector('.tinted-block-collapse-indicator');
            if (indicator) indicator.remove();
        });
        
        const startMarker = settings.blockStartMarker;
        const endMarker = settings.blockEndMarker;
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
                    color = normalizeColor(match[1] || "", settings);
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
                startEl = child;
                currentColor = color;
                startMarkerText = currentStartMarker;
                elementsToWrap = [child];
                
                if (isEnd) {
                    performWrap(container, elementsToWrap, currentColor, startMarkerText, currentEndMarker);
                    startEl = null;
                    elementsToWrap = [];
                }
                continue;
            }

            if (startEl) {
                elementsToWrap.push(child);
                
                if (isEnd) {
                    performWrap(container, elementsToWrap, currentColor, startMarkerText, currentEndMarker);
                    startEl = null;
                    elementsToWrap = [];
                }
            }
        }
    } finally {
        if (observer) {
            observer.observe(container, { childList: true });
        }
    }
}

function performWrap(_container: HTMLElement, elements: HTMLElement[], color: string, startMarker: string, endMarker: string) {
    if (elements.length === 0) return;
    
    elements.forEach((el, index) => {
        el.addClass("tinted-block-item");
        el.style.setProperty("--tint-color", color);
        
        if (index === 0) {
            el.addClass("tinted-block-item-start");
            
            // Add Collapse Indicator
            // Check if it already exists to avoid duplicates
            if (!el.querySelector('.tinted-block-collapse-indicator')) {
                const indicator = el.createEl('div', { cls: 'tinted-block-collapse-indicator' });
                
                // Check if already collapsed (state persistence in DOM)
                const isCollapsed = el.hasClass('is-collapsed');
                setIcon(indicator, isCollapsed ? 'chevron-right' : 'chevron-down');
                
                if (isCollapsed) {
                    // When collapsed:
                    // Show first content line (index 1) and start marker line (index 0)
                    // Hide everything else.
                    let lastVisibleIndex = 0;
                    
                    elements.forEach((sibling, i) => {
                        if (i === 0) {
                             // Start marker line - always visible
                             sibling.removeClass('tinted-block-hidden');
                             lastVisibleIndex = i;
                        } else if (i === 1 && i < elements.length - 1) {
                            // Keep content line 1 visible (but not the end marker)
                            sibling.removeClass('tinted-block-hidden');
                            sibling.addClass('tinted-block-clamped');
                            
                            lastVisibleIndex = i;
                        } else {
                            // Others - hide
                            sibling.addClass('tinted-block-hidden');
                        }
                    });
                    
                    // Apply bottom radius to the last visible element
                    const lastEl = elements[lastVisibleIndex];
                    if (lastEl) {
                        lastEl.addClass('tinted-block-collapsed-bottom');
                    }
                }
                
                indicator.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault(); // Stop selection/focus changes
                    const isCollapsed = el.hasClass('is-collapsed');
                    
                    if (isCollapsed) {
                        // Expand
                        el.removeClass('is-collapsed');
                        setIcon(indicator, 'chevron-down');
                        
                        // Handle Single Element Wrapper Unwrapping
                        if (elements.length === 1) {
                             const wrapper = el.querySelector('.tinted-content-wrapper') as HTMLElement;
                             if (wrapper) {
                                 wrapper.removeClass('is-clamped');
                             }
                             // Reset parent styles
                             el.removeClass('tinted-block-collapsed-bottom');
                        }
                        
                        // Show all siblings
                        elements.forEach((sibling) => {
                             sibling.removeClass('tinted-block-hidden');
                             sibling.removeClass('tinted-block-collapsed-bottom');
                             sibling.removeClass('tinted-block-clamped');
                        });
                    } else {
                        // Collapse
                        el.addClass('is-collapsed');
                        setIcon(indicator, 'chevron-right');
                        
                        // If it's a single element block, we must clamp it using CSS/inline styles
                        if (elements.length === 1) {
                             // Check for existing wrapper
                             let wrapper = el.querySelector('.tinted-content-wrapper') as HTMLElement;
                             
                             if (!wrapper) {
                                 // Create wrapper and move content
                                 wrapper = el.createEl('div', { cls: 'tinted-content-wrapper' });
                                 
                                 // Move all children except indicator to wrapper
                                 const nodesToMove: Node[] = [];
                                 for (let i = 0; i < el.childNodes.length; i++) {
                                     const node = el.childNodes[i];
                                     if (node && node !== indicator && node !== wrapper) {
                                         nodesToMove.push(node);
                                     }
                                 }
                                 
                                 nodesToMove.forEach(node => wrapper.appendChild(node));
                                 // wrapper is automatically appended to el by createEl
                             }
                             
                             // Style wrapper for clamping
                             wrapper.addClass('is-clamped');
                             
                             // Style parent
                             el.addClass('tinted-block-collapsed-bottom');
                        } else {
                            // Multi-element block
                            // Hide siblings, but keep first content line visible
                            let lastVisibleIndex = 0;
                            elements.forEach((sibling, i) => {
                                if (i === 0) {
                                    // Start marker line - always visible
                                    sibling.removeClass('tinted-block-hidden');
                                    lastVisibleIndex = i;
                                } else if (i === 1 && i < elements.length - 1) {
                                    // Keep content line 1 visible (but not the end marker)
                                    sibling.removeClass('tinted-block-hidden');
                                    sibling.addClass('tinted-block-clamped');
                                    
                                    lastVisibleIndex = i;
                                } else {
                                    // Others - hide
                                    sibling.addClass('tinted-block-hidden');
                                }
                            });
                            
                            // Apply bottom radius to the last visible element
                            const lastEl = elements[lastVisibleIndex];
                            if (lastEl) {
                                lastEl.addClass('tinted-block-collapsed-bottom');
                            }
                        }
                    }
                };
            }
        }
        if (index === elements.length - 1) {
            el.addClass("tinted-block-item-end");
        }
    });

    // Clean text
    const firstEl = elements[0];
    if (elements.length > 0 && startMarker && firstEl) {
         removeTextFromStart(firstEl, startMarker);
    }
    const lastEl = elements[elements.length-1];
    if (elements.length > 0 && endMarker && lastEl) {
         removeTextFromEnd(lastEl, endMarker);
    }
}

export function processBlockTint(element: HTMLElement, settings: TintedBlocksSettings) {
    const startMarker = settings.blockStartMarker;
    const endMarker = settings.blockEndMarker;
    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const startRegex = new RegExp(`^\\s*${escapeRegExp(startMarker)}(.*)`); 
    const endRegex = new RegExp(`${escapeRegExp(endMarker)}\\s*$`); 
    
    let children = Array.from(element.children) as HTMLElement[];
    if (children.length === 0) children = [element];

    let hasWork = false;

    for (const child of children) {
        const text = child.textContent || "";
        
        // Check Start
        const startMatch = text.match(startRegex);
        if (startMatch) {
            element.dataset.tintedStart = "true";
            element.dataset.tintedStartMarker = startMatch[0]; 
            const rawColor = startMatch[1] || "";
            element.dataset.tintedColor = normalizeColor(rawColor, settings);
            hasWork = true;
        }

        // Check End
        const endMatch = text.match(endRegex);
        if (endMatch) {
            element.dataset.tintedEnd = "true";
            element.dataset.tintedEndMarker = endMatch[0];
            hasWork = true;
        }
    }

    if (hasWork) {
        queueWrapping(element, settings);
    }
}

export function cleanupBlockTintObservers() {
    for (const observer of activeObservers.values()) {
        observer.disconnect();
    }
    activeObservers.clear();
}
