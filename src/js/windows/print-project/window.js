const fs = require('fs-extra')
const path = require('path')
const { shell, ipcRenderer } = require('electron')

const pdfjsLib = require('pdfjs-dist')

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

const defaultCfg = {
  pageSize: [841.89, 595.28],
  gridDim: [3, 2],
  pageToPreview: 1
}
const run = async () => {
  let preview
  let rendering

  let canvas = document.createElement('canvas')
  document.querySelector('.output .inner').appendChild(canvas)

  let project = await getProjectData(await getData())

  let userCfg = JSON.parse(JSON.stringify(defaultCfg))
  document.querySelector('.input div[contenteditable]').innerText =
    JSON.stringify(userCfg, null, 2)

  const onInput = async () => {
    let newUserCfg
    try {
       newUserCfg = JSON.parse(document.querySelector('.input div[contenteditable]').innerText)
    } catch (err) {
      console.error('could not parse input')
    }
    if (newUserCfg) {
      await update(newUserCfg)
    }
  }
  document.querySelector('.input div[contenteditable]')
    .addEventListener('input', onInput)

  document.addEventListener('keydown', event => {
    if (event.key == 'Escape') {
      window.close()
    }
  })

  const getExportFilename = (project, date) => {
    let base = project.scenes.length > 1
      ? path.parse(project.scriptFilepath).name
      : path.parse(project.scenes[0].storyboarderFilePath).name
    let datestamp = moment(date).format('YYYY-MM-DD hh.mm.ss')
    return filename = `${base} ${datestamp}.pdf`
  }

  document.querySelector('[data-action="export"]')
    .addEventListener('click', event => {
      event.preventDefault()
      exportToFile()
    })

  const exportToFile = () => {
  }

  const px = n => `${n}px`

  const _update = async (userCfg) => {
    if (rendering) return

    let cfg = {
      ...defaultCfg,
      ...userCfg
    }

    rendering = true
    try {
      let data = await generate(project, cfg)
      rendering = false

      let task = pdfjsLib.getDocument({ data })
      let pdf = await task.promise
      let page = await pdf.getPage(cfg.pageToPreview)

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

  update(userCfg)
}

run()
