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
    return this.dom.convertBlockToParagraph(blockElement)
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
    
    // Match original logic structure: handle blocks that are empty OR styled
    if (this.blocks.isBlockElement(blockElement) && (isEmpty || isStyledBlock)) {
      // Special case: empty paragraph between containers - merge them
      if (blockElement.tagName === 'P' && !isInContainer) {
        if (this.mergeContainers(blockElement)) {
          return true
        }
        // Original behavior: empty paragraph that can't merge containers returns false
        this.log('Empty paragraph with no container merge - let browser handle')
        return false
      }

      // Convert styled blocks to paragraph
      this.log('Converting block to paragraph')
      return this.convertBlockToParagraph(blockElement)
    }
    
    // Match original: ANY block in container converts to paragraph (not just empty/styled)
    if (isInContainer) {
      this.log('Converting block in container to paragraph')
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
        // Cross-container merge - matching original logic exactly
        this.log('Cross-container merge')
        
        // Store cursor position before merge
        const cursorPosition = this.dom.getTextContent(previousBlock).length
        
        // Position cursor at end of last child in container
        this.dom.setCaretAtEnd(previousBlock)
        
        // Insert content using semantic merge (text only to preserve styling)
        if (!this.blocks.isBlockEmpty(blockElement)) {
          const textContent = this.blocks.extractTextContent(this.dom.getInnerHTML(blockElement))
          if (textContent.trim()) {
            this.dom.insertText(textContent)
            // Move cursor back to merge boundary
            this.dom.setCaretPosition(previousBlock, cursorPosition)
          }
        }
        
        // Remove current block
        this.dom.selectNode(blockElement)
        this.dom.deleteSelection()
        
        // Check for next container merging (matching original logic)
        const nextSibling = this.blocks.isContainerElement(previousContainer) ?
          this.dom.getNextSibling(previousContainer) : this.dom.getNextSibling(previousBlock)
        
        this.log('mergeWithPrevious: checking for next sibling to merge:', nextSibling ? this.dom.getTagName(nextSibling) : 'null')
        
        const containerToCompareWith = this.blocks.isContainerElement(previousContainer) ?
          previousContainer : previousBlock
          
        if (nextSibling &&
            this.blocks.isContainerElement(nextSibling) &&
            this.dom.getTagName(nextSibling) === this.dom.getTagName(containerToCompareWith)) {
          this.log('mergeWithPrevious: merging next container into current')
          
          // Move all children from next container to current container
          while (this.dom.hasChildren(nextSibling)) {
            const child = this.dom.getFirstChild(nextSibling)
            containerToCompareWith.appendChild(child)
          }
          
          // Remove the next container
          this.dom.selectNode(nextSibling)
          this.dom.deleteSelection()
          
          this.log('mergeWithPrevious: removed next container after merge')
          
          // Position cursor at the merge boundary
          this.dom.setCaretPosition(previousBlock, cursorPosition)
        } else {
          // Position cursor normally if no container merge
          this.dom.setCaretPosition(previousBlock, cursorPosition)
        }
        
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
      return this.dom.insertEmptyParagraph()
    }
    
    // Priority 3: Non-empty block in container at end
    const blockInContainer = this.blocks.findBlockInContainer(container)
    if (blockInContainer && !this.blocks.isBlockEmpty(blockInContainer.block)) {
      if (this.blocks.isAtBlockEnd(blockInContainer.block)) {
        this.log('At end of block in container')
        
        const newBlockTag = blockInContainer.block.tagName.toLowerCase()
        
        this.dom.insertBlockAfter(blockInContainer.block, newBlockTag)
        
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

  // ========== Container Operations ==========

  mergeContainers(blockElement) {
    const mergeInfo = this.blocks.canMergeContainers(blockElement)
    if (!mergeInfo) {
      return false
    }

    this.log('Merging containers by deleting empty paragraph between them')

    const { block, prevContainer, nextContainer } = mergeInfo
    const strategy = this.blocks.getContainerMergeStrategy(prevContainer, nextContainer)

    if (strategy.requiresSpecialHandling && strategy.type === 'blockquote') {
      return this.mergeBlockquoteContainers(prevContainer, nextContainer, block)
    } else {
      return this.mergeContainersSimple(prevContainer, nextContainer, block)
    }
  }

  mergeBlockquoteContainers(prevContainer, nextContainer, emptyBlock) {
    const lastChild = this.dom.getLastChild(prevContainer)
    
    // Insert content from next container into prev container
    this.dom.setCaretAfter(lastChild)
    this.dom.insertParagraph()
    this.dom.insertHTML(this.dom.getInnerHTML(nextContainer))
    
    // Delete the empty paragraph and next container
    const range = this.blocks.createRangeForElements(emptyBlock, nextContainer, 'before', 'after')
    this.blocks.applyRangeAndDelete(range)
    
    // Fix cursor position
    if (lastChild) {
      this.dom.setCaretAfter(lastChild)
    }
    
    return true
  }

  mergeContainersSimple(prevContainer, nextContainer, emptyBlock) {
    const range = this.blocks.createSelectionForContainerMerge(prevContainer, nextContainer)
    return this.blocks.applyRangeAndDelete(range)
  }
}
