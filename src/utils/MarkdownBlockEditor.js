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

  isInlineStyleElement(element) {
    const inlineTags = ['STRONG', 'EM', 'B', 'I', 'CODE', 'U', 'S']
    if (inlineTags.includes(element.tagName)) return true

    // Check for spans with inline styling
    if (element.tagName === 'SPAN' && element.hasAttribute('style')) {
      return this.hasInlineStyles(element.getAttribute('style'))
    }

    return false
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

  // ========== SELECTION & CURSOR UTILITIES ==========
  
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

  setCursorAtStart(element) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStart(element, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

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
  }

  // ========== POSITION CHECKING ==========
  
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

  isAtEndOfInlineElement() {
    const context = this.getCursorContext()
    if (!context || !context.collapsed) return false

    const { container, offset } = context

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset !== container.textContent.length) return false

      let parent = container.parentElement
      while (parent && parent !== this.editor) {
        if (this.isInlineStyleElement(parent)) {
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

  // ========== BLOCK NAVIGATION ==========
  
  getPreviousBlockElement(element) {
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
    
    return null
  }

  // ========== CONTENT EXTRACTION ==========
  
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
      'font-weight: 600',
      'font-weight: bold',
      'font-weight: 700',
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

  // ========== DOM OPERATIONS ==========
  
  executeCommand(command, value = null) {
    if (this.useExecCommandOnly) {
      return document.execCommand(command, false, value)
    }
    // Direct DOM manipulation fallbacks handled in individual methods
    return false
  }

  insertHTML(html) {
    return this.executeCommand('insertHTML', html)
  }

  deleteSelection() {
    return this.executeCommand('delete')
  }

  // ========== BLOCK OPERATIONS - CORE LOGIC FROM LEGACY ==========
  
  resetBlockToParagraph(blockElement) {
    const p = document.createElement('p')
    p.innerHTML = blockElement.innerHTML || '<br>'
    
    if (this.useExecCommandOnly) {
      // Use execCommand approach - store parent before deletion
      const parent = blockElement.parentElement
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNode(blockElement)
      selection.removeAllRanges()
      selection.addRange(range)
      
      this.insertHTML(p.outerHTML)
      
      // Find the newly inserted paragraph and position cursor
      // The paragraph should be at the selection position after insertHTML
      const context = this.getCursorContext()
      if (context) {
        let element = context.container.nodeType === Node.TEXT_NODE ? 
          context.container.parentElement : context.container
        
        // Walk up to find the paragraph
        while (element && element !== this.editor) {
          if (element.tagName === 'P') {
            this.setCursorAtStart(element)
            break
          }
          element = element.parentElement
        }
      }
    } else {
      // Direct DOM manipulation
      blockElement.parentNode.replaceChild(p, blockElement)
      this.setCursorAtStart(p)
    }
    
    return true
  }

  exitContainer(blockElement, container) {
    this.log('exitContainer', { block: blockElement.tagName, container: container.tagName })
    
    const content = this.extractInlineContent(blockElement)
    const newParagraph = document.createElement('p')
    newParagraph.innerHTML = content || '<br>'
    
    // Collect remaining items after the block
    const remainingItems = []
    let nextItem = blockElement.nextElementSibling
    while (nextItem) {
      remainingItems.push(nextItem.cloneNode(true))
      const temp = nextItem.nextElementSibling
      if (this.useExecCommandOnly) {
        // Use execCommand to remove
        const range = document.createRange()
        const selection = window.getSelection()
        range.selectNode(nextItem)
        selection.removeAllRanges()
        selection.addRange(range)
        this.deleteSelection()
      } else {
        nextItem.remove()
      }
      nextItem = temp
    }
    
    // Remove the current block
    if (this.useExecCommandOnly) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNode(blockElement)
      selection.removeAllRanges()
      selection.addRange(range)
      this.deleteSelection()
    } else {
      blockElement.remove()
    }
    
    // Insert new paragraph after container
    if (this.useExecCommandOnly) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStartAfter(container)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      
      this.insertHTML(newParagraph.outerHTML)
      
      // Create new container with remaining items if needed
      if (remainingItems.length > 0) {
        const newContainer = document.createElement(container.tagName)
        remainingItems.forEach(item => newContainer.appendChild(item))
        
        const insertedP = container.nextElementSibling
        if (insertedP) {
          range.setStartAfter(insertedP)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
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
      if (this.useExecCommandOnly) {
        const range = document.createRange()
        const selection = window.getSelection()
        range.selectNode(container)
        selection.removeAllRanges()
        selection.addRange(range)
        this.deleteSelection()
      } else {
        container.remove()
      }
    }
    
    // Position cursor in new paragraph
    const insertedP = this.editor.querySelector('p:last-of-type')
    if (insertedP) {
      this.setCursorAtStart(insertedP)
    }
    
    return true
  }

  splitContainer(blockElement, container) {
    const containerType = container.tagName.toLowerCase()
    
    // Collect elements after the block
    const remainingElements = []
    let nextSibling = blockElement.nextElementSibling
    while (nextSibling) {
      remainingElements.push(nextSibling.cloneNode(true))
      const temp = nextSibling.nextElementSibling
      if (this.useExecCommandOnly) {
        const range = document.createRange()
        const selection = window.getSelection()
        range.selectNode(nextSibling)
        selection.removeAllRanges()
        selection.addRange(range)
        this.deleteSelection()
      } else {
        nextSibling.remove()
      }
      nextSibling = temp
    }
    
    // Remove the empty block
    if (this.useExecCommandOnly) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNode(blockElement)
      selection.removeAllRanges()
      selection.addRange(range)
      this.deleteSelection()
    } else {
      blockElement.remove()
    }
    
    // Create new paragraph
    if (this.useExecCommandOnly) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStartAfter(container)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      
      this.insertHTML('<p><br></p>')
      
      // Create new container with remaining elements
      if (remainingElements.length > 0) {
        const newContainer = document.createElement(containerType)
        remainingElements.forEach(element => newContainer.appendChild(element))
        
        const insertedP = container.nextElementSibling
        if (insertedP) {
          range.setStartAfter(insertedP)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
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

  mergeWithPrevious(blockElement) {
    this.log('mergeWithPrevious', { 
      block: blockElement.tagName, 
      parent: blockElement.parentElement.tagName 
    })
    
    const previousElement = this.getPreviousBlockElement(blockElement)
    if (!previousElement) {
      this.log('mergeWithPrevious: no previous element found')
      return false
    }
    
    const previousType = this.getBlockType(previousElement)
    const previousContainer = previousElement.parentElement
    const currentContainer = blockElement.parentElement
    
    // Allow merging in these cases - same as legacy logic
    const canMerge = (
      (previousContainer === currentContainer) || 
      (!this.isContainerElement(previousContainer) && !this.isContainerElement(currentContainer)) || 
      (this.isContainerElement(previousContainer) && !this.isContainerElement(currentContainer))
    )
    
    if (!canMerge) {
      this.log('mergeWithPrevious: cannot merge')
      return false
    }
    
    // Check if this is cross-container merging (root element into container)
    const isCrossContainerMerge = this.isContainerElement(previousContainer) && !this.isContainerElement(currentContainer)
    
    if ((previousType === 'paragraph' || previousType === 'heading') && !isCrossContainerMerge) {
      // Direct merge with paragraph/heading at same level
      const cursorPosition = previousElement.textContent.length
      const currentContent = this.extractInlineContent(blockElement)
      
      // Position cursor at end of previous element
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(previousElement, previousElement.childNodes.length)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      
      // Insert content using execCommand
      if (this.useExecCommandOnly) {
        this.insertHTML(currentContent)
      } else {
        previousElement.innerHTML += currentContent
      }
      
      // Remove current block
      const blockContainer = blockElement.parentElement
      if (this.useExecCommandOnly) {
        const deleteRange = document.createRange()
        deleteRange.selectNode(blockElement)
        selection.removeAllRanges()
        selection.addRange(deleteRange)
        this.deleteSelection()
      } else {
        blockElement.remove()
      }
      
      // Clean up empty container
      if (this.isContainerElement(blockContainer) && blockContainer.children.length === 0) {
        if (this.useExecCommandOnly) {
          const deleteRange = document.createRange()
          deleteRange.selectNode(blockContainer)
          selection.removeAllRanges()
          selection.addRange(deleteRange)
          this.deleteSelection()
        } else {
          blockContainer.remove()
        }
      }
      
      // Position cursor at merge point
      this.setCursorPosition(previousElement, cursorPosition)
      return true
    } else if (blockElement.tagName === 'P' && !this.isContainerElement(blockElement.parentElement)) {
      // Root-level paragraph merging into container - complex logic from legacy
      const hasContent = blockElement.textContent.trim() !== '' && blockElement.innerHTML !== '<br>'
      
      if (hasContent) {
        // Non-empty paragraph - merge into last block of previous container
        const previousContainer = previousElement.parentElement
        const lastChild = previousContainer.lastElementChild
        
        if (lastChild && this.isBlockElement(lastChild)) {
          const cursorPosition = lastChild.textContent.length
          const currentContent = this.extractInlineContent(blockElement)
          
          // Position cursor at end of last child in container
          const range = document.createRange()
          const selection = window.getSelection()
          range.setStart(lastChild, lastChild.childNodes.length)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          
          // Insert content
          if (this.useExecCommandOnly) {
            this.insertHTML(currentContent)
          } else {
            lastChild.innerHTML += currentContent
          }
          
          // Remove current block
          if (this.useExecCommandOnly) {
            const deleteRange = document.createRange()
            deleteRange.selectNode(blockElement)
            selection.removeAllRanges()
            selection.addRange(deleteRange)
            this.deleteSelection()
          } else {
            blockElement.remove()
          }
          
          // Position cursor
          this.setCursorPosition(lastChild, cursorPosition)
          return true
        }
      } else {
        // Empty paragraph - try container merging
        this.mergeAdjacentContainers(blockElement)
        return true
      }
    }
    
    return false
  }

  mergeAdjacentContainers(referenceElement, preserveSplit = false) {
    if (preserveSplit) return
    
    const current = referenceElement
    
    // Only consider root-level empty paragraphs
    if (current.tagName !== 'P' || 
        this.isContainerElement(current.parentElement) ||
        (current.textContent.trim() !== '' && current.innerHTML !== '<br>')) {
      return
    }
    
    const prevSibling = current.previousElementSibling
    const nextSibling = current.nextElementSibling
    
    // Check for same-type containers
    if (prevSibling && nextSibling &&
        this.isContainerElement(prevSibling) && 
        this.isContainerElement(nextSibling) &&
        prevSibling.tagName === nextSibling.tagName) {
      
      const originalLastChildOfFirst = prevSibling.lastElementChild
      
      // Move all children from nextSibling to prevSibling
      while (nextSibling.firstChild) {
        prevSibling.appendChild(nextSibling.firstChild)
      }
      
      // Remove empty paragraph and second container
      if (this.useExecCommandOnly) {
        let range = document.createRange()
        const selection = window.getSelection()
        range.selectNode(current)
        selection.removeAllRanges()
        selection.addRange(range)
        this.deleteSelection()
        
        range = document.createRange()
        range.selectNode(nextSibling)
        selection.removeAllRanges()
        selection.addRange(range)
        this.deleteSelection()
      } else {
        current.remove()
        nextSibling.remove()
      }
      
      // Position cursor at merge boundary
      if (originalLastChildOfFirst && this.isBlockElement(originalLastChildOfFirst)) {
        this.setCursorPosition(originalLastChildOfFirst, originalLastChildOfFirst.textContent.length)
      }
    }
  }

  // ========== MAIN HANDLERS ==========
  
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
    
    const blockElement = blockStart.blockElement
    const blockType = this.getBlockType(blockElement)
    const container = blockElement.parentElement
    const isInContainer = this.isContainerElement(container)
    
    this.log('Block context', { blockType, isInContainer })
    
    // Handle based on context - following legacy logic exactly
    if (isInContainer) {
      // Exit container
      return this.exitContainer(blockElement, container)
    } else if (blockType === 'paragraph') {
      // Try to merge with previous
      return this.mergeWithPrevious(blockElement)
    } else {
      // Reset styled block to paragraph
      return this.resetBlockToParagraph(blockElement)
    }
  }

  handleEnter() {
    this.log('handleEnter')
    
    const context = this.getCursorContext()
    if (!context) return false
    
    const container = context.range.commonAncestorContainer
    
    // Priority 1: Check if we're in an empty block
    const emptyBlock = this.findEmptyBlock(container)
    if (emptyBlock) {
      return this.handleEmptyBlockEnter(emptyBlock)
    }
    
    // Priority 2: End of inline element
    if (this.isAtEndOfInlineElement()) {
      this.log('At end of inline element')
      return this.insertHTML('<p><br></p>')
    }
    
    // Priority 3: Non-empty block in container at end
    const blockInContainer = this.findBlockInContainer(container)
    if (blockInContainer && blockInContainer.block.textContent.trim() !== '') {
      return this.handleNonEmptyBlockEnter(blockInContainer, context.range)
    }
    
    // Let browser handle default cases
    return false
  }
  
  findEmptyBlock(container) {
    let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
    let foundBlock = null
    let containerElement = null

    while (currentElement && currentElement !== this.editor) {
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
        return { block: foundBlock, container: containerElement }
      }
    }

    return null
  }
  
  findBlockInContainer(container) {
    let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
    let foundBlock = null
    let containerElement = null

    while (currentElement && currentElement !== this.editor) {
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
      return { block: foundBlock, container: containerElement }
    }

    return null
  }
  
  handleEmptyBlockEnter(blockInfo) {
    const { block, container } = blockInfo

    if (container) {
      // Split or exit container
      const isLastChild = !block.nextElementSibling
      if (isLastChild) {
        return this.exitContainer(block, container)
      } else {
        return this.splitContainer(block, container)
      }
    } else {
      // Reset to paragraph
      return this.resetBlockToParagraph(block)
    }
  }
  
  handleNonEmptyBlockEnter(blockInfo, range) {
    const { block } = blockInfo
    
    if (this.isAtEndOfElement(block)) {
      this.log('At end of block in container')
      const newBlockTag = block.tagName.toLowerCase()
      
      const newRange = document.createRange()
      const selection = window.getSelection()
      newRange.setStartAfter(block)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      
      if (this.useExecCommandOnly) {
        this.insertHTML(`<${newBlockTag}><br></${newBlockTag}>`)
      } else {
        const newBlock = document.createElement(newBlockTag)
        newBlock.innerHTML = '<br>'
        block.parentNode.insertBefore(newBlock, block.nextSibling)
      }
      
      // Position cursor in new block
      const newBlock = block.nextElementSibling
      if (newBlock) {
        this.setCursorAtStart(newBlock)
      }
      
      return true
    }
    
    return false
  }

  handleTab() {
    if (this.useExecCommandOnly) {
      this.insertHTML('&nbsp;&nbsp;&nbsp;&nbsp;')
    } else {
      // Direct insertion
      const selection = window.getSelection()
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const textNode = document.createTextNode('\u00A0\u00A0\u00A0\u00A0') // Non-breaking spaces
        range.insertNode(textNode)
        range.setStartAfter(textNode)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    return true
  }
}