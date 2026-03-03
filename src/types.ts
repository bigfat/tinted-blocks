
import { App } from 'obsidian';

/**
 * Extended App interface to include internal APIs.
 * Note: These are not part of the public API and may change.
 */
export interface InternalApp extends App {
    setting: {
        openTabById: (id: string) => void;
    };
}

/**
 * Extended Editor interface to include CodeMirror instance.
 * Note: This accesses the internal CM5/CM6 instance.
 */
export interface EditorWithCM {
    cm?: {
        dispatch: (tr: Record<string, unknown>) => void;
    };
}
