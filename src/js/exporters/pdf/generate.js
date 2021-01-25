const PDFDocument = require('pdfkit')
const groupByPage = require('./group-by-page')
const toPdfJs = require('./to-pdf-js')

const v = require('@thi.ng/vectors')
const { Rect } = require('@thi.ng/geom')

const fonts = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold'
}

const inset = (rect, depth) =>
  new Rect(
    v.add2([], rect.pos, depth),
    v.sub2([], rect.size, v.mulN([], depth, 2)),
    rect.attribs
  )

async function generate (project, cfg) {
  const { pageSize, gridDim } = cfg

  let doc = new PDFDocument({
    autoFirstPage: false,
    size: cfg.pageSize
  })

  let pages = groupByPage(project.scenes, gridDim[0] * gridDim[1])

  for (let pageData of pages) {
    doc.addPage({
      margin: 20,
      size: cfg.pageSize
    })

    let pg = new Rect(
      [
        doc.page.margins.left,
        doc.page.margins.right
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
    //   .rect(...header.pos, ...header.size)
    //   .lineWidth(1)
    //   .strokeColor('red')
    //   .stroke()
    doc
      .rect(...grid.pos, ...grid.size)
      .lineWidth(1)
      .fillColor('blue')
      .fill()
    doc
      .rect(...footer.pos, ...footer.size)
      .lineWidth(1)
      .fillColor('green')
      .fill()

    doc.save()
    // account for margin
    doc.translate(-doc.page.margins.left, -doc.page.margins.right)
    doc.translate(...header.pos)
    doc
      .rect(...header.pos, ...header.size)
      .lineWidth(1)
      .fillColor('red')
      .fill()

    if (project.title) {
      doc
        .fillColor('black')
        .fontSize(16)
        .font(fonts.regular)
        .moveDown(1)
        .text(project.title + ' / ', { continued: true, baseline: 'bottom' })
    }
    doc
      .fontSize(16)
      .font(fonts.bold)
      .text(pageData.scene.title, { baseline: 'bottom' })

    doc.font(fonts.regular)
    doc.text(`page: ${pageData.index + 1}`)
    doc.restore()


    let template = new Rect(
      v.copy(grid.pos),
      v.div2([], grid.size, gridDim)
    )

    for (let n = 0; n < pageData.boards.length; n++) {
      let board = pageData.boards[n]
      let i = n % gridDim[0]
      let j = Math.floor(n / gridDim[0])

      let cell = template.copy()
      v.add2(null, cell.pos, v.mul2([], cell.size, [i, j]))

      doc
        .rect(...cell.pos, ...cell.size)
        .lineWidth(1)
        .fillColor('orange')
        .fill()

      let inner = inset(cell, [12, 12])
      doc
        .rect(...inner.pos, ...inner.size)
        .lineWidth(1)
        .fillColor('white')
        .fill()
      doc
        .fontSize(12)
        .fillColor('black')
        .text(board.shot, ...inner.pos)
    }
  }

  doc.end()
  return await toPdfJs(doc)
}

module.exports = generate
