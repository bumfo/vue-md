<template>
  <div id="app">
    <div class="editor-container">
      <h1>Vue Markdown Editor</h1>
      <div class="editor-controls">
        <button @click="toggleView" class="view-toggle">
          {{ viewMode === 'editor' ? 'Preview' : 'Edit' }}
        </button>
        <button @click="copyMarkdown" class="copy-btn">Copy Markdown</button>
      </div>

      <div class="editor-wrapper">
        <div v-if="viewMode === 'editor'" class="editor-layout">
          <div class="editor-pane">
            <MarkdownEditor v-model="markdownContent"/>
          </div>
          <div class="textarea-pane">
            <div class="textarea-header">Raw Markdown</div>
            <textarea
                ref="debugTextarea"
                v-model="markdownContent"
                @input="handleDebugInput"
                class="debug-textarea"
                placeholder="Enter your markdown here..."
            ></textarea>
          </div>
        </div>

        <div v-if="viewMode === 'preview'" class="preview-pane">
          <div class="markdown-body" v-html="previewHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import MarkdownIt from 'markdown-it'
import MarkdownEditor from './components/MarkdownEditor.vue'

export default {
  name: 'App',
  components: {
    MarkdownEditor
  },
  data() {
    return {
      markdownContent: '# Welcome to Vue Markdown Editor\n\nStart typing to see the magic happen!\n\n- Item 1\n- Item 2\n- Item 3\n\n**Bold text** and *italic text*\n\n```javascript\nconsole.log("Hello World!");\n```',
      viewMode: 'editor',
      md: null
    }
  },
  computed: {
    previewHtml() {
      return this.md.render(this.markdownContent)
    }
  },
  mounted() {
    this.initializeServices()
    this.$nextTick(() => {
      this.resizeTextarea()
    })
  },
  methods: {
    initializeServices() {
      this.md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true
      })
    },

    handleDebugInput() {
      this.resizeTextarea()
      // The v-model already handles the two-way binding
      // No need to manually update markdownContent
    },

    resizeTextarea() {
      // In side-by-side layout, textarea height is managed by CSS
      // No need for dynamic resizing as it fills the available space
    },

    toggleView() {
      this.viewMode = this.viewMode === 'editor' ? 'preview' : 'editor'
    },

    copyMarkdown() {
      navigator.clipboard.writeText(this.markdownContent).then(() => {
        alert('Markdown copied to clipboard!')
      }).catch(() => {
        const textArea = document.createElement('textarea')
        textArea.value = this.markdownContent
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        alert('Markdown copied to clipboard!')
      })
    }
  },
}
</script>

<style>
body {
  background-color: #f6f8fa;
  margin: 0;
  padding: 0;
}
</style>

<style scoped>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
}

#app {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.editor-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.editor-container h1 {
  margin: 0;
  padding: 20px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-size: 24px;
  font-weight: 600;
  color: #24292e;
}

.editor-controls {
  padding: 15px 20px;
  background: #fafbfc;
  border-bottom: 1px solid #e1e4e8;
  display: flex;
  gap: 10px;
}

.view-toggle,
.copy-btn {
  padding: 8px 16px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  background: white;
  color: #24292e;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.view-toggle:hover,
.copy-btn:hover {
  background: #f6f8fa;
  border-color: #d0d7de;
}

.editor-wrapper {
  min-height: 500px;
}

.editor-layout {
  display: flex;
  height: 100%;
  gap: 1px;
}

.editor-pane {
  flex: 1;
  background: white;
}

.textarea-pane {
  flex: 1;
  background: white;
  border-left: 1px solid #e1e4e8;
}

.textarea-header {
  padding: 10px 15px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-size: 12px;
  font-weight: 600;
  color: #586069;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-pane {
  height: 100%;
}

.markdown-body {
  padding: 20px;
  min-height: 460px;
  background: white;
}

.debug-textarea {
  width: 100%;
  height: calc(100% - 41px);
  min-height: 459px;
  background: white;
  padding: 20px;
  border: none;
  font-size: 12px;
  line-height: 1.4;
  color: #24292e;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
  resize: none;
  outline: none;
  margin: 0;
  box-sizing: border-box;
}

.debug-textarea:focus {
  outline: none;
}
</style>