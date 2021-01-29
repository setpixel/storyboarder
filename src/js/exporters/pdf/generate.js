const path = require('path')
const PDFDocument = require('pdfkit')
const v = require('@thi.ng/vectors')
const { Rect } = require('@thi.ng/geom')
const moment = require('moment')

const groupByPage = require('./group-by-page')

const {
  boardDuration,
  boardFilenameForPosterFrame,
  boardFileImageSize
} = require('../../models/board')

const {
  sceneDuration
} = require('../../models/scene')

const REGULAR = path.join(__dirname, '..', '..', '..', 'fonts', 'thicccboi', 'THICCCBOI-Regular.woff2')
const BOLD = path.join(__dirname, '..', '..', '..', 'fonts', 'thicccboi', 'THICCCBOI-Bold.woff2')
// via https://stackoverflow.com/questions/6565703
const fit = ([wi, hi], [ws, hs]) =>
  ws / hs > wi / hi
    ? [wi * hs / hi, hs]
    : [ws, hi * ws / wi]

const inset = (rect, depth) =>
  new Rect(
    v.add2([], rect.pos, depth),
    v.sub2([], rect.size, v.mulN([], depth, 2)),
    rect.attribs
  )

// via shot-core
const durationMsecsToString = msecs => {
  let t = msecs / 1000
  let h = Math.floor(t / (60 * 60)) % 24
  let m = Math.floor(t / 60) % 60
  let s = Math.floor(t % 60)
  let parts = (h > 0) ? [h, m, s] : [m, s]
  return parts.map(v => v.toString().padStart(2, '0')).join(':')
}

const HUMANIZED_ASPECT_RATIOS = {
  '2.390': '2.39:1',
  '2.000': '2.00:1',
  '1.850': '1.85:1',
  '1.778': '16:9',
  '0.563': '9:16',
  '1.000': '1:1',
  '1.334': '4:3'
}

const humanizeAspectRatio = aspectRatio => {
  let index = Number(aspectRatio).toFixed(3)
  return HUMANIZED_ASPECT_RATIOS[index] || index.toString()
}

const drawHeader = (doc, { rect, projectTitle, pageData, pagination, stats }, cfg) => {
  const { pos, size } = rect.copy()

  const rems = n => Math.round(n * 16)

  let separator = ' / '
  let between = 0.25

  doc.save()

  if (projectTitle) {
    doc
      .font(REGULAR)
      .fontSize(rems(1.25))
      .fillColor('black')
      .text(
        projectTitle + ' / ',
        pos[0], pos[1] + rems(1.25),
        { continued: true, baseline: 'bottom', width: size[0] }
      )
  }
  doc
    .font(BOLD)
    .fontSize(rems(1.25))
    .fillColor('black')
    .text(
      pageData.scene.title.toUpperCase(),
        pos[0], pos[1] + rems(1.25),
      { baseline: 'bottom', width: size[0] }
    )
    .moveUp()
    .fontSize(rems(1))
    .font(REGULAR)
    .moveDown(between)

  doc
    .fontSize(rems(0.75))
    .font(REGULAR)
      .text(`Boards `, { continued: true })
    .font(BOLD)
      .text(`${stats.boards}`, { continued: true })
    .font(REGULAR)
      .text(separator, { continued: true })
  doc
    .font(REGULAR)
      .text(`Shots `, { continued: true })
    .font(BOLD)
      .text(`${stats.shots}`, { continued: true })
    .font(REGULAR)
      .text(separator, { continued: true })
  doc
    .font(REGULAR)
      .text(`Duration `, { continued: true })
    .font(BOLD)
      .text(`${durationMsecsToString(stats.sceneDuration)}`, { continued: true })
    .font(REGULAR)
      .text(separator, { continued: true })
  doc
    .font(REGULAR)
      .text(`Aspect Ratio `, { continued: true })
    .font(BOLD)
      .text(`${humanizeAspectRatio(stats.aspectRatio)}`)
    .font(REGULAR)
    .moveDown(between)

  doc
    .font(REGULAR)
      .text(`Exported `, { continued: true })
    .font(BOLD)
      .text(`${stats.date}`)

  doc
    .font(REGULAR)
    .fontSize(rems(6/8))
    .text(`${pagination.curr + 1} / ${pagination.total}`, ...pos, {
      width: size[0],
      align: 'right'
    })

  doc.restore()
}

const drawBoard = (doc, { direction, ...options }, cfg) =>
  direction == 'column'
  ? drawBoardColumn(doc, options, cfg)
  : direction == 'row'
  ? drawBoardRow(doc, options, cfg)
  : null

const drawBoardRow = (doc, { rect, scene, board, imagesPath }, cfg) => {
  let inner = rect.copy()
  v.sub2(null, inner.size, [10, 0])

  let imageR = inset(inner, [5, 5])
  imageR.size = fit(
    boardFileImageSize(scene),
    imageR.size
  )

  let cellA = inner.copy()
  cellA.size[0] = (cellA.size[0] * 0.1) - 1

  imageR.pos[0] += cellA.size[0] + 1

  let imageB = inset(imageR, [-5, -5])

  let cellB = inner.copy()
  cellB.pos[0] = imageR.pos[0] + imageR.size[0] + 1 + 5
  cellB.size[0] -= cellA.size[0] + 1 + imageR.size[0] + 1 + 10

  let cellAinner = inset(cellA, [5, 5])
  let cellBinner = inset(cellB, [5, 5])

  doc
    .rect(...imageB.pos, ...imageB.size)
    .fillColor('black')
    .fill()
  doc
    .rect(...imageR.pos, ...imageR.size)
    .fillColor('blue')
    .fill()

  //
  //
  // image
  //
  doc.image(
    path.join(imagesPath, boardFilenameForPosterFrame(board)),
    ...imageR.pos,
    { fit: imageR.size }
  )

  //
  //
  // new shot marker
  //
  if (board.newShot) {
    let marker = inner.copy()
    // width
    marker.size[0] = 3
    marker.pos[0] -= 3 // offset
    doc
      .rect(...marker.pos, ...marker.size)
      .fillColor('black')
      .strokeColor('black')
      .lineWidth(1)
      .fillAndStroke()
  }

  //
  //
  // borders
  //
  doc
    .strokeColor('#333')
    .strokeOpacity(1)
    .lineWidth(1)
    .rect(...inner.pos, ...inner.size)
    .stroke()
  //
  //
  // shot number
  //
  doc
    .fontSize(10)
    .fillColor('black')
    .text(board.shot, ...cellAinner.pos)

  //
  //
  // board text
  //
  let entries = [
    { text: board.dialogue },
    { text: board.action },
    { text: board.notes },
    { text: durationMsecsToString(boardDuration(scene, board)) }
  ]
  for (let e = 0; e < entries.length; e++) {
    let textR = cellBinner.copy()
    textR.size[0] *= 1 / entries.length
    textR.pos[0] += textR.size[0] * e
    textR.size[0] -= 5

    let entry = entries[e]
    if (entry.text) {
    doc
      .save()
      .rect(...textR.pos, ...textR.size)
      .clip()
        .fontSize(10)
        .fillColor('black')
        .text(
          entry.text,
          ...textR.pos,
          {
            align: e == 0
              ? 'left'
              : e == entries.length - 1
              ? 'right'
              : 'center',
            width: textR.size[0],
            height: textR.size[1]
          }
        )
      .restore()
    }
  }
}

const drawBoardColumn = (doc, { rect, scene, board, imagesPath }, cfg) => {
  let inner = rect.copy()
  v.sub2(null, inner.size, [10, 10])

  // reserve max 60% height for image
  let imageR = inner.copy()
  imageR.size = fit(
    boardFileImageSize(scene),
    v.mul2([], inner.size, [1, 0.6])
  )

  inner.size[0] = imageR.size[0]

  let remainingH = inner.size[1] - imageR.size[1]

  // upper: 30%, max 3x font size
  let upperR = inner.copy()
  upperR.size[1] = remainingH * 0.3
  upperR.size[1] = Math.min(upperR.size[1], 12 * 3)
  upperR = inset(upperR.copy(), [5, 0])
  // lower: 70%
  let lowerR = inner.copy()
  lowerR.size[1] = remainingH - upperR.size[1]

  upperR.pos[1] = inner.pos[1]
  imageR.pos[1] = upperR.pos[1] + upperR.size[1]
  lowerR.pos[1] = imageR.pos[1] + imageR.size[1]

  lowerR = inset(lowerR.copy(), [3, 3])

  //
  //
  // image
  //
  doc.image(
    path.join(imagesPath, boardFilenameForPosterFrame(board)),
    ...imageR.pos,
    { fit: imageR.size }
  )

  //
  //
  // new shot marker
  //
  if (board.newShot) {
    let marker = inner.copy()
    // width
    marker.size[0] = 2
    marker.pos[0] -= (2 + 0.5) // border
    doc
      .rect(...marker.pos, ...marker.size)
      .fillColor('black')
      .strokeColor('black')
      .lineWidth(1)
      .fillAndStroke()
  }

  //
  //
  // upper
  //
  let middle = [upperR.pos[0], upperR.pos[1] + upperR.size[1] * 0.5]
  doc
    .fontSize(10)
    .fillColor('black')
    .text(board.shot, ...middle, {
      baseline: 'middle'
    })
  doc
    .fontSize(10)
    .fillColor('black')
    .text(durationMsecsToString(boardDuration(scene, board)), ...middle, {
      width: upperR.size[0],
      align: 'right',
      baseline: 'middle'
    })

  //
  //
  // lower
  //
  doc
    .save()
    .rect(...lowerR.pos, ...lowerR.size)
    .clip()
  let entries = [
    board.dialogue && { text: board.dialogue },
    board.action && { text: board.action },
    board.notes && { text: board.notes }
  ].filter(Boolean)
  for (let e = 0; e < entries.length; e++) {
    let entry = entries[e]

    let textR = lowerR.copy()
    textR.size[1] *= 1 / entries.length
    textR.pos[1] += textR.size[1] * e

    doc
      .fontSize(11)
      .fillColor('black')
      .text(
        entry.text,
        ...textR.pos,
        {
          width: textR.size[0],
          height: textR.size[1]
        }
      )
  }
  doc.restore()

  //
  //
  // borders
  //
  doc
    .strokeColor('#333')
    .strokeOpacity(1)
    .lineWidth(1)
    .rect(...inner.pos, ...inner.size)
    .stroke()
  doc
    .strokeColor('#333')
    .strokeOpacity(1)
    .lineWidth(1)
    .rect(...imageR.pos, ...imageR.size)
    .stroke()
}

const drawFooter = (doc, { rect }, cfg) => {
  let inner = inset(rect.copy(), [12, 4])

  let text = "Storyboarder by \\\\ wonder unit"
  doc
    .save()
    .font(REGULAR)
    .fontSize(10)
    .fillColor('black')
    .fillOpacity(0.6)
    .text(
      text,
      ...v.add2([], inner.pos, [0, inner.size[1] * 0.5 - 1/* optical */]),
      {
        align: 'right',
        baseline: 'middle',
        width: inner.size[0],
        features: ['liga']
      }
    )
    .restore()
}
async function generate (stream, { project }, cfg) {
  const { pageSize, gridDim, direction } = cfg

  let doc = new PDFDocument({
    autoFirstPage: false,
    size: cfg.pageSize
  })
  doc.pipe(stream)
  doc.registerFont(REGULAR, REGULAR)
  doc.registerFont(BOLD, BOLD)

  let pages = groupByPage(project.scenes, gridDim[0] * gridDim[1])

  let start = cfg.pages[0]
  let end = cfg.pages[1] + 1
  for (let pageData of pages.slice(start, end)) {
    const imagesPath = path.join(path.dirname(pageData.scene.storyboarderFilePath), 'images')

    doc.addPage({
      margins: { top: 30, right: 30, bottom: 30, left: 30 },
      size: cfg.pageSize
    })

    let pg = new Rect(
      [
        doc.page.margins.left,
        doc.page.margins.top
      ],
      [
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        doc.page.height - doc.page.margins.top - doc.page.margins.bottom
      ]
    )

    let header = new Rect(v.copy(pg.pos), [pg.size[0], pg.size[1] * 1/6])
    let footer = new Rect(v.copy(pg.pos), [pg.size[0], pg.size[1] * 1/16])
    let grid = new Rect(v.copy(pg.pos), v.copy(pg.size))

    grid.size[1] = pg.size[1] - header.size[1] - footer.size[1]
    grid.pos[1] = header.pos[1] + header.size[1]
    footer.pos[1] = grid.pos[1] + grid.size[1]

    // doc

    const getBoardsCount = scene => scene.boards.length
    const getShotsCount = scene => scene.boards.filter((board, i) => i == 0 || board.newShot).length

    drawHeader(doc,
      {
        rect: header,
        projectTitle: project.title,
        pageData,
        stats: {
          boards: getBoardsCount(pageData.scene.data),
          shots: getShotsCount(pageData.scene.data),

          sceneDuration: sceneDuration(pageData.scene.data),
          aspectRatio: pageData.scene.data.aspectRatio,
          date: moment(new Date()).format('D MMM YYYY')
        },
        pagination: {
          curr: pageData.index,
          total: pages.length
        }
      },
      cfg
    )

    drawFooter(doc,
      {
        rect: footer
      },
      cfg
    )

    let template = new Rect(
      v.copy(grid.pos),
      v.div2([], grid.size, gridDim)
    )
    for (let n = 0; n < pageData.boards.length; n++) {
      let board = pageData.boards[n]

      let i, j
      if (direction == 'row') {
        i = Math.floor(n / gridDim[1])
        j = n % gridDim[1]
      } else if (direction == 'column') {
        i = n % gridDim[0]
        j = Math.floor(n / gridDim[0])
      }

      let cell = template.copy()
      v.add2(null, cell.pos, v.mul2([], cell.size, [i, j]))

      drawBoard(
        doc,
        {
          rect: cell,
          board,
          scene: pageData.scene.data,
          imagesPath,
          direction
        },
        cfg
      )
    }
  }

  doc.end()
}

module.exports = generate
