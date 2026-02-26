
import { Decoration } from '@codemirror/view';
import { MyPluginSettings } from './settings';

export function normalizeColor(raw: string, settings: MyPluginSettings): string {
    // 1. If empty -> Default
    if (!raw) {
        return settings.defaultColor;
    }

    // 2. If starts with space -> Default (Invalid syntax)
    if (raw.startsWith(' ')) {
        return settings.defaultColor;
    }
    
    // 3. If contains space -> Default (Invalid syntax)
    if (raw.includes(' ')) {
         return settings.defaultColor;
    }

    // 4. Strictest Check: Assign to style.color and see if it sticks
    const s = new Option().style;
    s.color = raw;
    // If s.color is empty string, it means the browser rejected it.
    if (s.color === '') {
         return settings.defaultColor;
    }

    return raw;
}

export function removeTextFromStart(element: HTMLElement, textToRemove: string) {
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
    removeLeadingBR(element);
     
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

export function removeTextFromEnd(element: HTMLElement, textToRemove: string) {
    // Safety Check: Verify the text actually ends with the marker
    const currentText = element.textContent || "";
    
    // If the element text doesn't end with the marker (ignoring trailing whitespace), return.
    // We trim the comparison to be robust against trailing newlines/spaces in DOM vs Marker.
    if (!currentText.trimEnd().endsWith(textToRemove.trimEnd())) {
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

export function removeLeadingBR(element: Node): boolean {
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
                el.remove();
                return true; // Done
            }
            // Recurse into other elements (like p, span, strong)
            if (removeLeadingBR(el)) {
                return true;
            }
        }
    }
    return false;
}
