/**
 * MarkdownBlockModel - Markdown-aware semantic block abstraction
 * 
 * This layer provides markdown semantic understanding following the flat structure
 * principle where containers are transparent and only leaf blocks are considered.
 */
export default class MarkdownBlockModel {
  constructor(editorElement, domOps) {
    this.editor = editorElement
    this.dom = domOps
  }

  // ========== Block Type Constants ==========

  static BLOCK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']
  static CONTAINER_TAGS = ['BLOCKQUOTE', 'OL', 'UL', 'PRE']
  static INLINE_TAGS = ['STRONG', 'EM', 'B', 'I', 'CODE', 'U', 'S']

  // ========== Block Identification ==========

  isBlockElement(element) {
    return element && MarkdownBlockModel.BLOCK_TAGS.includes(element.tagName)
  }

  isContainerElement(element) {
    return element && MarkdownBlockModel.CONTAINER_TAGS.includes(element.tagName)
  }

  isInlineStyleElement(element) {
    if (!element) return false
    
    if (MarkdownBlockModel.INLINE_TAGS.includes(element.tagName)) {
      return true
    }

    // Check for spans with inline styling
    if (element.tagName === 'SPAN' && element.hasAttribute('style')) {
      return this.hasInlineStyles(element.getAttribute('style'))
    }

    return false
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

  identifyBlock(element) {
    if (!element) return null
    
    const tag = element.tagName
    const parent = element.parentElement
    
    let type = 'unknown'
    let level = null
    
    if (tag === 'P') type = 'paragraph'
    else if (tag === 'LI') type = 'list-item'
    else if (tag.match(/^H([1-6])$/)) {
      type = 'heading'
      level = parseInt(tag[1])
    }
    
    return {
      type,
      level,
      element,
      container: this.isContainerElement(parent) ? parent : null,
      containerType: this.isContainerElement(parent) ? parent.tagName.toLowerCase() : null
    }
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

  // ========== Block Traversal (Container-Transparent) ==========

  getPreviousBlock(block) {
    let prev = this.dom.getPreviousSibling(block)

    while (prev) {
      if (this.isBlockElement(prev)) {
        return prev
      } else if (this.isContainerElement(prev)) {
        // Return the last block inside the container
        const lastChild = this.dom.getLastChild(prev)
        if (lastChild && this.isBlockElement(lastChild)) {
          return lastChild
        }
      }
      prev = this.dom.getPreviousSibling(prev)
    }

    return null
  }

  getNextBlock(block) {
    let next = this.dom.getNextSibling(block)

    while (next) {
      if (this.isBlockElement(next)) {
        return next
      } else if (this.isContainerElement(next)) {
        // Return the first block inside the container
        const firstChild = this.dom.getFirstChild(next)
        if (firstChild && this.isBlockElement(firstChild)) {
          return firstChild
        }
      }
      next = this.dom.getNextSibling(next)
    }

    return null
  }

  getBlockAtCaret() {
    const context = this.dom.getCursorContext()
    if (!context) return null

    let element = context.container.nodeType === Node.TEXT_NODE 
      ? context.container.parentElement 
      : context.container

    while (element && element !== this.editor) {
      if (this.isBlockElement(element)) {
        return this.identifyBlock(element)
      }
      element = this.dom.getParentElement(element)
    }

    return null
  }

  findBlockElement(container) {
    let element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container

    while (element && element !== this.editor) {
      if (this.isBlockElement(element)) {
        return element
      }
      element = this.dom.getParentElement(element)
    }

    return null
  }

  // ========== Block State Queries ==========

  isBlockEmpty(block) {
    if (!block) return true
    const text = this.dom.getTextContent(block).trim()
    const html = this.dom.getInnerHTML(block)
    return text === '' || html === '<br>'
  }

  isAtBlockStart(container, offset) {
    // Quick check: if we're in a text node and not at the start
    if (offset !== 0 && container.nodeType === Node.TEXT_NODE) {
      const textBefore = container.textContent.substring(0, offset)
      if (/[^ \n]/.test(textBefore)) return { atStart: false }
    }

    let element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container

    while (element && element !== this.editor) {
      if (this.isBlockElement(element)) {
        const textBefore = this.getTextBeforeCursor(element, container, offset)
        return {
          atStart: textBefore === '',
          blockElement: element
        }
      }
      element = this.dom.getParentElement(element)
    }

    return { atStart: false }
  }

  isAtBlockEnd(element) {
    const context = this.dom.getCursorContext()
    if (!context || !context.collapsed) return false

    const { container, offset } = context

    const walker = this.dom.createTreeWalker(element, NodeFilter.SHOW_TEXT)

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

  isAtEndOfInlineElement() {
    const context = this.dom.getCursorContext()
    if (!context || !context.collapsed) return false

    const { container, offset } = context

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset !== container.textContent.length) return false

      let parent = container.parentElement
      while (parent && parent !== this.editor) {
        if (this.isInlineStyleElement(parent)) {
          // Check if this is the last text in the inline element
          const walker = this.dom.createTreeWalker(parent, NodeFilter.SHOW_TEXT)

          let lastTextNode = null
          let node
          while (node = walker.nextNode()) {
            lastTextNode = node
          }

          return container === lastTextNode
        }
        if (this.isBlockElement(parent)) break
        parent = this.dom.getParentElement(parent)
      }
    }

    return false
  }

  getTextBeforeCursor(blockElement, container, offset) {
    if (container.nodeType === Node.ELEMENT_NODE && offset === 0) {
      return ''
    }

    const walker = this.dom.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT)

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

  getBlockContent(block) {
    if (!block) return { text: '', html: '' }
    
    return {
      text: this.dom.getTextContent(block),
      html: this.dom.getInnerHTML(block)
    }
  }

  // ========== Content Extraction ==========

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

  extractTextContent(htmlContent) {
    // Create a temporary element to parse the HTML
    const temp = this.dom.createElement('div')
    temp.innerHTML = htmlContent

    // Get the text content, which strips HTML but preserves text
    return temp.textContent || temp.innerText || ''
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

  // ========== Block Search ==========

  findEmptyBlock(container) {
    let currentElement = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container
    let foundBlock = null
    let containerElement = null

    while (currentElement && currentElement !== this.editor) {
      if (this.isBlockElement(currentElement)) {
        if (!foundBlock) {
          foundBlock = currentElement
        }

        const parent = this.dom.getParentElement(currentElement)
        if (parent && this.isContainerElement(parent)) {
          containerElement = parent
        }

        break
      }
      currentElement = this.dom.getParentElement(currentElement)
    }

    if (foundBlock && this.isBlockEmpty(foundBlock)) {
      const blockType = this.getBlockType(foundBlock)
      const hasContainer = containerElement !== null

      if (blockType !== 'paragraph' || hasContainer) {
        return { block: foundBlock, container: containerElement }
      }
    }

    return null
  }

  findBlockInContainer(container) {
    let currentElement = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container
    let foundBlock = null
    let containerElement = null

    while (currentElement && currentElement !== this.editor) {
      if (this.isBlockElement(currentElement)) {
        if (!foundBlock) {
          foundBlock = currentElement
        }

        const parent = this.dom.getParentElement(currentElement)
        if (parent && this.isContainerElement(parent)) {
          containerElement = parent
          break
        }
      }
      currentElement = this.dom.getParentElement(currentElement)
    }

    if (foundBlock && containerElement) {
      return { block: foundBlock, container: containerElement }
    }

    return null
  }
}