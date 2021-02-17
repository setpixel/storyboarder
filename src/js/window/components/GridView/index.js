const ReactDOM = require('react-dom')
const h = require('../../../utils/h')
const Grid = require('./Grid')
const GridViewElement = require('./GridViewElement')
const { getEtag } = require('../../../utils/etags')
let enableEditModeDelay = 750 // msecs
class GridView {
    constructor(boardData, boardPath, saveImageFile, getSelections, 
                getCurrentBoard, setCurrentBoard, getContextMenu, renderThumbnailDrawerSelections, 
                gotoBoard,  gridDrag, setSketchPaneVisibility, boardModel, setEditorModeTimer, renderTimelineModeControlView) {
        this.isEditMode = false
        this.boardData = boardData
        this.saveImageFile = saveImageFile
        this.getSelections = getSelections
        this.getCurrentBoard = getCurrentBoard
        this.setCurrentBoard = setCurrentBoard
        this.gridDrag = gridDrag
        this.getContextMenu = getContextMenu
        this.setSketchPaneVisibility = setSketchPaneVisibility
        this.renderThumbnailDrawerSelections = renderThumbnailDrawerSelections
        this.gotoBoard = gotoBoard
        this.boardModel = boardModel
        this.boardPath = boardPath
        this.setEditorModeTimer = setEditorModeTimer
        this.gridViewCursor = {
            visible: false,
            x: 0,
            el: null
        }
        this.gridElementOffset = 24
        this.renderTimelineModeControlView = renderTimelineModeControlView
    }

    get IsEditMode() {
        return this.isEditMode
    }

    set IsEditMode(value) {
        this.isEditMode = value
    }

    enableEditMode () {
        this.isEditMode = true
        this.gridViewCursor.visible = true
        this.renderGridViewCursor()
        this.renderThumbnailDrawerSelections()
        this.getContextMenu().remove()
    }

    getDefaultHeight() {
        return 200 + this.gridElementOffset
    }

    gridViewFromPoint(x, y, offset) {
        if (!offset) { offset = 0 }

        let el = document.elementFromPoint(x-offset, y)
        if(!el) return null
        if(el.classList.contains('thumbnail-container')) {
          el = el.childNodes[0]
        }
        if (!el.classList.contains('thumbnail')) return null
        let selections = this.getSelections()
        // if part of a multi-selection, base from right-most element
        if (selections.has(Number(el.dataset.thumbnail))) {
          // base from the right-most thumbnail in the selection
          let rightMost = Math.max(...selections)
          let rightMostEl = document.querySelector('.grid-view div[data-thumbnail="' + rightMost + '"]')
          el = rightMostEl
        }
      
        return el
    }

    renderGridViewCursor() {
        let el = document.querySelector('#grid-cursor-container')
        if (el) { // shouldRenderThumbnailDrawer
          let gridViewCursor = this.gridViewCursor
          if (gridViewCursor.visible) {
            el.style.display = ''
            el.style.left = gridViewCursor.x + 'px'
            el.style.top = gridViewCursor.y + 'px'
          } else {
            el.style.display = 'none'
            el.style.left = '0px'
          }
        }
    }

    cleanUpGridView(){
        let gridView = document.querySelector(".grid-view")
        if(!gridView) return
        gridView.removeEventListener('pointerdown', this.gridDrag)
        ReactDOM.unmountComponentAtNode(gridView)
    }

    updateGridViewCursor(x, y) {
            
        let el = this.gridViewFromPoint(x, y)
        if (!el) return
        
        let rect = el.getBoundingClientRect()

        this.gridViewCursor.el = el 
        let elementOffsetX
        
        let elementOffsetY = rect.top
        let arrowOffsetX
        // Figures out if mouse is to the left side of container or to the right
        let reactMiddlePointX = rect.left + rect.width / 2 
        if(x < reactMiddlePointX) {
          let cursor = document.querySelector('#grid-cursor-container')
          elementOffsetX = rect.left
          arrowOffsetX = -8 - cursor.clientWidth
          this.gridViewCursor.side = "Left"
        } else if(x >= reactMiddlePointX) {
          elementOffsetX = rect.right
          arrowOffsetX = 8
          this.gridViewCursor.side = "Right"
        }
                
        let scrollTop = el.scrollTop
        let arrowOffsetY = -8
        
        this.gridViewCursor.x = elementOffsetX + arrowOffsetX
        this.gridViewCursor.y = elementOffsetY + arrowOffsetY - scrollTop
     }

    pointerEnter (e) {
      let selections = this.getSelections()
      let currentBoard = this.getCurrentBoard()
      if (!this.isEditMode && selections.size <= 1 && e.target.dataset.thumbnail === currentBoard) {
          this.getContextMenu().attachTo(e.target)
        }
    }

    pointerLeave (e) { 
        if (e.relatedTarget instanceof Element && !this.getContextMenu().hasChild(e.relatedTarget)) {
            this.getContextMenu().remove()
        }
    }

    pointerMove (e) {
        let selections = this.getSelections()
        let currentBoard = this.getCurrentBoard()
        if (!this.isEditMode && selections.size <= 1 && e.target.dataset.thumbnail === currentBoard) {
            this.getContextMenu().attachTo(e.target)
        }
    }

    pointerDown (e) { 
        let selections = this.getSelections()
        let currentBoard = this.getCurrentBoard()
        if (!this.isEditMode && selections.size <= 1) this.getContextMenu().attachTo(e.target)
        // always track cursor position
        this.updateGridViewCursor(e.clientX, e.clientY)
    
        if (e.button === 0) {
            this.setEditorModeTimer(setTimeout(() => this.enableEditMode(), enableEditModeDelay))
        } else {

          this.enableEditMode()
        }
      
        let index = Number(e.target.dataset.thumbnail)
        if (selections.has(index)) {
          // ignore
        } else if (currentBoard !== index) {
          // go to board by index
          // reset selections
          selections.clear()
          this.saveImageFile().then(() => {
            this.setCurrentBoard(index)
            this.renderThumbnailDrawerSelections()
            this.gotoBoard(index)
          })
        }
    }

    doubleClick (e) {
      this.setSketchPaneVisibility(true)
      this.renderTimelineModeControlView({ show: true })
    }

    selectThumbnail(thumb) {
      let i = Number(thumb.dataset.thumbnail)
      if(i === this.getCurrentBoard()) {
          thumb.classList.toggle('active', true)
          thumb.classList.toggle('selected', this.getSelections().has(i))
          thumb.classList.toggle('editing', this.isEditMode)
      }
    }

    renderGridView (callback) {
      this.cleanUpGridView()
      let boardData = this.boardData
      let gridView = document.querySelector('.grid-view')
      let defaultHeight = this.getDefaultHeight()
      let thumbnailWidth = Math.floor(defaultHeight * boardData.aspectRatio)
      gridView.addEventListener('pointerdown', this.gridDrag)
      ReactDOM.render(h([Grid, {
        itemData:{
          boardData,
          boardPath: this.boardPath,
          boardModel: this.boardModel,
          getEtag,
          pointerDown: (e) => this.pointerDown(e),
          pointerMove: (e) => this.pointerMove(e),
          pointerLeave: (e) => this.pointerLeave(e),
          pointerEnter: (e) => this.pointerEnter(e),
          dblclick: (e) => this.doubleClick(e),
          selectThumbnail: (thumb) => this.selectThumbnail(thumb)
        },
        Component:GridViewElement,
        elements:boardData.boards,
        numCols:3,
        itemHeight: defaultHeight,
        defaultElementWidth: thumbnailWidth,
        gridElementOffset: this.gridElementOffset
        }
      ]), gridView, () => { this.renderThumbnailDrawerSelections(), callback && callback() })
    }
}

module.exports = GridView
