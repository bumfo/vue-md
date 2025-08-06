# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue.js 2.0 markdown editor with contenteditable support. This project provides a rich markdown editing experience using Vue 2.7.14 with Vite as the build tool.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server with Vite
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