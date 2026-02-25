# Tinted Blocks 🎨

> Add a splash of color to your Obsidian notes. Highlight blocks of text elegantly, just like in Notion or Craft, but with more power.

**Tinted Blocks** allows you to wrap any content—paragraphs, lists, blockquotes—in a beautiful, colored container. It supports both **Live Preview** and **Reading View**, ensuring your notes look stunning in any mode.

## ✨ Features

- **Dynamic Coloring**: Use any valid CSS color name (`blue`, `red`, `gold`) or hex code (`#ff00aa`).
- **Clean Reading View**: Block markers (`::>`) are completely removed in Reading View, leaving only your beautifully styled content.
- **Rich Content Support**: Works perfectly with **bullet lists**, **numbered lists**, and **blockquotes** inside the colored block.
- **Inline Highlighting**: Highlight specific words or phrases within a line.
- **Native Integration**: Use the **Command Palette**, **Right-Click Menu**, or customize **Hotkeys**.

---

## 🚀 How to Use

### Method 1: The "Hacker" Way (Typing)
Simply type the start marker followed immediately by a color, write your content, and close with the end marker.

```markdown
::>blue
This is a blue block.
It supports **Markdown** formatting.
<::
```

**Strict Syntax Rules:**
- **No Space**: You must type the color immediately after the marker (e.g., `::>red`, NOT `::> red`).
- **Valid CSS Colors**: Use standard CSS colors or hex codes.
- **Fallback**: If you add a space (`::> red`), use an invalid color (`::>bg-red`), or omit the color (`::>`), the block will use your **Default Block Color** setting.

Examples:
- `::>blue` -> Blue background
- `::>#ff0000` -> Red background
- `::> blue` -> **Default Color** (Space is not allowed)
- `::>bg-blue` -> **Default Color** (Invalid CSS color name)

### Method 2: The "Mouse" Way (Context Menu)
1. Select any text in your editor.
2. **Right-click** on the selection.
3. Choose **Toggle block highlight**.
4. A default block (using your default color setting) will wrap your selection instantly.

### Method 3: The "Pro" Way (Hotkeys)
Speed up your workflow by assigning a custom hotkey!

1. Open Obsidian **Settings** -> **Hotkeys**.
2. Search for `Tinted Blocks: Toggle block highlight`.
3. Assign your favorite shortcut (e.g., `Cmd+Shift+H` or `Ctrl+Shift+H`).
4. Now, just select text and hit your hotkey to toggle highlighting on/off.

---

## ⚙️ Customization

Go to **Settings** -> **Tinted Blocks** to configure:
- **Block Start Marker**: Default is `::>`.
- **Block End Marker**: Default is `<::`.
- **Default Block Color**: Choose the color used when no specific color is provided (defaults to `#555555`).
- **Inline Marker**: Default is `::` (for inline highlights like `::text::`).

---

## 🛠️ Development

This plugin was built with TypeScript and uses the Obsidian API.

### Prerequisite
- Node.js (v18+)
- npm

### Setup
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start compilation in watch mode.

### Building
Run `npm run build` to create a production build (`main.js`, `styles.css`, `manifest.json`).

---

<p align="center">
  Made with ❤️ for the Obsidian Community.
</p>
