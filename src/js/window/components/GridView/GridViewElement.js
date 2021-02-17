const h = require('../../../utils/h')
const React = require('react')
const path = require('path')
const util = require('../../../utils/index')
const fs = require('fs-extra')
const { useEffect, useRef } = require('react')
const GridViewElement =  React.memo(({
    data: board,
    index,
    boardPath,
    boardModel,
    boardData,
    getEtag,
    pointerDown,
    pointerMove,
    pointerLeave,
    pointerEnter,
    dblclick,
    gridElementOffset,
    selectThumbnail
}) => {
    const thumbnailRef = useRef()
    let defaultHeight = 200
    let thumbnailWidth = Math.floor(defaultHeight * boardData.aspectRatio)
    const getImage = () => {
        let imageFilename = path.join(boardPath, 'images', board.url.replace('.png', '-posterframe.jpg'))
        let imageElement = ''
        try {
            if (fs.existsSync(imageFilename)) {
                let src = imageFilename + '?' + getEtag(path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(board)))
                imageElement = ['div', { className:"top"}, 
                ['img', { src:src, style:{ height:defaultHeight, width:thumbnailWidth }}]
                ]
            } else {
                // blank image
                imageElement = ['img', { src:"//:0", style: { height:"${defaultHeight}px", width:`${thumbnailWidth}px`}}]
            }
        } catch (err) {
        }
        return imageElement
    }

    const getAudio = () => {
        if (board.audio && board.audio.filename.length) {
            return ['div', { className:"audio" },
                ['svg',
                  ['use', { 'xlink:href':"./img/symbol-defs.svg#icon-speaker-on"}]
                ]
            ]
        }
    }
    const getBoardDialogue = () => {
        if (board.dialogue) 
           return board.dialogue
        return ''
    }

    const getBoardDuration = () => {
        if (board.duration) {
            return util.msToTime(board.duration)
        } else {
            return util.msToTime(boardData.defaultBoardTiming)
        }
    }


    useEffect(() => {
        selectThumbnail(thumbnailRef.current)
    })

    return h(
    ['div', { 
        className: "thumbnail-container",
        style:{ width:thumbnailWidth + gridElementOffset },
        },
        ['div', { 
            style:{ display:"flex", flexDirection:"column", alignSelf:"center"},
            'data-thumbnail':index, 
            'data-type':"thumbnail-grid",
            className:"thumbnail", 
            onPointerDown: pointerDown,
            onPointerMove: pointerMove,
            onPointerLeave: pointerLeave,
            onPointerEnter: pointerEnter,
            onDoubleClick: dblclick,
            ref:thumbnailRef 
        },
            getImage(),
            ['div', { className:"info" },
                ['div', { className:"number"}, board.shot],
                getAudio(),
                ['div', { className:"caption" }, getBoardDialogue()],
                ['div', { className:"duration"}, getBoardDuration()]
            ]
        ]
    ]
    )
})

module.exports = GridViewElement