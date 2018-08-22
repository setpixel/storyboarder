const fs = require('fs-extra')
const path = require('path')
const GIFEncoder = require('gifencoder')
const moment = require('moment')
const app = require("electron").remote.app
const { dialog } = require('electron').remote

const {
  boardFileImageSize,
  boardFilenameForExport
} = require('../models/board')
const {
  getImage,
  exportFlattenedBoard,
  ensureExportsPathExists,
  flattenBoardToCanvas
} = require('../exporters/common')

const filterNotMutedBoards = (boards) => {
  return boards.filter(function(board){ return !board.muted });
}

const exporterFcpX = require('../exporters/final-cut-pro-x')
const exporterFcp = require('../exporters/final-cut-pro')
const exporterPDF = require('../exporters/pdf')
const exporterCleanup = require('../exporters/cleanup')
const exporterFfmpeg = require('../exporters/ffmpeg')
const util = require('../utils/index')

class Exporter {

  exportCleanup (boardData, projectFileAbsolutePath) {
    return new Promise((resolve, reject) => {
      dialog.showMessageBox(
        null,
        {
          type: 'warning',
          title: 'Are You Sure?',
          message: `Clean Up deletes unused image files, reducing file size. It cannot be undone. Are you sure you want to do this?`,
          buttons: ['Yes', 'No'],
        },
        index => {
          if (index == 1) {
            reject()
          } else {
            exporterCleanup.cleanupScene(projectFileAbsolutePath).then(newBoardData => {
              resolve(newBoardData)
            }).catch(err => {
              reject(err)
            })
          }
        }
      )
    })
  }

  async exportFcp (boardData, projectFileAbsolutePath) {
    let exportBoards = filterNotMutedBoards(boardData.boards)
    let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)

    let basename = path.basename(projectFileAbsolutePath)
    let outputPath = path.join(
      exportsPath,
      util.dashed(basename + ' Exported ' + moment().format('YYYY-MM-DD hh.mm.ss'))
    )
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath)
    }

    let data = await exporterFcp.generateFinalCutProData(boardData, { projectFileAbsolutePath, outputPath })
    let xml = exporterFcp.generateFinalCutProXml(data)
    fs.writeFileSync(path.join(outputPath, util.dashed(basename + '.xml')), xml)

    let fcpxData = await exporterFcpX.generateFinalCutProXData(boardData, { projectFileAbsolutePath, outputPath })
    let fcpxml = exporterFcpX.generateFinalCutProXXml(fcpxData)
    fs.writeFileSync(path.join(outputPath, util.dashed(basename + '.fcpxml')), fcpxml)

    // export ALL layers of each one of the boards
    let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
    let writers = exportBoards.map(async (board, index) => {
      let filenameForExport = util.dashed(boardFilenameForExport(board, index, basenameWithoutExt))

      await exportFlattenedBoard(
        board,
        filenameForExport,
        boardFileImageSize(boardData),
        projectFileAbsolutePath,
        outputPath
      )
    })
    await Promise.all(writers)

    // export ALL audio
    exportBoards.forEach((board, index) => {
      if (board.audio && board.audio.filename && board.audio.filename.length) {
        fs.copySync(
          path.join(path.dirname(projectFileAbsolutePath), 'images', board.audio.filename),
          path.join(outputPath, board.audio.filename)
        )
      }
    })

    return outputPath
  }
 
  exportPDF (boardData, projectFileAbsolutePath, _paperSize, _paperOrientation, _rows, _cols, _spacing, _filepath) {
    let exportBoards = filterNotMutedBoards(boardData.boards)
    return new Promise(resolve => {
      let outputPath = app.getPath('temp')

      let index = 0
      let writers = []
      let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
      for (let board of exportBoards) {
        writers.push(new Promise(resolve => {
          let filenameForExport = `board-` + index + '.jpg'
          exportFlattenedBoard(
            board,
            filenameForExport,
            boardFileImageSize(boardData),
            projectFileAbsolutePath,
            outputPath,
            0.4
          ).then(() => resolve()).catch(err => console.error(err))
        }))
        index++
      }
      
      Promise.all(writers).then(() => {
        let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)
        let filepath = _filepath ? _filepath : path.join(exportsPath, basenameWithoutExt + ' ' + moment().format('YYYY-MM-DD hh.mm.ss') + '.pdf')
        let paperSize = _paperSize ? _paperSize : 'LTR'
        let paperOrientation = _paperOrientation ? _paperOrientation : "landscape"
        let rows = _rows ? _rows : 3
        let cols = _cols ? _cols : 3
        let spacing = _spacing ? _spacing : 10
        exporterPDF.generatePDF(paperSize, paperOrientation, rows, cols, spacing, boardData, basenameWithoutExt, filepath)
        resolve(filepath)
      }).catch(err => {
        console.log(err)
      })

    })
  }

  exportImages (boardData, projectFileAbsolutePath, outputPath = null) {
    let exportBoards = filterNotMutedBoards(boardData.boards)
    return new Promise(resolve => {
      let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)
      let basename = path.basename(projectFileAbsolutePath)
      if (!outputPath) {
        outputPath = path.join(
          exportsPath,
         basename + ' Images ' + moment().format('YYYY-MM-DD hh.mm.ss')
        )
      }

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath)
      }

      // export ALL layers of each one of the boards
      let index = 0
      let writers = []
      let basenameWithoutExt = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
      for (let board of exportBoards) {
        writers.push(new Promise(resolve => {
          let filenameForExport = boardFilenameForExport(board, index, basenameWithoutExt)
          exportFlattenedBoard(
            board,
            filenameForExport,
            boardFileImageSize(boardData),
            projectFileAbsolutePath,
            outputPath
          ).then(() => resolve()).catch(err => console.error(err))
        }))

        index++
      }

      Promise.all(writers).then(() => {
        resolve(outputPath)
      }).catch(err => {
        console.log(err)
      })
    })
  }

  async exportAnimatedGif (boards, boardSize, destWidth, projectFileAbsolutePath, mark, boardData) {
      
    let aspect = boardSize.height / boardSize.width
    let destSize = {
      width: destWidth,
      height: Math.floor(destWidth * aspect)
    }
    const fragmentText = (ctx, text, maxWidth) => {
      let words = text.split(' ')
      let lines = []
      let line = ''
      if (ctx.measureText(text).width < maxWidth) {
        return [text]
      }
      while (words.length > 0) {
        while (ctx.measureText(words[0]).width >= maxWidth) {
          var tmp = words[0]
          words[0] = tmp.slice(0, -1)
          if (words.length > 1) {
            words[1] = tmp.slice(-1) + words[1]
          } else {
            words.push(tmp.slice(-1))
          }
        }
        if (ctx.measureText(line + words[0]).width < maxWidth) {
          line += words.shift() + ' '
        } else {
          lines.push(line)
          line = ''
        }
        if (words.length === 0) {
          lines.push(line)
        }
      }
      return lines
    }

    const watermarkImage = await getImage('./img/watermark.png')

    const canvases = await Promise.all(
      boards.map(async (board) =>
        // returns a Promise
        flattenBoardToCanvas(
          board,
          null,
          [destSize.width, destSize.height],
          projectFileAbsolutePath
        )
      )
    )

    let encoder = new GIFEncoder(destSize.width, destSize.height)

    // save in the exports directory
    let exportsPath = ensureExportsPathExists(projectFileAbsolutePath)
    let basename = path.basename(projectFileAbsolutePath, path.extname(projectFileAbsolutePath))
    let filepath = path.join(
      exportsPath,
      basename + ' ' + moment().format('YYYY-MM-DD hh.mm.ss') + '.gif'
    )

    encoder.createReadStream().pipe(fs.createWriteStream(filepath))
    encoder.start()
    encoder.setRepeat(0) // 0 for repeat, -1 for no-repeat
    encoder.setDelay(boardData.defaultBoardTiming) // frame delay in ms
    encoder.setQuality(10) // image quality. 10 is default.
    for (var i = 0; i < boards.length; i++) {
      let canvas = canvases[i]
      let context = canvas.getContext('2d')
      if (mark) {
        context.drawImage(watermarkImage, destSize.width - watermarkImage.width, destSize.height - watermarkImage.height)
      }
      if (boards[i].dialogue) {
        let text = boards[i].dialogue
        let fontSize = 22
        context.font = '300 ' + fontSize + 'px wonderunitsans'
        context.textAlign = 'center'
        context.fillStyle = 'white'
        context.miterLimit = 1
        context.lineJoin = 'round'
        context.lineWidth = 4
        let lines = fragmentText(context, text, 450)

        let outlinecanvas = document.createElement('canvas')
        let outlinecontext = outlinecanvas.getContext('2d')
        outlinecanvas.width = destSize.width
        outlinecanvas.height = destSize.height

        lines.forEach((line, i) => {
          let xOffset = (i + 1) * (fontSize + 6) + (destSize.height - ((lines.length + 1) * (fontSize + 6))) - 20
          let textWidth = context.measureText(line).width / 2
          outlinecontext.lineWidth = 15
          outlinecontext.lineCap = 'square'
          outlinecontext.lineJoin = 'round'
          outlinecontext.strokeStyle = 'rgba(0,0,0,1)'
          let padding = 35
          outlinecontext.fillRect((destWidth / 2) - textWidth - (padding / 2), xOffset - (6) - (padding / 2), textWidth * 2 + padding, padding)
          outlinecontext.strokeRect((destWidth / 2) - textWidth - (padding / 2), xOffset - (6) - (padding / 2), textWidth * 2 + padding, padding)

          // outlinecontext.beginPath()
          // outlinecontext.moveTo((destWidth/2)-textWidth, xOffset-(6))
          // outlinecontext.lineTo((destWidth/2)+textWidth, xOffset-(6))
          // outlinecontext.stroke()
        })

        context.globalAlpha = 0.5
        context.drawImage(outlinecanvas, 0, 0)
        context.globalAlpha = 1

        lines.forEach((line, i) => {
          let xOffset = (i + 1) * (fontSize + 6) + (destSize.height - ((lines.length + 1) * (fontSize + 6))) - 20
          context.lineWidth = 4
          context.strokeStyle = 'rgba(0,0,0,0.8)'
          context.strokeText(line.trim(), destWidth / 2, xOffset)
          context.strokeStyle = 'rgba(0,0,0,0.2)'
          context.strokeText(line.trim(), destWidth / 2, xOffset + 2)
          context.fillText(line.trim(), destWidth / 2, xOffset)
        })
      }
      let duration
      if (boards[i].duration) {
        duration = boards[i].duration
      } else {
        duration = boardData.defaultBoardTiming
      }
      encoder.setDelay(duration)
      encoder.addFrame(context)
    }
    encoder.finish()

    return filepath
  }

  async exportVideo (scene, sceneFilePath, opts) {

    let outputPath = ensureExportsPathExists(sceneFilePath)

    return await exporterFfmpeg.convertToVideo(
      {
        outputPath,
        sceneFilePath,
        scene,
        progressCallback: opts.progressCallback
      }
    )
  }
}

module.exports = new Exporter()
