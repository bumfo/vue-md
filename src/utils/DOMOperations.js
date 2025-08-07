/**
 * DOMOperations - Low-level atomic operations for DOM manipulation
 * 
 * This layer provides direct interaction with browser APIs using execCommand
 * for all mutations to ensure native undo/redo support.
 */
export default class DOMOperations {
  constructor(editorElement) {
    this.editor = editorElement
  }

  // ========== ExecCommand Wrappers ==========

  executeCommand(command, value = null) {
    return document.execCommand(command, false, value)
  }

  insertHTML(html) {
    return this.executeCommand('insertHTML', html)
  }

  insertText(text) {
    return this.executeCommand('insertText', text)
  }

  deleteSelection() {
    return this.executeCommand('delete')
  }

  formatBlock(tag) {
    return this.executeCommand('formatBlock', tag)
  }

  outdent() {
    return this.executeCommand('outdent')
  }

  insertParagraph() {
    return this.executeCommand('insertParagraph')
  }

  // ========== Common Block Insertion Patterns ==========

  insertEmptyParagraph() {
    return this.insertHTML('<p><br></p>')
  }

  insertEmptyBlockOfType(blockTag) {
    return this.insertHTML(`<${blockTag}><br></${blockTag}>`)
  }

  insertBlockAfter(element, blockTag = 'p') {
    this.setCaretAfter(element)
    return this.insertEmptyBlockOfType(blockTag)
  }

  // ========== Block Conversion Patterns ==========

  convertBlockUsingFormatBlock(blockElement, newTag) {
    this.setCaretAtStart(blockElement)
    this.outdent()
    return this.formatBlock(newTag)
  }

  convertBlockToParagraph(blockElement) {
    return this.convertBlockUsingFormatBlock(blockElement, 'p')
  }

  // ========== Selection/Range Operations ==========

  getSelection() {
    return window.getSelection()
  }

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

  selectNode(node) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.selectNode(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  selectRange(startNode, startOffset, endNode, endOffset) {
    const range = document.createRange()
    const selection = window.getSelection()
    
    if (endNode && endOffset !== undefined) {
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)
    } else {
      range.setStart(startNode, startOffset)
      range.collapse(true)
    }
    
    selection.removeAllRanges()
    selection.addRange(range)
  }

  setCaretAfter(node) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  setCaretBefore(node) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStartBefore(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  setCaretAtStart(element) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStart(element, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  setCaretAtEnd(element) {
    const range = document.createRange()
    const selection = window.getSelection()
    range.setStart(element, element.childNodes.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  setCaretPosition(element, position) {
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

  getAbsoluteCaretPosition() {
    const selection = window.getSelection()
    if (selection.rangeCount === 0) return 0

    const range = selection.getRangeAt(0)
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(this.editor)
    preCaretRange.setEnd(range.startContainer, range.startOffset)

    return preCaretRange.toString().length
  }

  setAbsoluteCaretPosition(position) {
    const walker = document.createTreeWalker(
      this.editor,
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
      return true
    }
    return false
  }

  // ========== Pure DOM Traversal (No Mutations) ==========

  getTextContent(node) {
    return node.textContent || ''
  }

  getInnerHTML(node) {
    return node.innerHTML || ''
  }

  getParentElement(node) {
    return node.nodeType === Node.TEXT_NODE ? node.parentElement : node.parentElement
  }

  getNextSibling(node) {
    return node.nextElementSibling
  }

  getPreviousSibling(node) {
    return node.previousElementSibling
  }

  getFirstChild(node) {
    return node.firstElementChild
  }

  getLastChild(node) {
    return node.lastElementChild
  }

  getChildNodes(node) {
    return node.childNodes
  }

  getTagName(element) {
    return element ? element.tagName : null
  }

  hasChildren(element) {
    return element && element.children.length > 0
  }

  createElement(tagName) {
    return document.createElement(tagName)
  }

  createTreeWalker(root, whatToShow = NodeFilter.SHOW_TEXT) {
    return document.createTreeWalker(root, whatToShow, null, false)
  }
}