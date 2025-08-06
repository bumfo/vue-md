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
        <div v-if="viewMode === 'editor'" class="editor-pane">
          <div
            ref="editor"
            class="markdown-editor"
            contenteditable="true"
            @input="handleInput"
            @paste="handlePaste"
            @keydown="handleKeydown"
            v-html="htmlContent"
          ></div>
        </div>
        
        <div v-if="viewMode === 'preview'" class="preview-pane">
          <div class="markdown-body" v-html="previewHtml"></div>
        </div>
      </div>
      
      <div class="debug-info">
        <details>
          <summary>Debug: Raw Markdown</summary>
          <textarea 
            ref="debugTextarea"
            v-model="markdownContent"
            @input="handleDebugInput"
            class="debug-textarea"
            placeholder="Enter your markdown here..."
          ></textarea>
        </details>
      </div>
    </div>
  </div>
</template>

<script>
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

export default {
  name: 'App',
  data() {
    return {
      markdownContent: '# Welcome to Vue Markdown Editor\n\nStart typing to see the magic happen!\n\n- Item 1\n- Item 2\n- Item 3\n\n**Bold text** and *italic text*\n\n```javascript\nconsole.log("Hello World!");\n```',
      htmlContent: '',
      viewMode: 'editor',
      md: null,
      turndownService: null,
      isUpdatingFromMarkdown: false,
      isUserEditing: false
    }
  },
  computed: {
    previewHtml() {
      return this.md.render(this.markdownContent)
    }
  },
  mounted() {
    this.initializeServices()
    this.updateHtmlFromMarkdown()
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
    
    updateHtmlFromMarkdown() {
      if (this.isUserEditing) {
        return
      }
      this.isUpdatingFromMarkdown = true
      this.htmlContent = this.md.render(this.markdownContent)
      this.$nextTick(() => {
        this.isUpdatingFromMarkdown = false
      })
    },
    
    updateMarkdownFromHtml(html) {
      if (!this.isUpdatingFromMarkdown) {
        this.markdownContent = this.turndownService.turndown(html)
      }
    },
    
    handleInput(event) {
      this.isUserEditing = true
      const html = event.target.innerHTML
      this.updateMarkdownFromHtml(html)
      
      clearTimeout(this.editingTimeout)
      this.editingTimeout = setTimeout(() => {
        this.isUserEditing = false
      }, 500)
    },
    
    handlePaste(event) {
      event.preventDefault()
      this.isUserEditing = true
      
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
      document.execCommand('insertHTML', false, markdownHtml)
      
      this.$nextTick(() => {
        this.updateMarkdownFromHtml(this.$refs.editor.innerHTML)
        
        clearTimeout(this.editingTimeout)
        this.editingTimeout = setTimeout(() => {
          this.isUserEditing = false
        }, 500)
      })
    },
    
    handleKeydown(event) {
      this.isUserEditing = true
      
      if (event.key === 'Tab') {
        event.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
        this.$nextTick(() => {
          this.updateMarkdownFromHtml(this.$refs.editor.innerHTML)
          this.resetEditingTimeout()
        })
      }
      
      if (event.key === 'Enter') {
        const selection = window.getSelection()
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const container = range.commonAncestorContainer
          
          let parentLi = null
          if (container.nodeType === Node.TEXT_NODE) {
            parentLi = container.parentElement.closest('li')
          } else {
            parentLi = container.closest && container.closest('li')
          }
          
          if (parentLi) {
            event.preventDefault()
            
            const listContainer = parentLi.parentElement
            const isOrderedList = listContainer.tagName === 'OL'
            
            if (parentLi.textContent.trim() === '') {
              // Break out of the list
              const remainingItems = []
              let nextSibling = parentLi.nextElementSibling
              
              // Collect all items after the current empty one
              while (nextSibling) {
                const temp = nextSibling.nextElementSibling
                remainingItems.push(nextSibling.cloneNode(true))
                nextSibling.remove()
                nextSibling = temp
              }
              
              // Remove the empty list item
              parentLi.remove()
              
              // Create a paragraph break
              let htmlToInsert = '<p><br></p>'
              
              // If there are remaining items, create a new list
              if (remainingItems.length > 0) {
                const listTag = isOrderedList ? 'ol' : 'ul'
                htmlToInsert += `<${listTag}>`
                remainingItems.forEach(item => {
                  htmlToInsert += item.outerHTML
                })
                htmlToInsert += `</${listTag}>`
              }
              
              // Insert after the current list
              const tempDiv = document.createElement('div')
              tempDiv.innerHTML = htmlToInsert
              
              let insertPoint = listContainer.nextSibling
              const parent = listContainer.parentNode
              
              while (tempDiv.firstChild) {
                parent.insertBefore(tempDiv.firstChild, insertPoint)
              }
              
              // Position cursor in the paragraph
              const newP = listContainer.nextElementSibling
              if (newP && newP.tagName === 'P') {
                const newRange = document.createRange()
                const sel = window.getSelection()
                newRange.setStart(newP, 0)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
              }
              
            } else {
              const newLi = '<li></li>'
              document.execCommand('insertHTML', false, newLi)
            }
            
            this.$nextTick(() => {
              this.updateMarkdownFromHtml(this.$refs.editor.innerHTML)
              this.resetEditingTimeout()
            })
          }
        }
      }
    },
    
    resetEditingTimeout() {
      clearTimeout(this.editingTimeout)
      this.editingTimeout = setTimeout(() => {
        this.isUserEditing = false
      }, 500)
    },
    
    handleDebugInput() {
      this.resizeTextarea()
      // The v-model already handles the two-way binding
      // No need to manually update markdownContent
    },
    
    resizeTextarea() {
      this.$nextTick(() => {
        const textarea = this.$refs.debugTextarea
        if (textarea) {
          textarea.style.height = 'auto'
          textarea.style.height = textarea.scrollHeight + 'px'
        }
      })
    },
    
    toggleView() {
      this.viewMode = this.viewMode === 'editor' ? 'preview' : 'editor'
      if (this.viewMode === 'editor') {
        this.isUserEditing = false
        this.$nextTick(() => {
          this.updateHtmlFromMarkdown()
        })
      }
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
  
  watch: {
    markdownContent: {
      handler() {
        if (this.viewMode === 'editor' && !this.isUpdatingFromMarkdown && !this.isUserEditing) {
          this.updateHtmlFromMarkdown()
        }
      },
      immediate: false
    }
  },
  
  beforeDestroy() {
    if (this.editingTimeout) {
      clearTimeout(this.editingTimeout)
    }
  }
}
</script>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f6f8fa;
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

.editor-pane,
.preview-pane {
  height: 100%;
}

.markdown-editor {
  padding: 20px;
  min-height: 460px;
  border: none;
  outline: none;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #24292e;
  background: white;
}

.markdown-editor:focus {
  outline: none;
}

.markdown-body {
  padding: 20px;
  min-height: 460px;
  background: white;
}

.debug-info {
  padding: 15px 20px;
  background: #f6f8fa;
  border-top: 1px solid #e1e4e8;
}

.debug-info details {
  margin: 0;
}

.debug-info summary {
  cursor: pointer;
  font-weight: 600;
  color: #586069;
  margin-bottom: 10px;
}

.debug-info .debug-textarea {
  width: 100%;
  min-height: 100px;
  background: #f3f4f6;
  padding: 10px;
  border: 1px solid #e1e4e8;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: #24292e;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
  resize: none;
  outline: none;
  margin: 0;
  box-sizing: border-box;
}

.debug-info .debug-textarea:focus {
  border-color: #0366d6;
  box-shadow: 0 0 0 2px rgba(3, 102, 214, 0.1);
}

.markdown-editor h1,
.markdown-editor h2,
.markdown-editor h3,
.markdown-editor h4,
.markdown-editor h5,
.markdown-editor h6 {
  margin: 0;
  padding: 0;
  font-weight: 600;
  line-height: 1.25;
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

.markdown-editor ul,
.markdown-editor ol {
  padding-left: 2em;
}

.markdown-editor code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
}

.markdown-editor pre {
  background-color: #f6f8fa;
  border-radius: 6px;
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
}

.markdown-editor blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
  margin: 0;
}
</style>