# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vue.js project focused on markdown functionality. The repository is currently in its initial setup phase.

## Development Commands

Since this is a new Vue.js project, you'll likely need to set up standard Vue development commands. Common patterns include:

- `npm run dev` or `npm run serve` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run linting
- `npm run test` or `npm run test:unit` - Run tests
- `npm install` - Install dependencies

Check package.json scripts section for actual available commands once the project is initialized.

## Architecture Notes

This project appears to be focused on Vue.js with markdown integration. Key areas to understand:

- Vue component structure for markdown rendering
- Markdown parsing and processing logic
- Integration between Vue reactivity and markdown content
- Potential use of libraries like markdown-it, remark, or similar

## Getting Started

This repository appears to be freshly initialized. When working with this codebase:

1. First check if package.json exists and install dependencies
2. Look for Vue configuration files (vite.config.js, vue.config.js, etc.)
3. Identify the main entry point (typically src/main.js or src/main.ts)
4. Understand the component structure in src/components/
5. Check for markdown-related dependencies and their configuration

## Key Files to Examine

- package.json - Project dependencies and scripts
- src/main.js or src/main.ts - Application entry point
- src/App.vue - Root component
- src/components/ - Vue components
- src/assets/ - Static assets
- vite.config.js or vue.config.js - Build configuration