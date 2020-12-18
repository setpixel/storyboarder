const { ipcRenderer } = require('electron')
const BoardState = {
    Pending: "Pending",
    Loaded: "Loaded",
    Saved: "Saved",
    Cancelled: "Cancelled"
}
class ImageService {
    constructor(headlessRender) {
        this.headlessRender = headlessRender
        this.isImageRerendering = false
        this.boards = {}
        this.initialBoardIndex = 0
        this.lastIndex = 0
        this.iteration = 1
        ipcRenderer.on('headless-render:loaded', (event) => {
            let win = headlessRender.getWindow()
            if(this.boards[this.lastIndex].state !== BoardState.Cancelled && this.boards[this.lastIndex].data.layers['shot-generator'] ) {
                this.boards[this.lastIndex].state = BoardState.Loaded
                win && win.webContents.send('headless-render:save-shot')
            } else {
                this.continueBoardUpdate()
            }
        })
    }
    
    initialize(boards, currentBoard, boardFilename) {
        this.isImageRerendering = true
        this.boards = boards.map(board => { return {state: BoardState.Pending, data:board} } )
        this.initialBoardIndex = currentBoard
        this.lastIndex = currentBoard
        this.iteration = 1
        this.boardFilename = boardFilename
    }

    continueBoardUpdate(images = {}) {
        // If images have plot when action was sent from sg and not the headless-render
        if(images.plot) return true
        let win = this.headlessRender.getWindow()
        if(this.lastIndex === this.initialBoardIndex - this.iteration) this.iteration++
        
        let highestIndex = this.initialBoardIndex + this.iteration 
        let lowestIndex = this.initialBoardIndex - this.iteration 
        let newIndex 
        if(this.boards[this.lastIndex]) this.boards[this.lastIndex].state = BoardState.Saved
        if(highestIndex !== this.lastIndex) {
            newIndex = highestIndex
        } else if(lowestIndex !== this.lastIndex) {
            newIndex = lowestIndex
        } 
        if(newIndex < this.boards.length && newIndex >= 0) {
            let board = this.boards[newIndex]
            this.lastIndex = newIndex
            if(board.state === BoardState.Cancelled || !board.data.layers['shot-generator']) {
                return this.continueBoardUpdate(images)
            }
            win.webContents.send('headless-render:load-board', {
                storyboarderFilePath: this.boardFilename,
                board: board.data
            })
        } else if(highestIndex >= this.boards.length - 1 && lowestIndex < 0) {
            this.isImageRerendering = false
            if(this.boards[this.lastIndex] && this.boards[this.lastIndex].state === BoardState.Cancelled) return false
        } else {
            this.lastIndex = newIndex
            return this.continueBoardUpdate(images)
        }
        return true
    }

    cancelBoardUpdate() {
        let boards = this.boards
        for(let i = 0; i < boards.length; i ++) {
            let board = boards[i]
            if(board.state !== BoardState.Saved) {
                this.boards[i].state = BoardState.Cancelled
            }
        }
    }

}

module.exports = ImageService