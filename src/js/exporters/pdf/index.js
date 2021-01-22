const PDFDocument = require('pdfkit')

const groupByPage = require('./group-by-page')
const toPdfJs = require('./to-pdf-js')

async function generate (project, cfg) {
  const { pageSize, gridDim } = cfg

  let doc = new PDFDocument({
    autoFirstPage: false,
    size: cfg.pageSize
  })

  let pages = groupByPage(project.scenes, gridDim[0] * gridDim[1])

  for (let pageData of pages) {
    doc.addPage()
    if (project.title) {
      doc.text(`project: ${project.title} `, { continued: true })
    }
    doc.text(`scene: ${pageData.scene.title}`)
    doc.text(`page: ${pageData.index + 1}`)
    doc.text(`rows: ${gridDim[0]} columns: ${gridDim[1]}`)

  console.log(
    cfg.pageSize,
    doc.page.width,
    doc.page.height
  )

    doc
      .rect(0, 0, doc.page.width, doc.page.height)
      .lineWidth(10)
      .strokeColor('red')
      .stroke()

    for (let n = 0; n < pageData.boards.length; n++) {
      let board = pageData.boards[n]
      let i = n % gridDim[0]
      let j = Math.floor(n / gridDim[0])

      // console.log(board.shot, i, j)
    }
  }

  doc.end()
  return await toPdfJs(doc)
}

module.exports = generate
