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
      console.log('handleBackspace called')
      const selection = window.getSelection()
      if (!selection.rangeCount) {
        console.log('handleBackspace: no selection range')
        return false
      }

      const range = selection.getRangeAt(0)

      // If there's a range selection, let default behavior handle it
      if (!range.collapsed) {
        console.log('handleBackspace: range not collapsed, letting browser handle')
        return false  // Let browser handle selection deletion
      }

      // Only handle single caret at block start
      const {startContainer, startOffset} = range
      console.log('handleBackspace: startContainer:', startContainer, 'startOffset:', startOffset)
      const isAtBlockStart = this.isAtBlockStart(startContainer, startOffset)
      console.log('handleBackspace: isAtBlockStart:', isAtBlockStart)

      if (!isAtBlockStart.atStart) {
        console.log('handleBackspace: not at block start, returning false')
        return false
      }

      const blockElement = isAtBlockStart.blockElement
      const blockType = this.getBlockType(blockElement)
      console.log('handleBackspace: calling handleBlockBackspace with element:', blockElement.tagName, 'type:', blockType)

      // Handle different block types according to markdown semantics
      return this.handleBlockBackspace(blockElement, blockType)
    },

    isAtBlockStart(container, offset) {
      // If we're not at offset 0, check if we're at start of block
      if (offset !== 0) return {atStart: false}

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

      return {atStart: false}
    },

    getTextBeforeCursor(blockElement, container, offset) {
      // If container is an element node at offset 0, we're at the start
      if (container.nodeType === Node.ELEMENT_NODE && offset === 0) {
        return ''
      }

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

    isContainerElement(element) {
      const containerTags = ['BLOCKQUOTE', 'OL', 'UL', 'PRE']
      return containerTags.includes(element.tagName)
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
      console.log('block backspace', blockType, 'element:', blockElement.tagName, 'parent:', blockElement.parentElement.tagName)
      
      const container = blockElement.parentElement
      const isInContainer = this.isContainerElement(container)
      
      console.log('isInContainer:', isInContainer, 'container:', container.tagName)
      
      if (isInContainer) {
        // Block is inside a container - exit the container
        console.log('Calling exitContainer')
        return this.exitContainer(blockElement, container)
      } else {
        // Block is at root level
        if (blockType === 'paragraph') {
          // Paragraph at root - merge with previous
          console.log('Calling mergeWithPrevious')
          return this.mergeWithPrevious(blockElement)
        } else {
          // Styled block at root (h1-h6, blockquote, pre) - reset to paragraph
          console.log('Calling resetBlockToParagraph')
          return this.resetBlockToParagraph(blockElement)
        }
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
      // Check if this block is inside a container
      const blockContainer = blockElement.parentElement
      const isInContainer = this.isContainerElement(blockContainer)

      if (isInContainer) {
        // If the block is the first/only child in a container, move it out of the container
        if (blockContainer.children.length === 1 || blockElement === blockContainer.firstElementChild) {
          // Move the block outside the container
          const newParagraph = document.createElement('p')
          newParagraph.innerHTML = blockElement.innerHTML || '<br>'

          // Insert before the container
          blockContainer.parentNode.insertBefore(newParagraph, blockContainer)

          // Remove the block from container
          blockElement.remove()

          // If container is now empty, remove it
          if (blockContainer.textContent.trim() === '') {
            blockContainer.remove()
          }

          // Now try to merge with the previous element again
          return this.mergeParagraphWithPrevious(newParagraph)
        } else {
          // Merge with previous sibling within the container
          const prevSibling = blockElement.previousElementSibling
          if (prevSibling && this.isBlockElement(prevSibling)) {
            const cursorPosition = prevSibling.textContent.length
            const currentContent = this.extractInlineContent(blockElement)

            // Position cursor at end of previous element
            const range = document.createRange()
            const selection = window.getSelection()
            range.setStart(prevSibling, prevSibling.childNodes.length)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)

            // Use execCommand to insert the content
            document.execCommand('insertHTML', false, currentContent)

            // Remove the now-empty block
            blockElement.remove()

            // Position cursor at merge point
            this.setCursorPosition(prevSibling, cursorPosition)
            return true
          }
        }

        return false
      }

      // Standard merging for blocks not in containers
      const previousElement = this.getPreviousBlockElement(blockElement)
      if (!previousElement) return false

      const previousType = this.getBlockType(previousElement)

      if (previousType === 'paragraph' || previousType === 'heading' || previousType === 'listitem') {
        // Store cursor position and extract clean content
        const cursorPositionText = previousElement.textContent.length
        const currentContent = this.extractInlineContent(blockElement)

        // Position cursor at end of previous element
        const range = document.createRange()
        const selection = window.getSelection()
        range.setStart(previousElement, previousElement.childNodes.length)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)

        // Use execCommand to insert the cleaned content
        document.execCommand('insertHTML', false, currentContent)

        // Use execCommand to delete the now-empty block
        const rangeToDelete = document.createRange()
        rangeToDelete.selectNode(blockElement)
        selection.removeAllRanges()
        selection.addRange(rangeToDelete)
        document.execCommand('delete')

        // Position cursor at merge point
        this.setCursorPosition(previousElement, cursorPositionText)
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
        if (this.isBlockElement(prev)) {
          return prev
        } else if (this.isContainerElement(prev)) {
          // If previous sibling is a container, return the last block element inside it
          const lastChild = prev.lastElementChild
          if (lastChild && this.isBlockElement(lastChild)) {
            return lastChild
          }
        }
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
      // Insert a clean paragraph without inheriting inline styles using execCommand
      document.execCommand('insertHTML', false, '<p><br></p>')
    },

    // === UNIFIED CONTAINER/BLOCK OPERATIONS ===
    
    exitContainer(blockElement, container) {
      console.log('exitContainer: blockElement.innerHTML:', blockElement.innerHTML)
      const content = this.extractInlineContent(blockElement)
      console.log('exitContainer: extracted content:', content)
      const newParagraph = document.createElement('p')
      newParagraph.innerHTML = content || '<br>'
      console.log('exitContainer: newParagraph.innerHTML:', newParagraph.innerHTML)
      
      // Check if we need to split the container (block is in the middle)
      const remainingItems = []
      let nextItem = blockElement.nextElementSibling
      while (nextItem) {
        const temp = nextItem.nextElementSibling
        remainingItems.push(nextItem)
        nextItem = temp
      }
      console.log('exitContainer: remainingItems count:', remainingItems.length)
      
      // Remove the current block
      blockElement.remove()
      console.log('exitContainer: removed blockElement')
      
      // Insert paragraph after the current container
      container.parentNode.insertBefore(newParagraph, container.nextSibling)
      console.log('exitContainer: inserted newParagraph after container')
      
      // If there are remaining items, create a new container after the paragraph
      if (remainingItems.length > 0) {
        const newContainer = document.createElement(container.tagName)
        remainingItems.forEach(item => newContainer.appendChild(item))
        container.parentNode.insertBefore(newContainer, newParagraph.nextSibling)
        console.log('exitContainer: created new container with', remainingItems.length, 'items')
      }
      
      // If original container is now empty, remove it
      if (container.children.length === 0) {
        container.remove()
        console.log('exitContainer: removed empty container')
      }
      
      console.log('exitContainer: calling mergeAdjacentContainers with preserveSplit=true')
      // Check for container merging after the operation, but preserve split from container exits
      this.mergeAdjacentContainers(newParagraph, true)
      
      // Position cursor
      this.setCursorAtStart(newParagraph)
      console.log('exitContainer: positioned cursor')
      
      return true
    },
    
    mergeWithPrevious(blockElement) {
      // Unified merge logic for any block with its previous element
      console.log('mergeWithPrevious: blockElement:', blockElement.tagName, 'innerHTML:', blockElement.innerHTML)
      console.log('mergeWithPrevious: blockElement parent:', blockElement.parentElement.tagName)
      
      const previousElement = this.getPreviousBlockElement(blockElement)
      if (!previousElement) {
        console.log('mergeWithPrevious: no previous element found')
        return false
      }
      
      console.log('mergeWithPrevious: previousElement:', previousElement.tagName, 'innerHTML:', previousElement.innerHTML)
      console.log('mergeWithPrevious: previousElement parent:', previousElement.parentElement.tagName)
      
      const previousType = this.getBlockType(previousElement)
      const previousContainer = previousElement.parentElement
      const currentContainer = blockElement.parentElement
      
      console.log('mergeWithPrevious: previousType:', previousType)
      console.log('mergeWithPrevious: previousContainer is container?', this.isContainerElement(previousContainer))
      console.log('mergeWithPrevious: currentContainer is container?', this.isContainerElement(currentContainer))
      
      // Only merge within the same container or both at root - never cross containers
      const canMerge = (
        (previousContainer === currentContainer) || // Same exact container
        (!this.isContainerElement(previousContainer) && !this.isContainerElement(currentContainer)) // Both at root
      )
      
      console.log('mergeWithPrevious: canMerge:', canMerge)
      if (!canMerge) {
        console.log('mergeWithPrevious: cannot merge, returning false')
        return false
      }
      
      if (previousType === 'paragraph' || previousType === 'heading') {
        console.log('mergeWithPrevious: merging with paragraph/heading')
        const cursorPosition = previousElement.textContent.length
        const currentContent = this.extractInlineContent(blockElement)
        
        // Position cursor at end of previous element
        const range = document.createRange()
        const selection = window.getSelection()
        range.setStart(previousElement, previousElement.childNodes.length)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        
        // Use execCommand to insert content
        document.execCommand('insertHTML', false, currentContent)
        
        // Remove current block
        const blockContainer = blockElement.parentElement
        blockElement.remove()
        
        // If container is now empty, remove it
        if (this.isContainerElement(blockContainer) && blockContainer.textContent.trim() === '') {
          blockContainer.remove()
        }
        
        // Check for container merging - need to find the right context
        // If previousElement is in a container, check if we created a merge opportunity
        const prevContainer = previousElement.parentElement
        if (this.isContainerElement(prevContainer)) {
          // Check siblings of the container for merge opportunities
          const nextSibling = prevContainer.nextElementSibling
          if (nextSibling && nextSibling.tagName === 'P') {
            this.mergeAdjacentContainers(nextSibling)
          }
        } else {
          this.mergeAdjacentContainers(previousElement)
        }
        
        // Position cursor
        this.setCursorPosition(previousElement, cursorPosition)
        return true
      } else {
        // Previous element is a container (blockquote, list, etc.)
        console.log('mergeWithPrevious: previous is container, checking merge type')
        console.log('mergeWithPrevious: blockElement is root paragraph?', blockElement.tagName === 'P' && !this.isContainerElement(blockElement.parentElement))
        
        if (blockElement.tagName === 'P' && !this.isContainerElement(blockElement.parentElement)) {
          // This is a root-level paragraph
          const hasContent = blockElement.textContent.trim() !== '' && blockElement.innerHTML !== '<br>'
          console.log('mergeWithPrevious: paragraph has content?', hasContent)
          
          if (hasContent) {
            // Non-empty paragraph - merge content into the last block of the previous container
            console.log('mergeWithPrevious: merging content into previous container')
            const lastChild = previousElement.lastElementChild
            console.log('mergeWithPrevious: lastChild:', lastChild ? lastChild.tagName : 'null')
            console.log('mergeWithPrevious: lastChild innerHTML:', lastChild ? lastChild.innerHTML : 'null')
            console.log('mergeWithPrevious: lastChild is block?', lastChild ? this.isBlockElement(lastChild) : 'null')
            
            if (lastChild && this.isBlockElement(lastChild)) {
              const cursorPosition = lastChild.textContent.length
              const currentContent = this.extractInlineContent(blockElement)
              console.log('mergeWithPrevious: currentContent to merge:', currentContent)
              console.log('mergeWithPrevious: cursor position before merge:', cursorPosition)
              
              // Position cursor at end of last child in container
              const range = document.createRange()
              const selection = window.getSelection()
              range.setStart(lastChild, lastChild.childNodes.length)
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
              console.log('mergeWithPrevious: positioned cursor at end of lastChild')
              
              // Use execCommand to insert content
              document.execCommand('insertHTML', false, currentContent)
              console.log('mergeWithPrevious: inserted content via execCommand')
              
              // Remove current block
              blockElement.remove()
              console.log('mergeWithPrevious: removed current block')
              
              // Position cursor
              this.setCursorPosition(lastChild, cursorPosition)
              console.log('mergeWithPrevious: repositioned cursor')
              console.log('mergeWithPrevious: FINAL lastChild innerHTML:', lastChild.innerHTML)
              console.log('mergeWithPrevious: FINAL container HTML:', previousElement.innerHTML)
              
              // Check if there's a next container of the same type to merge
              const previousContainer = previousElement.parentElement
              const nextSibling = this.isContainerElement(previousContainer) ? 
                previousContainer.nextElementSibling : previousElement.nextElementSibling
              console.log('mergeWithPrevious: checking for next sibling to merge:', nextSibling ? nextSibling.tagName : 'null')
              const containerToCompareWith = this.isContainerElement(previousContainer) ? 
                previousContainer : previousElement
              if (nextSibling && 
                  this.isContainerElement(nextSibling) && 
                  nextSibling.tagName === containerToCompareWith.tagName) {
                console.log('mergeWithPrevious: merging next container into current')
                // Get the first child that will be moved (for cursor positioning)
                const firstChildToMove = nextSibling.firstChild
                // Move all children from next container to current container
                while (nextSibling.firstChild) {
                  previousElement.appendChild(nextSibling.firstChild)
                }
                nextSibling.remove()
                console.log('mergeWithPrevious: removed next container after merge')
                
                // Position cursor at the merge boundary (end of the content that was already there)
                this.setCursorPosition(lastChild, cursorPosition)
                console.log('mergeWithPrevious: positioned cursor at merge boundary')
              }

              // Sync DOM changes back to Vue state
              this.handleUserHtmlChange(this.$refs.editor.innerHTML)
              console.log('mergeWithPrevious: synced DOM to Vue state')
              return true
            } else {
              console.log('mergeWithPrevious: no valid lastChild to merge into')
            }
          } else {
            // Empty paragraph - try container merging
            console.log('mergeWithPrevious: empty paragraph, calling mergeAdjacentContainers')
            this.mergeAdjacentContainers(blockElement)
            return true
          }
        }
      }
      
      return false
    },
    
    splitOrExitContainer(blockElement, container) {
      // Split container or exit if at end - handles empty li, blockquote > p, etc.
      const isLastChild = !blockElement.nextElementSibling
      
      if (isLastChild) {
        // At end of container - just exit
        return this.exitContainer(blockElement, container)
      } else {
        // In middle of container - split it
        return this.splitContainer(blockElement, container)
      }
    },
    
    splitContainer(blockElement, container) {
      // Split container at the empty block position
      const containerType = container.tagName.toLowerCase()
      const remainingElements = []
      
      // Collect elements after the empty block
      let nextSibling = blockElement.nextElementSibling
      while (nextSibling) {
        const temp = nextSibling.nextElementSibling
        remainingElements.push(nextSibling.cloneNode(true))
        nextSibling.remove()
        nextSibling = temp
      }
      
      // Remove the empty block
      blockElement.remove()
      
      // Create paragraph where the empty block was
      const newParagraph = document.createElement('p')
      newParagraph.innerHTML = '<br>'
      container.parentNode.insertBefore(newParagraph, container.nextSibling)
      
      // Create new container with remaining elements if any
      if (remainingElements.length > 0) {
        const newContainer = document.createElement(containerType)
        remainingElements.forEach(element => {
          newContainer.appendChild(element)
        })
        newParagraph.parentNode.insertBefore(newContainer, newParagraph.nextSibling)
      }
      
      // Position cursor in the new paragraph
      this.setCursorAtStart(newParagraph)
      return true
    },
    
    mergeAdjacentContainers(referenceElement, preserveSplit = false) {
      // Only merge containers when we have an empty paragraph at root level between same-type containers
      // This handles the case: blockquote(p1), p2(empty), blockquote(p3) → blockquote(p1, p3)
      const current = referenceElement
      console.log('mergeAdjacentContainers: current element:', current.tagName, 'innerHTML:', current.innerHTML)
      console.log('mergeAdjacentContainers: current parent:', current.parentElement.tagName)
      console.log('mergeAdjacentContainers: preserveSplit:', preserveSplit)
      
      // If preserveSplit is true (from exitContainer), don't merge
      if (preserveSplit) {
        console.log('mergeAdjacentContainers: preserveSplit=true, preserving split structure from container exit')
        return
      }
      
      // Only consider root-level paragraphs
      if (current.tagName !== 'P' || this.isContainerElement(current.parentElement)) {
        console.log('mergeAdjacentContainers: not a root paragraph, returning')
        return
      }
      
      // Only merge if paragraph is empty (no meaningful content)
      if (current.textContent.trim() !== '' && current.innerHTML !== '<br>') {
        console.log('mergeAdjacentContainers: paragraph has content, preserving split structure')
        return
      }
      
      const prevSibling = current.previousElementSibling
      const nextSibling = current.nextElementSibling
      console.log('mergeAdjacentContainers: prevSibling:', prevSibling ? prevSibling.tagName : 'null')
      console.log('mergeAdjacentContainers: nextSibling:', nextSibling ? nextSibling.tagName : 'null')
      
      // Check if we have: same-container + empty-paragraph + same-container
      if (prevSibling && nextSibling &&
          this.isContainerElement(prevSibling) && 
          this.isContainerElement(nextSibling) &&
          prevSibling.tagName === nextSibling.tagName) {
        
        console.log('mergeAdjacentContainers: MERGING containers with empty paragraph!')
        // Get the original last child of the first container before merging
        const originalLastChildOfFirst = prevSibling.lastElementChild
        console.log('mergeAdjacentContainers: originalLastChildOfFirst:', originalLastChildOfFirst ? originalLastChildOfFirst.tagName : 'null')
        
        // Move all children from nextSibling to prevSibling
        while (nextSibling.firstChild) {
          prevSibling.appendChild(nextSibling.firstChild)
        }
        
        // Remove the empty paragraph and second container
        current.remove()
        nextSibling.remove()
        console.log('mergeAdjacentContainers: removed empty paragraph and second container')
        
        // Position cursor at the end of the original last block in the first container (merge boundary)
        if (originalLastChildOfFirst && this.isBlockElement(originalLastChildOfFirst)) {
          // Position at end of the last block that was originally in the first container
          this.setCursorPosition(originalLastChildOfFirst, originalLastChildOfFirst.textContent.length)
          console.log('mergeAdjacentContainers: positioned cursor at end of original last block in first container')
        }
      } else {
        console.log('mergeAdjacentContainers: no merge needed')
      }
    },
    
    findEmptyBlock(container) {
      // Find any empty block that needs special enter handling
      let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
      let foundBlock = null
      let containerElement = null

      while (currentElement && currentElement !== this.$refs.editor) {
        if (this.isBlockElement(currentElement)) {
          if (!foundBlock) {
            foundBlock = currentElement
          }

          const parent = currentElement.parentElement
          if (parent && this.isContainerElement(parent)) {
            containerElement = parent
          }

          break
        }
        currentElement = currentElement.parentElement
      }

      if (foundBlock && foundBlock.textContent.trim() === '') {
        const blockType = this.getBlockType(foundBlock)
        const hasContainer = containerElement !== null

        if (blockType !== 'paragraph' || hasContainer) {
          return {block: foundBlock, container: containerElement}
        }
      }

      return null
    },
    
    findBlockInContainer(container) {
      // Find block inside a container for non-empty enter handling
      let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
      let foundBlock = null
      let containerElement = null

      while (currentElement && currentElement !== this.$refs.editor) {
        if (this.isBlockElement(currentElement)) {
          if (!foundBlock) {
            foundBlock = currentElement
          }

          const parent = currentElement.parentElement
          if (parent && this.isContainerElement(parent)) {
            containerElement = parent
            break
          }
        }
        currentElement = currentElement.parentElement
      }

      if (foundBlock && containerElement) {
        return {block: foundBlock, container: containerElement}
      }
      
      return null
    },
    
    handleNonEmptyBlockEnter(blockInfo, range) {
      // Handle enter in non-empty block inside container (like li with content)
      const {block} = blockInfo
      const containerType = blockInfo.container.tagName.toLowerCase()
      
      if (this.isCursorAtEndOfElement(range, block)) {
        // At end - create new block in container
        const newBlockTag = block.tagName.toLowerCase()
        const newRange = document.createRange()
        const selection = window.getSelection()
        newRange.setStartAfter(block)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
        
        document.execCommand('insertHTML', false, `<${newBlockTag}><br></${newBlockTag}>`)
        
        // Position cursor in the new block
        const newBlock = block.nextElementSibling
        if (newBlock) {
          this.setCursorAtStart(newBlock)
        }
        
        return true
      }
      
      // In middle of content - let default behavior handle splitting
      return false
    },
    
    isCursorAtEndOfElement(range, element) {
      if (!range.collapsed) return false
      
      const container = range.startContainer
      const offset = range.startOffset
      
      const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
      )
      
      let totalLength = 0
      let currentPosition = 0
      let node
      
      while (node = walker.nextNode()) {
        if (node === container) {
          currentPosition = totalLength + offset
        }
        totalLength += node.textContent.length
      }
      
      return currentPosition === totalLength
    },

    handleEnter(range) {
      const container = range.commonAncestorContainer

      // Priority 1: Check if we're in an empty block (any block type)
      const emptyBlock = this.findEmptyBlock(container)
      if (emptyBlock) {
        return this.handleEmptyBlockEnter(emptyBlock)
      }

      // Priority 2: Check if we're at the end of an inline styled element
      if (this.isAtEndOfInlineElement(range)) {
        this.insertCleanNewLine()
        return true
      }

      // Priority 3: Check if we're in a container for new block creation
      const blockInContainer = this.findBlockInContainer(container)
      if (blockInContainer && blockInContainer.block.textContent.trim() !== '') {
        return this.handleNonEmptyBlockEnter(blockInContainer, range)
      }

      // Let default behavior handle normal cases
      return false
    },

    findEmptyStyledBlock(container) {
      // In markdown, blocks are flat - find the actual block element that needs conversion
      let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
      let foundBlock = null
      let containerElement = null

      // Walk up to find the innermost block element and its container
      while (currentElement && currentElement !== this.$refs.editor) {
        if (this.isBlockElement(currentElement)) {
          const blockType = this.getBlockType(currentElement)

          // The innermost block element is the actual markdown block
          if (!foundBlock) {
            foundBlock = currentElement
          }

          // Check if this block is inside a container (blockquote, ol, ul, pre)
          const parent = currentElement.parentElement
          if (parent && this.isContainerElement(parent)) {
            containerElement = parent
          }

          break // We found the innermost block, no need to continue
        }
        currentElement = currentElement.parentElement
      }

      // Only return if the block is empty and styled (not a plain paragraph in root)
      if (foundBlock && foundBlock.textContent.trim() === '') {
        const blockType = this.getBlockType(foundBlock)
        const hasContainer = containerElement !== null

        // If it's a styled block OR a paragraph inside a container, it needs conversion
        if (blockType !== 'paragraph' || hasContainer) {
          return {block: foundBlock, container: containerElement}
        }
      }

      return null
    },

    handleEmptyBlockEnter(blockInfo) {
      const {block, container} = blockInfo

      if (container) {
        // Block is inside a container - split or exit the container
        return this.splitOrExitContainer(block, container)
      } else {
        // Block is not in a container - reset to paragraph
        return this.resetBlockToParagraph(block)
      }
    },

    handleListItemEnter(parentLi) {
      const listContainer = parentLi.parentElement
      const isOrderedList = listContainer.tagName === 'OL'

      if (parentLi.textContent.trim() === '') {
        // Break out of the list using execCommand
        const remainingItems = []
        let nextSibling = parentLi.nextElementSibling

        // Collect remaining items
        while (nextSibling) {
          const temp = nextSibling.nextElementSibling
          remainingItems.push(nextSibling.cloneNode(true))
          nextSibling.remove()
          nextSibling = temp
        }

        // Remove empty list item
        parentLi.remove()

        // Create paragraph and remaining list using execCommand
        let htmlToInsert = '<p><br></p>'
        if (remainingItems.length > 0) {
          const listTag = isOrderedList ? 'ol' : 'ul'
          htmlToInsert += `<${listTag}>`
          remainingItems.forEach(item => {
            htmlToInsert += item.outerHTML
          })
          htmlToInsert += `</${listTag}>`
        }

        document.execCommand('insertHTML', false, htmlToInsert)
        return true
      } else {
        // Create new list item using execCommand
        document.execCommand('insertHTML', false, '<li></li>')
        return true
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
          const handled = this.handleEnter(range)
          if (handled) {
            event.preventDefault()
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