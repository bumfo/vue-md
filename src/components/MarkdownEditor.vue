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
      internalHtml: '',
      md: null,
      turndownService: null
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
          console.log('setHtml', html)
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
          console.log('setMarkdown', markdown)
          this.htmlContent = this.md.render(markdown)
        }
      }
    }
  },

  created() {
    this.initializeServices()
  },

  mounted() {
    // Initialize from prop after DOM and services are ready
    this.markdownContent = this.value
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


    handleUserHtmlChange(html) {
      // User action - update internal HTML and emit markdown changes
      this.internalHtml = html
      this.$emit('input', this.markdownContent)
    },
    
    handleBackspace(event) {
      const selection = window.getSelection()
      if (!selection.rangeCount) return false
      
      const range = selection.getRangeAt(0)
      
      // If there's a range selection, let default behavior handle it
      if (!range.collapsed) {
        return false  // Let browser handle selection deletion
      }
      
      // Only handle single caret at block start
      const { startContainer, startOffset } = range
      const isAtBlockStart = this.isAtBlockStart(startContainer, startOffset)
      
      if (!isAtBlockStart.atStart) return false
      
      const blockElement = isAtBlockStart.blockElement
      const blockType = this.getBlockType(blockElement)
      
      // Handle different block types according to markdown semantics
      return this.handleBlockBackspace(blockElement, blockType)
    },
    
    isAtBlockStart(container, offset) {
      // If we're not at offset 0, check if we're at start of block
      if (offset !== 0) return { atStart: false }
      
      // Find the block element containing the cursor
      let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
      
      while (element && element !== this.$refs.editor) {
        if (this.isBlockElement(element)) {
          // Check if cursor is truly at the start of this block's text content
          const textBeforeCursor = this.getTextBeforeCursor(element, container, offset)
          return { 
            atStart: textBeforeCursor === '', 
            blockElement: element 
          }
        }
        element = element.parentElement
      }
      
      return { atStart: false }
    },
    
    getTextBeforeCursor(blockElement, container, offset) {
      const walker = document.createTreeWalker(
        blockElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )
      
      let textBefore = ''
      let currentNode
      
      while (currentNode = walker.nextNode()) {
        if (currentNode === container) {
          textBefore += currentNode.textContent.substring(0, offset)
          break
        } else {
          textBefore += currentNode.textContent
        }
      }
      
      return textBefore.trim()
    },
    
    isBlockElement(element) {
      const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI']
      return blockTags.includes(element.tagName)
    },
    
    getBlockType(element) {
      const tag = element.tagName
      if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return 'heading'
      if (tag === 'BLOCKQUOTE') return 'blockquote'
      if (tag === 'PRE') return 'codeblock'
      if (tag === 'LI') return 'listitem'
      if (tag === 'P') return 'paragraph'
      return 'unknown'
    },
    
    handleBlockBackspace(blockElement, blockType) {
      switch (blockType) {
        case 'heading':
        case 'blockquote':
          return this.resetBlockToParagraph(blockElement)
        case 'paragraph':
          return this.mergeParagraphWithPrevious(blockElement)
        case 'listitem':
          return this.handleListItemBackspace(blockElement)
        case 'codeblock':
          return this.handleCodeBlockBackspace(blockElement)
        default:
          return false
      }
    },
    
    resetBlockToParagraph(blockElement) {
      // Convert heading/blockquote to paragraph
      const p = document.createElement('p')
      p.innerHTML = blockElement.innerHTML || '<br>'
      blockElement.parentNode.replaceChild(p, blockElement)
      
      // Position cursor at the start of the new paragraph
      this.setCursorAtStart(p)
      return true
    },

    resetBlockToParagraphWithEnter(blockElement) {
      // Convert styled block to paragraph and add new line
      const p = document.createElement('p')
      p.innerHTML = '<br>'
      blockElement.parentNode.replaceChild(p, blockElement)
      
      // Position cursor at the start of the new paragraph
      this.setCursorAtStart(p)
      return true
    },
    
    mergeParagraphWithPrevious(blockElement) {
      const previousElement = this.getPreviousBlockElement(blockElement)
      if (!previousElement) return false
      
      const previousType = this.getBlockType(previousElement)
      
      if (previousType === 'paragraph' || previousType === 'heading') {
        // Merge content into previous element, keeping previous element's style
        const cursorPosition = previousElement.textContent.length
        
        // Extract only the inline content, stripping block styling from spans
        const cleanedContent = this.extractInlineContent(blockElement)
        previousElement.innerHTML += cleanedContent
        blockElement.remove()
        
        // Position cursor at the merge point
        this.setCursorPosition(previousElement, cursorPosition)
        return true
      }
      
      return false
    },
    
    handleListItemBackspace(listItem) {
      const list = listItem.parentElement
      
      if (listItem.previousElementSibling) {
        // Merge with previous list item
        const prevLi = listItem.previousElementSibling
        const cursorPosition = prevLi.textContent.length
        prevLi.innerHTML += listItem.innerHTML
        listItem.remove()
        this.setCursorPosition(prevLi, cursorPosition)
        return true
      } else {
        // First item - convert to paragraph and remove from list
        const p = document.createElement('p')
        p.innerHTML = listItem.innerHTML || '<br>'
        
        if (list.children.length === 1) {
          // Last item - replace entire list with paragraph
          list.parentNode.replaceChild(p, list)
        } else {
          // Insert paragraph before list and remove item
          list.parentNode.insertBefore(p, list)
          listItem.remove()
        }
        
        this.setCursorAtStart(p)
        return true
      }
    },
    
    handleCodeBlockBackspace(codeBlock) {
      const previousElement = this.getPreviousBlockElement(codeBlock)
      if (previousElement && this.getBlockType(previousElement) === 'codeblock') {
        // Merge with previous code block
        const cursorPosition = previousElement.textContent.length
        previousElement.innerHTML += '\n' + codeBlock.innerHTML
        codeBlock.remove()
        this.setCursorPosition(previousElement, cursorPosition)
        return true
      }
      
      // Convert to paragraph if no previous code block to merge with
      return this.resetBlockToParagraph(codeBlock)
    },
    
    getPreviousBlockElement(element) {
      let prev = element.previousElementSibling
      while (prev) {
        if (this.isBlockElement(prev)) return prev
        prev = prev.previousElementSibling
      }
      return null
    },
    
    setCursorAtStart(element) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(element, 0)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    },
    
    setCursorPosition(element, position) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )
      
      let currentPos = 0
      let targetNode = null
      let targetOffset = 0
      
      let node
      while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length
        if (currentPos + nodeLength >= position) {
          targetNode = node
          targetOffset = position - currentPos
          break
        }
        currentPos += nodeLength
      }
      
      if (targetNode) {
        const range = document.createRange()
        const selection = window.getSelection()
        range.setStart(targetNode, targetOffset)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    },

    extractInlineContent(element) {
      // Clone the element to avoid modifying the original
      const clone = element.cloneNode(true)
      
      // Remove spans that only contain block-level styling (style attribute)
      const spans = clone.querySelectorAll('span[style]')
      spans.forEach(span => {
        const style = span.getAttribute('style')
        // If span only has block-level styling, unwrap it but keep content
        if (this.isBlockLevelStyling(style)) {
          const parent = span.parentNode
          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span)
          }
          parent.removeChild(span)
        }
      })
      
      return clone.innerHTML
    },

    isBlockLevelStyling(styleString) {
      if (!styleString) return false
      
      const blockStyles = [
        'font-size',
        'font-weight: 600',
        'font-weight: bold', 
        'font-weight: 700',
        'margin',
        'padding',
        'border',
        'color: rgb(106, 115, 125)', // blockquote color
        'line-height'
      ]
      
      return blockStyles.some(blockStyle => 
        styleString.includes(blockStyle)
      ) && !this.hasInlineStyles(styleString)
    },

    hasInlineStyles(styleString) {
      const inlineStyles = [
        'font-weight: bold',
        'font-weight: 600', 
        'font-weight: 700',
        'font-style: italic',
        'text-decoration: underline',
        'text-decoration: line-through'
      ]
      
      return inlineStyles.some(inlineStyle => 
        styleString.includes(inlineStyle)
      )
    },

    isAtEndOfInlineElement(range) {
      if (!range.collapsed) return false
      
      const container = range.startContainer
      const offset = range.startOffset
      
      // Check if cursor is at the end of a text node
      if (container.nodeType === Node.TEXT_NODE) {
        if (offset !== container.textContent.length) return false
        
        // Check if this text node is inside an inline element
        let parent = container.parentElement
        while (parent && parent !== this.$refs.editor) {
          if (this.isInlineStyleElement(parent)) {
            // Check if this is the last text content in the inline element
            return this.isLastTextInElement(container, parent)
          }
          if (this.isBlockElement(parent)) break
          parent = parent.parentElement
        }
      }
      
      return false
    },

    isInlineStyleElement(element) {
      const inlineTags = ['STRONG', 'EM', 'B', 'I', 'CODE', 'U', 'S']
      if (inlineTags.includes(element.tagName)) return true
      
      // Check for spans with inline styling
      if (element.tagName === 'SPAN' && element.hasAttribute('style')) {
        return this.hasInlineStyles(element.getAttribute('style'))
      }
      
      return false
    },

    isLastTextInElement(textNode, element) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )
      
      let lastTextNode = null
      let node
      while (node = walker.nextNode()) {
        lastTextNode = node
      }
      
      return textNode === lastTextNode
    },

    insertCleanNewLine() {
      // Insert a clean paragraph without inheriting inline styles
      const p = document.createElement('p')
      p.innerHTML = '<br>'
      
      const selection = window.getSelection()
      const range = selection.getRangeAt(0)
      
      // Find the current block element
      let currentBlock = range.startContainer
      if (currentBlock.nodeType === Node.TEXT_NODE) {
        currentBlock = currentBlock.parentElement
      }
      while (currentBlock && !this.isBlockElement(currentBlock)) {
        currentBlock = currentBlock.parentElement
      }
      
      if (currentBlock) {
        currentBlock.parentNode.insertBefore(p, currentBlock.nextSibling)
        this.setCursorAtStart(p)
      }
    },

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
      document.execCommand('insertHTML', false, markdownHtml)

      this.$nextTick(() => {
        this.handleUserHtmlChange(this.$refs.editor.innerHTML)
      })
    },

    handleKeydown(event) {
      if (event.key === 'Tab') {
        event.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
        this.$nextTick(() => {
          this.handleUserHtmlChange(this.$refs.editor.innerHTML)
        })
        return
      }
      
      if (event.key === 'Backspace') {
        const handled = this.handleBackspace(event)
        if (handled) {
          event.preventDefault()
          this.$nextTick(() => {
            this.handleUserHtmlChange(this.$refs.editor.innerHTML)
          })
          return
        }
      }

      if (event.key === 'Enter') {
        const selection = window.getSelection()
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const container = range.commonAncestorContainer

          // Check if we're in an empty styled block (non-p)
          let currentBlock = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
          while (currentBlock && currentBlock !== this.$refs.editor) {
            if (this.isBlockElement(currentBlock)) {
              const blockType = this.getBlockType(currentBlock)
              // If it's an empty styled block (not paragraph), reset to paragraph
              if (blockType !== 'paragraph' && blockType !== 'listitem' && currentBlock.textContent.trim() === '') {
                event.preventDefault()
                this.resetBlockToParagraphWithEnter(currentBlock)
                this.$nextTick(() => {
                  this.handleUserHtmlChange(this.$refs.editor.innerHTML)
                })
                return
              }
              break
            }
            currentBlock = currentBlock.parentElement
          }

          // Check if we're at the end of an inline styled element
          if (this.isAtEndOfInlineElement(range)) {
            event.preventDefault()
            this.insertCleanNewLine()
            this.$nextTick(() => {
              this.handleUserHtmlChange(this.$refs.editor.innerHTML)
            })
            return
          }

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
              this.handleUserHtmlChange(this.$refs.editor.innerHTML)
            })
            return
          }
        }
      }
    },

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