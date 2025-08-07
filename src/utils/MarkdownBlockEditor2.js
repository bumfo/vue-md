/**
 * MarkdownBlockEditor - High-level user action handler
 *
 * This class orchestrates the lower layers (DOMOperations and MarkdownBlockModel)
 * to handle user actions with markdown semantic understanding.
 */
import DOMOperations from './DOMOperations'
import MarkdownBlockModel from './MarkdownBlockModel'

export default class MarkdownBlockEditor {
  constructor(editorElement, options = {}) {
    this.editor = editorElement
    this.debug = options.debug || false
    
    // Initialize lower layers
    this.dom = new DOMOperations(editorElement)
    this.blocks = new MarkdownBlockModel(editorElement, this.dom)
  }

  // ========== LOGGING ==========

  log(...args) {
    if (this.debug) {
      console.log('[MarkdownBlockEditor]', ...args)
    }
  }

  // ========== UNIFIED OPERATIONS ==========

  /**
   * Unified block-to-paragraph conversion using outdent + formatBlock
   * Handles all cases: headings, list items, blockquotes
   */
  convertBlockToParagraph(blockElement) {
    this.log('Converting', blockElement.tagName, 'to paragraph (unified logic)')
    
    // Position cursor at start of the block to convert
    this.dom.setCaretAtStart(blockElement)
    
    // Universal approach: outdent first (removes containers), then formatBlock
    this.dom.outdent()
    this.dom.formatBlock('p')
    
    return true
  }

  /**
   * Merge content from one block into another, preserving target block's styling
   */
  mergeBlocks(targetBlock, sourceBlock) {
    const targetPosition = this.dom.getTextContent(targetBlock).length
    const sourceContent = this.blocks.extractTextContent(
      this.blocks.extractInlineContent(sourceBlock)
    )
    
    // Position cursor at end of target block
    this.dom.setCaretPosition(targetBlock, targetPosition)
    
    // Insert source content
    if (sourceContent.trim()) {
      this.dom.insertText(sourceContent)
    }
    
    // Remove source block
    this.dom.selectNode(sourceBlock)
    this.dom.deleteSelection()
    
    // Position cursor at merge boundary
    this.dom.setCaretPosition(targetBlock, targetPosition)
    
    return true
  }

  /**
   * Check and merge adjacent containers of the same type
   */
  mergeAdjacentContainers(referenceElement, preserveSplit = false) {
    if (preserveSplit) return
    
    const current = referenceElement
    
    // Only consider root-level empty paragraphs
    if (this.dom.getTagName(current) !== 'P' ||
        this.blocks.isContainerElement(this.dom.getParentElement(current)) ||
        !this.blocks.isBlockEmpty(current)) {
      return
    }
    
    const prevSibling = this.dom.getPreviousSibling(current)
    const nextSibling = this.dom.getNextSibling(current)
    
    // Check for same-type containers
    if (prevSibling && nextSibling &&
        this.blocks.isContainerElement(prevSibling) &&
        this.blocks.isContainerElement(nextSibling) &&
        this.dom.getTagName(prevSibling) === this.dom.getTagName(nextSibling)) {
      
      const originalLastChild = this.dom.getLastChild(prevSibling)
      
      // Move all children from next to prev
      while (this.dom.getFirstChild(nextSibling)) {
        prevSibling.appendChild(this.dom.getFirstChild(nextSibling))
      }
      
      // Remove empty paragraph and second container
      this.dom.selectNode(current)
      this.dom.deleteSelection()
      
      this.dom.selectNode(nextSibling)
      this.dom.deleteSelection()
      
      // Position cursor at merge boundary
      if (originalLastChild && this.blocks.isBlockElement(originalLastChild)) {
        const position = this.dom.getTextContent(originalLastChild).length
        this.dom.setCaretPosition(originalLastChild, position)
      }
    }
  }

  // ========== MAIN HANDLERS ==========

  handleBackspace() {
    this.log('handleBackspace')
    
    const context = this.dom.getCursorContext()
    if (!context) {
      this.log('No context, returning false')
      return false
    }
    
    // Let browser handle range selections
    if (!context.collapsed) {
      this.log('Range selection, letting browser handle')
      return false
    }
    
    // Check if at block start
    const blockStart = this.blocks.isAtBlockStart(context.container, context.offset)
    if (!blockStart.atStart) {
      this.log('Not at block start')
      return false
    }
    
    const blockElement = blockStart.blockElement
    const blockType = this.blocks.getBlockType(blockElement)
    const container = this.dom.getParentElement(blockElement)
    const isInContainer = this.blocks.isContainerElement(container)
    
    this.log('Block context', {
      blockElement: blockElement.tagName,
      blockType,
      isInContainer
    })
    
    // Handle special cases first
    const isEmpty = this.blocks.isBlockEmpty(blockElement)
    const isStyledBlock = blockType !== 'paragraph'
    
    // Special case: empty paragraph between containers - merge them
    if (blockElement.tagName === 'P' && !isInContainer && isEmpty) {
      const prevSibling = this.dom.getPreviousSibling(blockElement)
      const nextSibling = this.dom.getNextSibling(blockElement)
      
      if (prevSibling && nextSibling &&
          this.blocks.isContainerElement(prevSibling) &&
          this.blocks.isContainerElement(nextSibling)) {
        
        this.log('Merging containers by deleting empty paragraph between them')
        
        // Handle different container types
        if (prevSibling.tagName === 'BLOCKQUOTE' && nextSibling.tagName === 'BLOCKQUOTE') {
          // Special handling for blockquotes
          const lastChild = this.dom.getLastChild(prevSibling)
          
          this.dom.setCaretAfter(lastChild)
          this.dom.insertParagraph()
          this.dom.insertHTML(this.dom.getInnerHTML(nextSibling))
          
          // Select and delete the empty paragraph and next container
          const range = document.createRange()
          const selection = this.dom.getSelection()
          range.setStartBefore(blockElement)
          range.setEndAfter(nextSibling)
          selection.removeAllRanges()
          selection.addRange(range)
          this.dom.deleteSelection()
          
          // Fix cursor position
          if (lastChild) {
            this.dom.setCaretAfter(lastChild)
          }
        } else {
          // For lists: simple delete works
          const range = document.createRange()
          const selection = this.dom.getSelection()
          
          const lastChildOfPrev = this.dom.getLastChild(prevSibling)
          const firstChildOfNext = this.dom.getFirstChild(nextSibling)
          
          if (lastChildOfPrev && firstChildOfNext) {
            range.setStartAfter(lastChildOfPrev)
            range.setEndBefore(firstChildOfNext)
          } else {
            range.setStartAfter(prevSibling)
            range.setEndBefore(nextSibling)
          }
          
          selection.removeAllRanges()
          selection.addRange(range)
          this.dom.deleteSelection()
        }
        
        return true
      }
      
      // Empty paragraph not between containers
      return false
    }
    
    // Handle styled blocks or blocks in containers
    if ((isEmpty || isStyledBlock) && this.blocks.isBlockElement(blockElement)) {
      this.log('Converting block to paragraph')
      return this.convertBlockToParagraph(blockElement)
    }
    
    // Handle merging with previous block (paragraph at root level)
    if (blockType === 'paragraph' && !isInContainer) {
      this.log('Merging with previous block')
      
      const previousBlock = this.blocks.getPreviousBlock(blockElement)
      if (!previousBlock) {
        this.log('No previous block found')
        return false
      }
      
      const previousContainer = this.dom.getParentElement(previousBlock)
      const isCrossContainer = this.blocks.isContainerElement(previousContainer) && 
                               !this.blocks.isContainerElement(container)
      
      if (isCrossContainer) {
        // Cross-container merge
        this.log('Cross-container merge')
        
        if (!this.blocks.isBlockEmpty(blockElement)) {
          // Merge content into last block of container
          this.mergeBlocks(previousBlock, blockElement)
        } else {
          // Just remove empty block
          this.dom.selectNode(blockElement)
          this.dom.deleteSelection()
          this.dom.setCaretPosition(previousBlock, this.dom.getTextContent(previousBlock).length)
        }
        
        // Check for container merging opportunity
        this.mergeAdjacentContainers(previousBlock)
        
        return true
      } else {
        // Same-level merge
        this.log('Same-level merge')
        
        const result = this.mergeBlocks(previousBlock, blockElement)
        
        // Clean up empty containers
        const blockContainer = this.dom.getParentElement(blockElement)
        if (this.blocks.isContainerElement(blockContainer) && 
            !this.dom.hasChildren(blockContainer)) {
          this.dom.selectNode(blockContainer)
          this.dom.deleteSelection()
        }
        
        // Check for container merging
        this.mergeAdjacentContainers(previousBlock)
        
        return result
      }
    }
    
    this.log('Fallback to browser')
    return false
  }

  handleEnter() {
    this.log('handleEnter')
    
    const context = this.dom.getCursorContext()
    if (!context) return false
    
    const container = context.range.commonAncestorContainer
    
    // Priority 1: Check if we're in an empty block
    const emptyBlock = this.blocks.findEmptyBlock(container)
    if (emptyBlock) {
      this.log('Empty block enter:', emptyBlock)
      
      if (emptyBlock.container) {
        // Use unified conversion for all container exits
        this.log('Converting empty block in container')
        return this.convertBlockToParagraph(emptyBlock.block)
      } else {
        // Reset styled block to paragraph
        return this.convertBlockToParagraph(emptyBlock.block)
      }
    }
    
    // Priority 2: End of inline element
    if (this.blocks.isAtEndOfInlineElement()) {
      this.log('At end of inline element')
      return this.dom.insertHTML('<p><br></p>')
    }
    
    // Priority 3: Non-empty block in container at end
    const blockInContainer = this.blocks.findBlockInContainer(container)
    if (blockInContainer && !this.blocks.isBlockEmpty(blockInContainer.block)) {
      if (this.blocks.isAtBlockEnd(blockInContainer.block)) {
        this.log('At end of block in container')
        
        const newBlockTag = blockInContainer.block.tagName.toLowerCase()
        
        this.dom.setCaretAfter(blockInContainer.block)
        this.dom.insertHTML(`<${newBlockTag}><br></${newBlockTag}>`)
        
        // Position cursor in new block
        const newBlock = this.dom.getNextSibling(blockInContainer.block)
        if (newBlock) {
          this.dom.setCaretAtStart(newBlock)
        }
        
        return true
      }
    }
    
    // Let browser handle default cases (splitting content)
    return false
  }

  handleTab() {
    this.dom.insertHTML('&nbsp;&nbsp;&nbsp;&nbsp;')
    return true
  }
}