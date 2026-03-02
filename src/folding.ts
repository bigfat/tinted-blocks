
import { foldService } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { TintedBlocksSettings } from "./settings";

export const createBlockFoldService = (settings: TintedBlocksSettings) => foldService.of((state: EditorState, lineStart: number, _lineEnd: number) => {
    const startMarker = settings.blockStartMarker;
    const endMarker = settings.blockEndMarker;
    
    const line = state.doc.lineAt(lineStart);
    
    // STRATEGY CHANGE:
    // Instead of registering the fold on the Start Marker Line (index 0),
    // we register it on the First Content Line (index 1).
    // This places the fold arrow on the content line naturally, avoiding "ghost" arrows on the header.
    
    // Check if the PREVIOUS line was a start marker
    if (line.number <= 1) return null;
    
    const prevLine = state.doc.line(line.number - 1);
    const prevText = prevLine.text.trim();
    
    if (!prevText.startsWith(startMarker)) {
        return null;
    }
    
    // Okay, we are on the first content line (Line 2 relative to block start).
    // Now scan forward for the end marker.
    
    let depth = 1;
    const maxScanDistance = 5000;
    
    for (let i = line.number; i <= Math.min(state.doc.lines, line.number + maxScanDistance); i++) {
        const nextLine = state.doc.line(i);
        const nextText = nextLine.text.trim();
        
        if (nextText.startsWith(startMarker)) {
            depth++;
        } else if (nextText.startsWith(endMarker)) {
            depth--;
            if (depth === 0) {
                // Found the matching end
                // We want to fold from the END of the current line (first content line)
                // to the END of the closing line (to hide everything in between).
                
                // If the block is empty (end marker is this line), don't fold.
                if (i === line.number) return null;

                return { from: line.to, to: nextLine.to };
            }
        }
    }
    
    return null;
});
