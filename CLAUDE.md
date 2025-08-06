# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue.js 2.0 markdown editor with contenteditable support. This project provides a rich markdown editing experience using Vue 2.7.14 with Vite as the build tool.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server with Vite (user should run this themselves for testing)
- `npm run build` - Build for production
- `npm run serve` - Preview production build

## Architecture Notes

### Technology Stack
- **Vue.js 2.7.14** - Progressive JavaScript framework
- **Vite** - Fast build tool and development server
- **markdown-it** - Markdown parser for converting markdown to HTML
- **turndown** - HTML to markdown converter
- **github-markdown-css** - GitHub-style markdown styling

### Key Features
- Contenteditable-based markdown editor
- Real-time markdown to HTML conversion
- Bidirectional conversion (markdown ↔ HTML)
- GitHub-flavored markdown styling

## Getting Started

1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Build for production: `npm run build`
4. The main entry point is `src/main.js`
5. Core editor component is in `src/App.vue`

## Key Files to Examine

- `package.json` - Project dependencies and scripts
- `src/main.js` - Application entry point (Vue 2 instance creation)
- `src/App.vue` - Main editor component with markdown functionality
- `src/components/MarkdownEditor.vue` - Extracted markdown editor component
- `vite.config.js` - Vite configuration with Vue 2 plugin
- `index.html` - HTML template entry point

## Two-Way Binding Design Philosophy

### The Universal Problem
In two-way binding scenarios, the same data change can originate from two sources:
1. **User interactions** (typing, clicking, dragging)
2. **Programmatic updates** (prop changes, external API)

When both paths trigger the same reactive updates, you get:
- Lost UI state (caret position, selection, scroll position)
- Performance issues (unnecessary re-renders)
- Circular update loops
- Race conditions

### Core Design Principle: Path Separation
**User actions and programmatic updates must follow completely different code paths.**

### The Pattern

#### 1. Dual State Architecture
- **Internal state**: What the user directly manipulates (never triggers reactive DOM updates)
- **External interface**: Props/events for parent communication
- **Computed bridge**: Handles conversion and routing between the two

#### 2. Asymmetric Update Paths
- **User → Parent**: Internal state → Compute/Transform → Emit event
- **Parent → User**: Prop → Compare → Transform → Manual DOM update
- Never let these paths merge or trigger each other

#### 3. The Comparison Gate
The critical safeguard: Compare before updating to break circular chains.
```
if (newValue !== computedCurrentValue) { 
  // Only then update
}
```

#### 4. Manual DOM Control
For UI elements that maintain state (contenteditable, canvas, video players):
- Remove reactive bindings (`v-html`, `v-model`)
- Use refs for manual DOM updates
- Update DOM only in the programmatic path

### Why This Works

**User types** → Updates internal state → Computes new value → Emits to parent → Parent updates prop → Comparison gate sees no change → No DOM update → UI state preserved

**External update** → Prop changes → Comparison gate sees difference → Manual DOM update → UI updates correctly

### Application Beyond Contenteditable

This pattern applies to any component where:
- User interaction state must be preserved (slider position during drag, video playback during seek)
- The same data can be modified from multiple sources
- Reactive updates would destroy important UI state
- You need precise control over when DOM updates occur

The key insight: **The source of a change determines its update path, not the data itself.**

## DOM Mutation with Native History

### ExecCommand Requirement
All DOM mutations that should be undoable by the user MUST use `document.execCommand()` instead of direct DOM manipulation. This ensures proper integration with the browser's native undo/redo history stack.

**Critical Rule**: Any operation that changes the DOM in response to user input must use execCommand to maintain native history support.

#### Required ExecCommand Operations
- **Content Insertion**: `document.execCommand('insertHTML', false, htmlContent)`
- **Block Formatting**: `document.execCommand('formatBlock', false, 'p')`  
- **Text Deletion**: Let browser handle via execCommand when possible

#### Examples
```javascript
// ✅ Correct: Uses execCommand for user-initiated changes
handleEnter() {
  document.execCommand('insertHTML', false, '<p><br></p>')
}

// ❌ Wrong: Direct DOM manipulation breaks undo history
handleEnter() {
  const p = document.createElement('p')
  p.innerHTML = '<br>'
  container.appendChild(p)
}
```

#### When Direct DOM is Acceptable
- **Cursor positioning**: Selection/Range API operations
- **Programmatic updates**: External prop changes (not user actions)
- **Initialization**: Setting up initial DOM state

### Benefits of ExecCommand
- **Native Undo/Redo**: Ctrl+Z works correctly
- **Consistent History**: User actions are properly tracked
- **Browser Compatibility**: Leverages built-in contenteditable behavior
- **Accessible**: Screen readers and assistive technologies understand the changes

## Markdown Editing UX Philosophy

### The Goal: Text-Like Behavior with Visual Styling
Users should feel like they're editing markdown text, but with rich visual presentation instead of syntax markers. The editor should behave intuitively according to markdown semantics, not generic HTML editing rules.

### Core Principle: Semantic Key Behaviors
Keyboard interactions must follow markdown logic, not contenteditable defaults:

#### Backspace at Block Boundaries
**Problem**: Default contenteditable merges blocks unpredictably and doesn't respect markdown structure.

**Solution**: Distinguish between range selection and single caret behavior:
- **Range Selection**: Let browser handle deletion (normal text editing)  
- **Single Caret at Block Start**: Apply markdown semantic rules

#### Markdown Semantic Rules
1. **Block Element Reset**: Heading/blockquote → paragraph (removes formatting)
2. **Style Preservation**: When merging blocks, previous element's style wins
3. **List Behavior**: First item exits list, others merge with previous item
4. **Special Block Merging**: Code blocks merge with code blocks, otherwise convert to paragraph

#### Implementation Pattern
```javascript
// Key distinction: collapsed range = single caret
if (!range.collapsed) {
  return false  // Let browser handle selection deletion
}

// Only apply custom behavior for single caret at block start
if (isAtBlockStart) {
  // Apply markdown semantic rules
}
```

### Why This Matters
Without semantic key handling, users experience:
- Unexpected block merging behaviors
- Loss of markdown structure
- Inconsistent formatting results
- Non-intuitive editing experience

With semantic handling, editing feels natural and predictable, matching how users expect markdown to behave in text editors but with the benefit of visual styling.

### Application Beyond Backspace
This philosophy extends to all key interactions:
- **Enter**: Create appropriate block types based on context
- **Tab**: Proper indentation within lists and code blocks  
- **Cut/Copy/Paste**: Preserve markdown structure
- **Undo/Redo**: Maintain semantic operation boundaries

The goal is seamless markdown editing where the visual interface enhances rather than interferes with the underlying markdown logic.

## Unified Block Semantic Model

### Core Principle: Markdown Flat Structure
Markdown treats all blocks as a flat sequence. Containers (ul/ol, blockquote, pre) are styling wrappers, not semantic blocks. All blocks follow unified rules regardless of their container context.

### Unified Backspace Behavior

#### Context-Based Actions
```javascript
if (isInContainer) {
  return exitContainer(block, container)  // Move block out of container
} else {
  if (blockType === 'paragraph') {
    return mergeWithPrevious(block)       // Merge with previous block
  } else {
    return resetBlockToParagraph(block)   // Convert styled block to paragraph
  }
}
```

#### Complete Backspace Logic
1. **Exit container**: `blockquote(p1, p2) + backspace at p2 → blockquote(p1), p2`
2. **Merge with previous**: `blockquote(p1), p2 + backspace at p2 → blockquote(p1 + p2_content)`
3. **Auto-merge containers**: `blockquote(p1), p2(empty), blockquote(p3) + backspace at p2 → blockquote(p1, p3)`
4. **Merge content with container**: `blockquote(p1), p2(non-empty), blockquote(p3) + backspace at p2 → blockquote(p1 + p2, p3)`

### Unified Enter Behavior

#### Priority-Based Handling
1. **Empty block in container**: Split container or exit
2. **Content splitting**: Let browser handle within blocks
3. **Container operations**: Automatic split/merge as needed

#### Complete Enter Logic
1. **Split content**: `blockquote(p1(abc,def)) + enter before def → blockquote(p1(abc), p2(def))`
2. **Exit at end**: `blockquote(p1, p2(empty)) + enter at p2 → blockquote(p1), p2`
3. **Split container**: `blockquote(p1, p2(empty), p3) + enter at p2 → blockquote(p1), p2, blockquote(p3)`

### Container Operations

#### Automatic Container Management
- **Split**: When paragraph created in middle of container
- **Merge**: When paragraph between same-type containers is removed  
- **Exit**: When moving block out of container
- **Cleanup**: Empty containers are automatically removed

#### Benefits
- **Unified Logic**: Same rules for all blocks (li, p, h1-h6)
- **Predictable**: Container context determines behavior, not block type
- **Semantic**: Respects markdown flat structure
- **Native Integration**: Uses execCommand for undo/redo support