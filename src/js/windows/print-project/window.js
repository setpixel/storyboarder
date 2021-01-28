const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { shell, ipcRenderer } = require('electron')

const pdfjsLib = require('pdfjs-dist')

// const { Rect } = require('@thi.ng/geom')
// const v = require('@thi.ng/vectors')
const debounce = require('lodash.debounce')
const moment = require('moment')

const { getProjectData } = require('./data')
const generate = require('../../exporters/pdf')

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../../node_modules/pdfjs-dist/build/pdf.worker.js'

const getData = () => ipcRenderer.invoke('exportPDF:getData')

// via https://stackoverflow.com/questions/6565703
const fit = ([wi, hi], [ws, hs]) =>
  ws / hs > wi / hi
    ? [wi * hs / hi, hs]
    : [ws, hi * ws / wi]

const px = n => `${n}px`

const defaultCfg = {
  pageSize: [841.89, 595.28],
  gridDim: [3, 2],
  pages: [0, 0],
  pageToPreview: 0
}
// memoize tmp filepath
const createGetTempFilepath = function () {
  let filepath
  return function () {
    if (filepath) {
      return filepath
    } else {
      let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboarder-'))
      filepath = path.join(directory, 'export.pdf')
      console.log('writing to', filepath)
      return filepath
    }
  }
}
const getTempFilepath = createGetTempFilepath()

const getExportFilename = (project, date) => {
  let base = project.scenes.length > 1
    ? path.parse(project.scriptFilepath).name
    : path.parse(project.scenes[0].storyboarderFilePath).name
  let datestamp = moment(date).format('YYYY-MM-DD hh.mm.ss')
  return filename = `${base} ${datestamp}.pdf`
}

const run = async () => {
  // state
  let rendering
  let exporting
  let project
  let userCfg

  let canvas = document.createElement('canvas')
  document.querySelector('.output .inner').appendChild(canvas)

  let inputEl = document.querySelector('.input div[contenteditable]')

  project = await getProjectData(await getData())

  userCfg = JSON.parse(JSON.stringify(defaultCfg))
  inputEl.innerText = JSON.stringify(userCfg, null, 2)

  const onInput = async () => {
    let curr
    let value = inputEl.innerText

    try {
      curr = JSON.parse(value)
    } catch (err) {
      console.error('could not parse input')
      return
    }

    userCfg = curr
    await update()
  }
  inputEl.addEventListener('input', onInput)

  document.addEventListener('keydown', event => {
    if (event.key == 'Escape') {
      window.close()
    }
  })

  document.querySelector('[data-action="export"]')
    .addEventListener('click', event => {
      event.preventDefault()
      exportToFile()
    })

  const exportToFile = async () => {
    if (exporting) return

    let filename = getExportFilename(project, new Date())
    let filepath = path.join(project.root, 'exports', filename)
    fs.mkdirp(path.dirname(filepath))

    exporting = true
    try {
      let stream = fs.createWriteStream(filepath)

      let cfg = {
        ...defaultCfg,
        ...userCfg
      }
      await generate(stream, { project }, cfg)

      console.log('Exported to ' + filepath)
      shell.showItemInFolder(filepath)
    } catch (err) {
      console.error(err)
    } finally {
      exporting = false
    }
  }

  const _update = async () => {
    if (rendering) return

    let cfg = {
      ...defaultCfg,
      ...userCfg,
      pages: [userCfg.pageToPreview, userCfg.pageToPreview]
    }

    rendering = true
    try {
      let outfile = getTempFilepath()
      let stream = fs.createWriteStream(outfile)
      await generate(stream, { project }, cfg)
      rendering = false

      let task = pdfjsLib.getDocument(outfile)
      let pdf = await task.promise
      let page = await pdf.getPage(1)

      let available = canvas.parentNode.getBoundingClientRect()
      let full = page.getViewport({ scale: 1 })

      let [width, height] = fit([full.width, full.height], [available.width, available.height])

      let scale = Math.min((width / full.width), (height / full.height))

      let viewport = page.getViewport({ scale: scale * window.devicePixelRatio })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = px(viewport.width / window.devicePixelRatio)
      canvas.style.height = px(viewport.height / window.devicePixelRatio)

      let context = canvas.getContext('2d')
      let renderContext = {
        canvasContext: context,
        viewport: viewport
      }
      let renderTask = page.render(renderContext)
      await renderTask.promise
    } catch (err) {
      console.error(err)
    } finally {
      rendering = false
    }
  }

  let update = debounce(_update, 500)

  update()
}

run()
