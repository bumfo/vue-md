<template>
  <div
    ref="editor"
    class="markdown-editor"
    contenteditable="true"
    @input="handleInput"
    @paste="handlePaste"
    @keydown="handleKeydown"
    v-html="htmlContent"
  ></div>
</template>

<script>
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

export default {
  name: 'MarkdownEditor',
  props: {
    value: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      htmlContent: '',
      md: null,
      turndownService: null,
      isUpdatingFromMarkdown: false,
      isUserEditing: false,
      editingTimeout: null
    }
  },
  mounted() {
    this.initializeServices()
    this.updateHtmlFromMarkdown()
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
      this.htmlContent = this.md.render(this.value)
      this.$nextTick(() => {
        this.isUpdatingFromMarkdown = false
      })
    },
    
    updateMarkdownFromHtml(html) {
      if (!this.isUpdatingFromMarkdown) {
        const markdown = this.turndownService.turndown(html)
        this.$emit('input', markdown)
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
    }
  },
  
  watch: {
    value: {
      handler() {
        if (!this.isUpdatingFromMarkdown && !this.isUserEditing) {
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