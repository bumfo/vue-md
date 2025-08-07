<template>
  <div
    ref="editor"
    class="markdown-editor"
    contenteditable="true"
    @input="handleInput"
    @paste="handlePaste"
    @keydown="handleKeydown"
  ></div>
</template>

<script>
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import MarkdownBlockEditor from '../utils/MarkdownBlockEditor2'

export default {
  name: 'MarkdownEditor',
  props: {
    value: {
      type: String,
      default: ''
    },
    // Feature flag passed as prop
    useExecCommandOnly: {
      type: Boolean,
      default: true
    },
    debug: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      internalHtml: '',
      md: null,
      turndownService: null,
      blockEditor: null
    }
  },
  computed: {
    htmlContent: {
      get() {
        return this.internalHtml
      },
      set(html) {
        // Programmatic HTML update - update internal state and DOM
        this.internalHtml = html
        if (this.$refs.editor && this.$refs.editor.innerHTML !== html) {
          if (this.debug) console.log('setHtml', html)
          this.$refs.editor.innerHTML = html
        }
      }
    },
    markdownContent: {
      get() {
        // Always compute markdown from current HTML content
        if (!this.turndownService) {
          throw new Error('TurndownService not initialized')
        }
        return this.turndownService.turndown(this.internalHtml)
      },
      set(markdown) {
        // Programmatic markdown update - convert to HTML and update DOM
        if (!this.md) {
          throw new Error('MarkdownIt not initialized')
        }
        // Only update if markdown actually changed to avoid unnecessary DOM updates
        if (markdown !== this.markdownContent) {
          if (this.debug) console.log('setMarkdown', markdown)
          this.htmlContent = this.md.render(markdown)
        }
      }
    }
  },
  created() {
    this.initializeServices()
  },

  mounted() {
    // Initialize block editor with the DOM element
    this.blockEditor = new MarkdownBlockEditor(this.$refs.editor, {
      useExecCommandOnly: this.useExecCommandOnly,
      debug: this.debug
    })

    // Initialize from prop after DOM and services are ready
    this.markdownContent = this.value
  },

  beforeDestroy() {
    // Clean up if needed
    this.blockEditor = null
  },

  methods: {
    // ========== INITIALIZATION ==========
    initializeServices() {
      this.md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true
      })

      this.turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```'
      })

      this.turndownService.addRule('strikethrough', {
        filter: ['del', 's', 'strike'],
        replacement: function (content) {
          return '~~' + content + '~~'
        }
      })
    },

    // ========== CORE DATA FLOW ==========
    handleUserHtmlChange(html) {
      // User action - update internal HTML and emit markdown changes
      this.internalHtml = html
      this.$emit('input', this.markdownContent)
    },

    // ========== EVENT HANDLERS ==========

    handleInput(event) {
      this.handleUserHtmlChange(event.target.innerHTML)
    },

    handlePaste(event) {
      event.preventDefault()

      const clipboardData = event.clipboardData || window.clipboardData
      const plainText = clipboardData.getData('text/plain')
      const htmlText = clipboardData.getData('text/html')

      let contentToInsert
      if (htmlText) {
        contentToInsert = this.turndownService.turndown(htmlText)
      } else {
        contentToInsert = plainText
      }

      const markdownHtml = this.md.render(contentToInsert)

      // Use block editor to insert HTML
      this.blockEditor.insertHTML(markdownHtml)

      this.$nextTick(() => {
        this.handleUserHtmlChange(this.$refs.editor.innerHTML)
      })
    },

    handleKeydown(event) {
      let handled = false

      switch (event.key) {
        case 'Tab':
          event.preventDefault()
          handled = this.blockEditor.handleTab()
          break

        case 'Backspace':
          handled = this.blockEditor.handleBackspace()
          break

        case 'Enter':
          handled = this.blockEditor.handleEnter()
          break
      }

      if (handled) {
        event.preventDefault()
        this.$nextTick(() => {
          this.handleUserHtmlChange(this.$refs.editor.innerHTML)
        })
      }
    }
  },
  watch: {
    value: {
      handler(newValue) {
        if (this.markdownContent !== newValue) {
          // External prop change - update internal state via computed setter
          this.markdownContent = newValue
        }
      },
      immediate: false
    },
    useExecCommandOnly(newValue) {
      // Update block editor when feature flag changes
      if (this.blockEditor) {
        this.blockEditor.useExecCommandOnly = newValue
      }
    },

    debug(newValue) {
      // Update block editor debug mode
      if (this.blockEditor) {
        this.blockEditor.debug = newValue
      }
    }
  }
}
</script>

<style>
/* CSS Reset for markdown editor content */
.markdown-editor * {
  margin: 0;
  padding: 0;
  border: 0;
  vertical-align: baseline;
  box-sizing: border-box;
}

.markdown-editor *,
.markdown-editor *::before,
.markdown-editor *::after {
  box-sizing: inherit;
}

/* Ensure list styles are preserved after reset */
.markdown-editor ul {
  list-style-type: disc;
}

.markdown-editor ol {
  list-style-type: decimal;
}

.markdown-editor ul ul,
.markdown-editor ul ol,
.markdown-editor ol ol,
.markdown-editor ol ul {
  margin-top: 0;
  margin-bottom: 0;
}

.markdown-editor {
  padding: 20px;
  min-height: 459px;
  border: none;
  outline: none;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #24292e;
  background: white;
  height: 100%;
  box-sizing: border-box;
}

.markdown-editor:focus {
  outline: none;
}

/* GitHub Markdown Styles - Applied after reset */
.markdown-editor h1,
.markdown-editor h2,
.markdown-editor h3,
.markdown-editor h4,
.markdown-editor h5,
.markdown-editor h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-editor h1:first-child,
.markdown-editor h2:first-child,
.markdown-editor h3:first-child,
.markdown-editor h4:first-child,
.markdown-editor h5:first-child,
.markdown-editor h6:first-child {
  margin-top: 0;
}

.markdown-editor h1 {
  font-size: 2em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-editor h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-editor h3 {
  font-size: 1.25em;
}

.markdown-editor h4 {
  font-size: 1em;
}

.markdown-editor h5 {
  font-size: 0.875em;
}

.markdown-editor h6 {
  font-size: 0.85em;
  color: #6a737d;
}

.markdown-editor p {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-editor ul,
.markdown-editor ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-editor li {
  word-wrap: break-word;
}

.markdown-editor li > p {
  margin-top: 16px;
}

.markdown-editor li + li {
  margin-top: 0.25em;
}

.markdown-editor strong {
  font-weight: 600;
}

.markdown-editor em {
  font-style: italic;
}

.markdown-editor code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
}

.markdown-editor pre {
  margin-top: 0;
  margin-bottom: 16px;
  background-color: #f6f8fa;
  border-radius: 6px;
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
}

.markdown-editor pre code {
  display: inline;
  max-width: none;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  word-wrap: normal;
  background-color: transparent;
  border: 0;
}

.markdown-editor blockquote {
  margin: 0 0 16px 0;
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
}

.markdown-editor hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}

.markdown-editor table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-editor table th,
.markdown-editor table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-editor table th {
  font-weight: 600;
  background-color: #f6f8fa;
}

.markdown-editor table tr:nth-child(2n) {
  background-color: #f6f8fa;
}
</style>
