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
- `vite.config.js` - Vite configuration with Vue 2 plugin
- `index.html` - HTML template entry point