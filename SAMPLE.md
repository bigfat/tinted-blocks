# Tinted Blocks - Feature Gallery

This note demonstrates the various styling capabilities of the **Tinted Blocks** plugin.

## 1. Block Highlighting

You can wrap content in colored blocks using the syntax `::>color` and `<::`.

### Basic Colors

::>blue
**Blue Block**
This block uses the standard CSS color `blue`.
It's great for informational notes or calm sections.
<::

::>red
**Red Block**
This block uses `red`.
Perfect for warnings, errors, or important notices.
<::

::>green
**Green Block**
This block uses `green`.
Use this for success messages, tips, or positive outcomes.
<::

::>gold
**Gold Block**
This uses the CSS color `gold`.
Excellent for highlighting key takeaways or premium content.
<::

### Rich Content Support

Blocks can contain more than just text.

::>#663399
**Complex Block (Purple)**

- [x] Task list item 1
- [ ] Task list item 2
- Bullet point A
- Bullet point B

> "This is a blockquote inside a tinted block. It inherits the styling seamlessly."

1. Numbered list
2. Another item
<::

### Edge Cases

::>
**Default Color Block**
If you don't specify a color (or use an invalid one), it falls back to your default setting (e.g., Grey).
<::

---

## 2. Inline Highlighting

Highlight text within a line using neon-style markers.

- **Default (Yellow)**: This is ::highlighted text:: using the default style.
- **Red**: This is ::r:red highlight:: for emphasis.
- **Green**: This is ::g:green highlight:: for success.
- **Blue**: This is ::b:blue highlight:: for cool notes.
- **Yellow**: This is ::y:yellow highlight:: explicit yellow.

### Mixed Usage

You can mix inline highlights inside tinted blocks!

::>#2c3e50
**Dark Block with Highlights**

Here is some text with a ::g:green highlight:: inside a dark block.
And here is a ::r:red warning::.
<::
