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

### The Core Problem
Vue's reactive system can destroy caret position in contenteditable elements when user actions trigger DOM updates through reactive bindings.

### Design Principle: Separate User and Programmatic Paths
**User actions should only update internal state. Programmatic actions should only update the DOM.**

### Architecture Pattern

#### State Management
- Use internal state variables for current content (not reactive to DOM)
- Never store computed/derived values - always compute on-demand
- Computed properties with get/set handle conversions and DOM manipulation

#### Path Separation
- **User path**: Events → internal state → emit changes (no DOM updates)
- **Programmatic path**: Props → computed setters → manual DOM updates
- **Comparison gates**: Setters compare before updating to prevent circular updates

#### Critical Implementation Details
- Initialize services in `created()` before any DOM access
- Remove `v-html` and reactive DOM bindings from contenteditable elements  
- Use `$refs` for manual DOM updates in computed setters only
- DRY principle: Extract common user action handlers
- Fail fast: Require services to be initialized, don't silently handle missing dependencies

### Flow Summary
User interactions preserve caret position by avoiding DOM updates, while external prop changes properly update the DOM through manual manipulation. The key insight is that the same content change should follow completely different update paths depending on its source.