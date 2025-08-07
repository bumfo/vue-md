/**
 * MarkdownBlockEditor - Encapsulates markdown block logic, DOM manipulation, and execCommand operations
 * 
 * This class provides a unified abstraction for markdown editing operations,
 * handling the mapping between markdown semantics and HTML DOM operations.
 */
export default class MarkdownBlockEditor {
  constructor(editorElement, options = {}) {
    this.editor = editorElement
    this.useExecCommandOnly = options.useExecCommandOnly !== false // Default to true
    this.debug = options.debug || false
  }

  // ========== LOGGING ==========
  
  log(...args) {
    if (this.debug) {
      console.log('[MarkdownBlockEditor]', ...args)
    }
  }

  // ========== ELEMENT TYPE CHECKING ==========
  
  isBlockElement(element) {
    const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']
    return element && blockTags.includes(element.tagName)
  }

  isContainerElement(element) {
    const containerTags = ['BLOCKQUOTE', 'OL', 'UL', 'PRE']
    return element && containerTags.includes(element.tagName)
  }

  isInlineElement(element) {
    const inlineTags = ['STRONG', 'EM', 'B', 'I', 'CODE', 'U', 'S', 'SPAN']
    return element && inlineTags.includes(element.tagName)
  }

  getBlockType(element) {
    if (!element) return 'unknown'
    const tag = element.tagName
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return 'heading'
    if (tag === 'BLOCKQUOTE') return 'blockquote'
    if (tag === 'PRE') return 'codeblock'
    if (tag === 'LI') return 'listitem'
    if (tag === 'P') return 'paragraph'
    return 'unknown'
  }

  // ========== SELECTION & RANGE UTILITIES ==========
  
  /**
   * Get current cursor context
   * @returns {Object|null} Cursor context with selection, range, and position info
   */
  getCursorContext() {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    
    const range = selection.getRangeAt(0)
    return {
      selection,
      range,
      collapsed: range.collapsed,
      container: range.startContainer,
      offset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset
    }
  }

  /**
   * Set cursor at the start of an element
   */
  setCursorAtStart(element) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStart(element, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /**
   * Set cursor at a specific text position within an element
   */
  setCursorAtPosition(element, position) {
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
  }

  /**
   * Position cursor after a specific node
   */
  setCursorAfter(node) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /**
   * Select an entire node
   */
  selectNode(node) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.selectNode(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  // ========== POSITION CHECKING ==========
  
  /**
   * Check if cursor is at the start of a block element
   */
  isAtBlockStart(container, offset) {
    if (offset !== 0) return { atStart: false }

    let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container

    while (element && element !== this.editor) {
      if (this.isBlockElement(element)) {
        const textBefore = this.getTextBeforeCursor(element, container, offset)
        return {
          atStart: textBefore === '',
          blockElement: element
        }
      }
      element = element.parentElement
    }

    return { atStart: false }
  }

  /**
   * Get text content before cursor position
   */
  getTextBeforeCursor(blockElement, container, offset) {
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
  }

  /**
   * Check if cursor is at the end of an element
   */
  isAtEndOfElement(element) {
    const context = this.getCursorContext()
    if (!context || !context.collapsed) return false
    
    const { container, offset } = context
    
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
  }

  /**
   * Check if at end of inline element
   */
  isAtEndOfInlineElement() {
    const context = this.getCursorContext()
    if (!context || !context.collapsed) return false

    const { container, offset } = context

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset !== container.textContent.length) return false

      let parent = container.parentElement
      while (parent && parent !== this.editor) {
        if (this.isInlineElement(parent)) {
          // Check if this is the last text in the inline element
          const walker = document.createTreeWalker(
            parent,
            NodeFilter.SHOW_TEXT,
            null,
            false
          )
          
          let lastTextNode = null
          let node
          while (node = walker.nextNode()) {
            lastTextNode = node
          }
          
          return container === lastTextNode
        }
        if (this.isBlockElement(parent)) break
        parent = parent.parentElement
      }
    }

    return false
  }

  // ========== BLOCK CONTEXT & NAVIGATION ==========
  
  /**
   * Find the block context for the current cursor position
   */
  findBlockContext(startNode = null) {
    const context = startNode ? { container: startNode } : this.getCursorContext()
    if (!context) return null

    let currentElement = context.container.nodeType === Node.TEXT_NODE 
      ? context.container.parentElement 
      : context.container
    
    let foundBlock = null
    let containerElement = null

    while (currentElement && currentElement !== this.editor) {
      if (this.isBlockElement(currentElement)) {
        foundBlock = currentElement
        
        const parent = currentElement.parentElement
        if (parent && this.isContainerElement(parent)) {
          containerElement = parent
        }
        break
      }
      currentElement = currentElement.parentElement
    }

    if (foundBlock) {
      return {
        block: foundBlock,
        container: containerElement,
        blockType: this.getBlockType(foundBlock),
        isEmpty: foundBlock.textContent.trim() === '',
        isInContainer: containerElement !== null,
        isLastInContainer: containerElement && !foundBlock.nextElementSibling
      }
    }

    return null
  }

  /**
   * Get the previous block element (handles nested containers)
   */
  getPreviousBlock(element) {
    let prev = element.previousElementSibling
    
    while (prev) {
      if (this.isBlockElement(prev)) {
        return prev
      } else if (this.isContainerElement(prev)) {
        // Return the last block inside the container
        const lastChild = prev.lastElementChild
        if (lastChild && this.isBlockElement(lastChild)) {
          return lastChild
        }
      }
      prev = prev.previousElementSibling
    }
    
    // Check parent's previous sibling if in a container
    const parent = element.parentElement
    if (this.isContainerElement(parent)) {
      const parentPrev = parent.previousElementSibling
      if (parentPrev) {
        if (this.isBlockElement(parentPrev)) {
          return parentPrev
        } else if (this.isContainerElement(parentPrev)) {
          const lastChild = parentPrev.lastElementChild
          if (lastChild && this.isBlockElement(lastChild)) {
            return lastChild
          }
        }
      }
    }
    
    return null
  }

  // ========== CONTENT EXTRACTION ==========
  
  /**
   * Extract inline content from a block, removing block-level styling
   */
  extractInlineContent(element) {
    const clone = element.cloneNode(true)
    
    // Remove block-level styling from spans
    const spans = clone.querySelectorAll('span[style]')
    spans.forEach(span => {
      const style = span.getAttribute('style')
      if (this.isBlockLevelStyling(style)) {
        // Unwrap span but keep content
        const parent = span.parentNode
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span)
        }
        parent.removeChild(span)
      }
    })
    
    return clone.innerHTML
  }

  isBlockLevelStyling(styleString) {
    if (!styleString) return false

    const blockStyles = [
      'font-size',
      'margin',
      'padding',
      'border',
      'color: rgb(106, 115, 125)', // blockquote color
      'line-height'
    ]

    const hasBlockStyle = blockStyles.some(style => styleString.includes(style))
    const hasInlineStyle = this.hasInlineStyles(styleString)
    
    return hasBlockStyle && !hasInlineStyle
  }

  hasInlineStyles(styleString) {
    const inlineStyles = [
      'font-weight: bold',
      'font-weight: 600',
      'font-weight: 700',
      'font-style: italic',
      'text-decoration: underline',
      'text-decoration: line-through'
    ]

    return inlineStyles.some(style => styleString.includes(style))
  }

  // ========== EXECCOMMAND OPERATIONS ==========
  
  /**
   * Execute a command with optional fallback to direct DOM manipulation
   */
  executeCommand(command, value = null) {
    if (this.useExecCommandOnly) {
      return document.execCommand(command, false, value)
    }
    // Could implement direct DOM manipulation fallbacks here
    return false
  }

  /**
   * Insert HTML at current cursor position
   */
  insertHTML(html) {
    return this.executeCommand('insertHTML', html)
  }

  /**
   * Delete current selection
   */
  deleteSelection() {
    return this.executeCommand('delete')
  }

  /**
   * Format current block
   */
  formatBlock(tagName) {
    return this.executeCommand('formatBlock', tagName)
  }

  // ========== BLOCK OPERATIONS ==========
  
  /**
   * Replace a block element with a new one
   */
  replaceBlock(oldBlock, newBlock) {
    if (this.useExecCommandOnly) {
      this.selectNode(oldBlock)
      return this.insertHTML(newBlock.outerHTML)
    } else {
      oldBlock.parentNode.replaceChild(newBlock, oldBlock)
      return true
    }
  }

  /**
   * Remove a block element
   */
  removeBlock(block) {
    if (this.useExecCommandOnly) {
      this.selectNode(block)
      return this.deleteSelection()
    } else {
      block.remove()
      return true
    }
  }

  /**
   * Reset a styled block to paragraph
   */
  resetBlockToParagraph(block) {
    const p = document.createElement('p')
    p.innerHTML = block.innerHTML || '<br>'
    this.replaceBlock(block, p)
    this.setCursorAtStart(p)
    return true
  }

  /**
   * Exit a block from its container
   */
  exitContainer(block, container) {
    this.log('exitContainer', { block: block.tagName, container: container.tagName })
    
    const content = this.extractInlineContent(block)
    const newParagraph = document.createElement('p')
    newParagraph.innerHTML = content || '<br>'
    
    // Collect remaining items after the block
    const remainingItems = []
    let nextItem = block.nextElementSibling
    while (nextItem) {
      remainingItems.push(nextItem.cloneNode(true))
      const temp = nextItem.nextElementSibling
      this.removeBlock(nextItem)
      nextItem = temp
    }
    
    // Remove the current block
    this.removeBlock(block)
    
    // Insert new paragraph after container
    if (this.useExecCommandOnly) {
      this.setCursorAfter(container)
      this.insertHTML(newParagraph.outerHTML)
      
      // Create new container with remaining items if needed
      if (remainingItems.length > 0) {
        const newContainer = document.createElement(container.tagName)
        remainingItems.forEach(item => newContainer.appendChild(item))
        
        const insertedP = container.nextElementSibling
        if (insertedP) {
          this.setCursorAfter(insertedP)
          this.insertHTML(newContainer.outerHTML)
        }
      }
    } else {
      container.parentNode.insertBefore(newParagraph, container.nextSibling)
      
      if (remainingItems.length > 0) {
        const newContainer = document.createElement(container.tagName)
        remainingItems.forEach(item => newContainer.appendChild(item))
        newParagraph.parentNode.insertBefore(newContainer, newParagraph.nextSibling)
      }
    }
    
    // Clean up empty container
    if (container.children.length === 0) {
      this.removeBlock(container)
    }
    
    // Position cursor in new paragraph
    const insertedP = this.editor.querySelector('p:last-of-type')
    if (insertedP) {
      this.setCursorAtStart(insertedP)
    }
    
    return true
  }

  /**
   * Split a container at the current block position
   */
  splitContainer(block, container) {
    const containerType = container.tagName.toLowerCase()
    
    // Collect elements after the block
    const remainingElements = []
    let nextSibling = block.nextElementSibling
    while (nextSibling) {
      remainingElements.push(nextSibling.cloneNode(true))
      const temp = nextSibling.nextElementSibling
      this.removeBlock(nextSibling)
      nextSibling = temp
    }
    
    // Remove the empty block
    this.removeBlock(block)
    
    // Create new paragraph
    if (this.useExecCommandOnly) {
      this.setCursorAfter(container)
      this.insertHTML('<p><br></p>')
      
      // Create new container with remaining elements
      if (remainingElements.length > 0) {
        const newContainer = document.createElement(containerType)
        remainingElements.forEach(element => newContainer.appendChild(element))
        
        const insertedP = container.nextElementSibling
        if (insertedP) {
          this.setCursorAfter(insertedP)
          this.insertHTML(newContainer.outerHTML)
        }
      }
      
      // Position cursor
      const insertedP = container.nextElementSibling
      if (insertedP) {
        this.setCursorAtStart(insertedP)
      }
    } else {
      const newParagraph = document.createElement('p')
      newParagraph.innerHTML = '<br>'
      container.parentNode.insertBefore(newParagraph, container.nextSibling)
      
      if (remainingElements.length > 0) {
        const newContainer = document.createElement(containerType)
        remainingElements.forEach(element => newContainer.appendChild(element))
        newParagraph.parentNode.insertBefore(newContainer, newParagraph.nextSibling)
      }
      
      this.setCursorAtStart(newParagraph)
    }
    
    return true
  }

  /**
   * Merge current block with previous block
   */
  mergeWithPrevious(currentBlock, previousBlock) {
    this.log('mergeWithPrevious', { 
      current: currentBlock.tagName, 
      previous: previousBlock.tagName 
    })
    
    const cursorPosition = previousBlock.textContent.length
    const content = this.extractInlineContent(currentBlock)
    
    // Position at end of previous block
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStart(previousBlock, previousBlock.childNodes.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    
    // Insert content
    this.insertHTML(content)
    
    // Remove current block
    const currentContainer = currentBlock.parentElement
    this.removeBlock(currentBlock)
    
    // Clean up empty container
    if (this.isContainerElement(currentContainer) && 
        currentContainer.children.length === 0) {
      this.removeBlock(currentContainer)
    }
    
    // Position cursor at merge point
    this.setCursorAtPosition(previousBlock, cursorPosition)
    
    return true
  }

  /**
   * Check and merge adjacent containers with empty paragraph between them
   */
  mergeAdjacentContainers(paragraph, preserveSplit = false) {
    if (preserveSplit) return
    
    // Only process root-level empty paragraphs
    if (paragraph.tagName !== 'P' || 
        this.isContainerElement(paragraph.parentElement) ||
        (paragraph.textContent.trim() !== '' && paragraph.innerHTML !== '<br>')) {
      return
    }
    
    const prev = paragraph.previousElementSibling
    const next = paragraph.nextElementSibling
    
    // Check for same-type containers
    if (prev && next &&
        this.isContainerElement(prev) && 
        this.isContainerElement(next) &&
        prev.tagName === next.tagName) {
      
      const lastChildOfFirst = prev.lastElementChild
      
      // Move all children from next to prev
      while (next.firstChild) {
        prev.appendChild(next.firstChild)
      }
      
      // Remove empty paragraph and second container
      this.removeBlock(paragraph)
      this.removeBlock(next)
      
      // Position cursor at merge boundary
      if (lastChildOfFirst && this.isBlockElement(lastChildOfFirst)) {
        this.setCursorAtPosition(lastChildOfFirst, lastChildOfFirst.textContent.length)
      }
      
      return true
    }
    
    return false
  }

  // ========== KEY HANDLERS ==========
  
  /**
   * Handle backspace key
   * @returns {boolean} Whether the event was handled
   */
  handleBackspace() {
    this.log('handleBackspace')
    
    const context = this.getCursorContext()
    if (!context) return false
    
    // Let browser handle range selections
    if (!context.collapsed) {
      this.log('Range selection, letting browser handle')
      return false
    }
    
    // Check if at block start
    const blockStart = this.isAtBlockStart(context.container, context.offset)
    if (!blockStart.atStart) {
      this.log('Not at block start')
      return false
    }
    
    const blockContext = this.findBlockContext(blockStart.blockElement)
    if (!blockContext) return false
    
    this.log('Block context', blockContext)
    
    // Handle based on context
    if (blockContext.isInContainer) {
      // Exit container
      return this.exitContainer(blockContext.block, blockContext.container)
    } else if (blockContext.blockType === 'paragraph') {
      // Try to merge with previous
      const previousBlock = this.getPreviousBlock(blockContext.block)
      if (previousBlock) {
        const success = this.mergeWithPrevious(blockContext.block, previousBlock)
        
        // Check for container merging after merge
        if (success) {
          const prevContainer = previousBlock.parentElement
          if (this.isContainerElement(prevContainer)) {
            const nextSibling = prevContainer.nextElementSibling
            if (nextSibling && nextSibling.tagName === 'P') {
              this.mergeAdjacentContainers(nextSibling)
            }
          }
        }
        
        return success
      }
    } else {
      // Reset styled block to paragraph
      return this.resetBlockToParagraph(blockContext.block)
    }
    
    return false
  }

  /**
   * Handle enter key
   * @returns {boolean} Whether the event was handled
   */
  handleEnter() {
    this.log('handleEnter')
    
    const context = this.getCursorContext()
    if (!context) return false
    
    const blockContext = this.findBlockContext()
    if (!blockContext) return false
    
    this.log('Block context', blockContext)
    
    // Priority 1: Empty block handling
    if (blockContext.isEmpty) {
      if (blockContext.isInContainer) {
        if (blockContext.isLastInContainer) {
          // Exit container
          return this.exitContainer(blockContext.block, blockContext.container)
        } else {
          // Split container
          return this.splitContainer(blockContext.block, blockContext.container)
        }
      } else if (blockContext.blockType !== 'paragraph') {
        // Reset styled block to paragraph
        return this.resetBlockToParagraph(blockContext.block)
      }
    }
    
    // Priority 2: End of inline element
    if (this.isAtEndOfInlineElement()) {
      this.log('At end of inline element')
      return this.insertHTML('<p><br></p>')
    }
    
    // Priority 3: Non-empty block in container at end
    if (blockContext.isInContainer && !blockContext.isEmpty) {
      if (this.isAtEndOfElement(blockContext.block)) {
        this.log('At end of block in container')
        const newBlockTag = blockContext.block.tagName.toLowerCase()
        
        this.setCursorAfter(blockContext.block)
        this.insertHTML(`<${newBlockTag}><br></${newBlockTag}>`)
        
        // Position cursor in new block
        const newBlock = blockContext.block.nextElementSibling
        if (newBlock) {
          this.setCursorAtStart(newBlock)
        }
        
        return true
      }
    }
    
    // Let browser handle default cases
    return false
  }

  /**
   * Handle tab key
   * @returns {boolean} Whether the event was handled
   */
  handleTab() {
    this.insertHTML('&nbsp;&nbsp;&nbsp;&nbsp;')
    return true
  }
}