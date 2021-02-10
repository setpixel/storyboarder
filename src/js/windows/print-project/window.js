const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { shell, ipcRenderer } = require('electron')
const { Machine, assign, interpret } = require('xstate')
const React = require('react')
const ReactDOM = require('react-dom')
const { useService } = require('@xstate/react')

const pdfjsLib = require('pdfjs-dist')

const moment = require('moment')

const { getProjectData } = require('./data')
const generate = require('../../exporters/pdf')
const h = require('../../utils/h')

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../../node_modules/pdfjs-dist/build/pdf.worker.js'

const getData = () => ipcRenderer.invoke('exportPDF:getData')

// via https://stackoverflow.com/questions/6565703
const fit = ([wi, hi], [ws, hs]) =>
  ws / hs > wi / hi
    ? [wi * hs / hi, hs]
    : [ws, hi * ws / wi]

const px = n => `${n}px`

const preventDefault = (fn, ...args) => e => {
  e.preventDefault()
  fn(e, ...args)
}

const omit = (original = {}, keys = []) => {
  const clone = { ...original }
  for (const key of keys) {
    delete clone[key]
  }
  return clone
}

const range = (_, end) => new Array(end).fill(undefined).map((_, value) => value + 1)

const specs = {
  paperSize: {
    'a4': [841.89, 595.28],
    'letter': [792.0, 612.0]
  },
  rows: range(1, 10),
  columns: range(1, 10)
}

const getPaperSize = (key, orientation) => {
  let portrait = (a, b) => a - b
  let landscape = (a, b) => b - a
  let size = specs.paperSize[key]
  switch (orientation) {
    case 'portrait':
      return size.sort(portrait)
    case 'landscape':
      return size.sort(landscape)
  }
}

const getGeneratorConfig = context =>
  omit(context, ['paperSizeKey', 'orientation'])

const initialContext = {
  paperSizeKey: 'a4',
  orientation: 'landscape',
  paperSize: getPaperSize('a4', 'landscape'),

  gridDim: [2, 5],
  pageToPreview: 0,
  direction: 'row',

  pages: [0, 0],

  enableDialogue: true,
  enableAction: true,
  enableNotes: true,
  enableShotNumber: true,
  boardTimeDisplay: 'duration' // none, duration, TODO: sceneTime, scriptTime
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

const RadioGroup = ({ name, value, onChange, children }) =>
  React.createElement('div', { className: 'group' }, React.Children.map(children, child =>
    React.cloneElement(child, {
      ...child.props,
      checked: value == child.props.value,
      name,
      onChange
    })))

const Radio = ({ id, name, value, label, onChange, checked, title }) =>
  h(
    ['div.radio',
      { title },
      [`input#${name}-${value}`, 
        {
          value,
          type: 'radio',
          name,
          onChange,
          checked
        }],
        ['label', { htmlFor: `${name}-${value}` }, label]]
  )

const Checkbox = ({ name, value, label, onChange, checked }) =>
  h(
    ['div.checkbox',
      [`input#${name}`,
        {
          type: 'checkbox',
          onChange,
          checked
        }],
        ['label', { htmlFor: name }, label ]]
  )

const InputView = ({
  onClose,
  onExport,

  state,
  send,

  paperSizeKey,
  orientation,
  gridDim,
  direction,
  enableDialogue,
  enableAction,
  enableNotes,
  enableShotNumber,
  boardTimeDisplay
}) => {
  const setPaperSizeKey = event => send({
    type: 'SET_PAPER_SIZE_KEY',
    value: event.target.value
  })

  return h(
    [React.Fragment, [
      ['a.close', { href: '#', onClick: onClose }, '×'],

      ['form', { action: '#', className: ['generating', 'exporting'].some(state.matches) ? 'busy' : null },
        ['div.upper',
          ['h1.title', 'Print'],
          ['p', 'Your storyboard printed the way you like. Choose the format and either directly print or export it to PDF.'],

          ['fieldset',
            ['div',
              ['legend', { name: 'paper-size-key' }, 'Paper Size']
            ],
            [RadioGroup,
              {
                name: 'paper-size-key',
                value: paperSizeKey,
                onChange: setPaperSizeKey
              },
              [Radio, { value: 'a4', label: 'A4', title: 'A4 (8 ¼″ × 11 ¾″)' }],
              [Radio, { value: 'letter', label: 'Letter', title: 'Letter (8 ½″ × 11″)' }],
            ]
          ],

          ['fieldset',
            ['div',
              ['legend', { name: 'orientation' }, 'Orientation']
            ],
            [RadioGroup,
              {
                name: 'orientation',
                value: orientation,
                onChange: event => send({
                  type: 'SET_ORIENTATION',
                  value: event.target.value
                })
              },
              [Radio, { value: 'landscape', label: 'Landscape' }],
              [Radio, { value: 'portrait', label: 'Portrait' }],
            ]
          ],

          ['fieldset',
            ['div',
              ['legend', { name: 'grid' }, 'Grid']],
            ['div.group',
              ['div.select',
                ['select', {
                  value: gridDim[0],
                  onChange: event =>
                    send({ type: 'SET_GRID_ROWS', value: parseInt(event.target.value) })
                  },
                  specs.rows.map(value =>
                    ['option', { name: 'grid-rows', value: value }, value]
                  )
                ],
              ],
              ['span', '×'],
              ['div.select',
                ['select', {
                  value: gridDim[1],
                  onChange: event =>
                    send({ type: 'SET_GRID_COLUMNS', value: parseInt(event.target.value) })
                  },
                  specs.columns.map(value =>
                    ['option', { name: 'grid-columns', value: value }, value]
                  )
                ]
              ]
            ]
          ],

          ['fieldset',
            ['div',
              ['legend', { name: 'direction' }, 'Board Layout']
            ],
            [RadioGroup,
              {
                name: 'direction',
                value: direction,
                onChange: event => send({ type: 'SET_DIRECTION', value: event.target.value })
              },
              [Radio, { value: 'column', label: 'Standard' }],
              [Radio, { value: 'row', label: 'Japanese' }],
            ]
          ],

              ['div.collection',
                ['div', 'Boards'],
                ['fieldset',
                  ['div',
                    ['legend', { name: 'text' }, 'Text']],
                  ['div.group',
                    [Checkbox, {
                      name: 'text-dialogue',
                      label: 'Dialogue',
                      checked: enableDialogue,
                      onChange: preventDefault(event =>
                        send({ type: 'SET_ENABLE_DIALOGUE', value: event.target.checked })
                      )
                    }],
                    [Checkbox, {
                      name: 'text-action',
                      label: 'Action',
                      checked: enableAction,
                      onChange: preventDefault(event =>
                        send({ type: 'SET_ENABLE_ACTION', value: event.target.checked })
                      )
                    }],
                    [Checkbox, {
                      name: 'text-notes',
                      label: 'Notes',
                      checked: enableNotes,
                      onChange: preventDefault(event =>
                        send({ type: 'SET_ENABLE_NOTES', value: event.target.checked })
                      )
                    }]
                  ]],

                  ['fieldset',
                    ['div',
                      ['legend', { name: 'details' }, 'Details']],
                    ['div.group',
                      [Checkbox, {
                        name: 'details-shot-number',
                        label: 'Shot Number',
                        checked: enableShotNumber,
                        onChange: preventDefault(event =>
                          send({ type: 'SET_ENABLE_SHOT_NUMBER', value: event.target.checked })
                        )
                      }]
                    ]
                  ],

                  ['fieldset',
                    ['div',
                      ['legend', { name: 'board-time-display' }, 'Time']
                    ],
                    [RadioGroup,
                      {
                        name: 'board-time-display',
                        value: boardTimeDisplay,
                        onChange: event => send({ type: 'SET_BOARD_TIME_DISPLAY', value: event.target.value })
                      },
                      [Radio, { value: 'none', label: 'None' }],
                      [Radio, { value: 'duration', label: 'Duration' }], // Dur.
                      // [Radio, { value: 'sceneTime', label: 'Scene Time' }], // TODO Scene
                      // [Radio, { value: 'scriptTime', label: 'Script Time' }] // TODO Script
                    ]
                  ],
                  
                ],


        ],

          ['div.lower',
              ['div.row',
                  ['button', { onClick: onExport }, 'Export PDF']]]]



    
    ]]
  )
}

const PrintApp = ({ service }) => {
  const [state, send] = useService(service)

  const onClose = () => send('CLOSE')

  const onExport = preventDefault(event => {
    send('EXPORT')
    // exportToFile
  })

  return React.createElement(
    InputView, {
      onClose, onExport,
      state, send,
      ...state.context
  })
}

const exportToFile = async (context, event) => {
  const { project } = context

  let filename = getExportFilename(project, new Date())
  let filepath = path.join(project.root, 'exports', filename)
  fs.mkdirp(path.dirname(filepath))

  let stream = fs.createWriteStream(filepath)
  await generate(stream, { project }, getGeneratorConfig(context))

  console.log('Exported to ' + filepath)
  shell.showItemInFolder(filepath)
}

const generateToCanvas = async (canvas, context) => {
  let { project } = context

  let cfg = {
    ...context,
    pages: [context.pageToPreview, context.pageToPreview]
  }

  // create and save the file
  let outfile = getTempFilepath()
  let stream = fs.createWriteStream(outfile)
  await generate(stream, { project }, getGeneratorConfig(cfg))

  // load and render the file to the canvas
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

  let ctx = canvas.getContext('2d')
  let renderContext = {
    canvasContext: ctx,
    viewport: viewport
  }
  let renderTask = page.render(renderContext)
  await renderTask.promise
}

// TODO handle generate error
const machine = Machine({
  initial: 'generating',
  context: initialContext,
  states: {
    idle: {
      on: {
        'EXPORT': 'exporting',
        'SET_PAPER_SIZE_KEY': [
          {
            actions: assign((context, event) => ({
              paperSizeKey: event.value,
              paperSize: getPaperSize(event.value, context.orientation)
            })),
            target: 'generating'
          }
        ],
        'SET_ORIENTATION': [
          {
            actions: assign((context, event) => ({
              orientation: event.value,
              paperSize: getPaperSize(context.paperSizeKey, event.value)
            })),
            target: 'generating'
          }
        ],
        'SET_GRID_ROWS': [
          {
            actions: assign({ gridDim: ({ gridDim }, { value }) => [value, gridDim[1]] }),
            target: 'generating'
          }
        ],
        'SET_GRID_COLUMNS': [
          {
            actions: assign({ gridDim: ({ gridDim }, { value }) => [gridDim[0], value] }),
            target: 'generating'
          }
        ],
        'SET_DIRECTION': [
          {
            actions: assign({ direction: (_, { value }) => value }),
            target: 'generating'
          }
        ],
        'SET_ENABLE_DIALOGUE': [
          {
            actions: assign({ enableDialogue: (_, { value }) => value }),
            target: 'generating'
          }
        ],
        'SET_ENABLE_ACTION': [
          {
            actions: assign({ enableAction: (_, { value }) => value }),
            target: 'generating'
          }
        ],
        'SET_ENABLE_NOTES': [
          {
            actions: assign({ enableNotes: (_, { value }) => value }),
            target: 'generating'
          }
        ],
        'SET_ENABLE_SHOT_NUMBER': [
          {
            actions: assign({ enableShotNumber: (_, { value }) => value }),
            target: 'generating'
          }
        ],
        'SET_BOARD_TIME_DISPLAY': [
          {
            actions: assign({ boardTimeDisplay: (_, { value }) => value }),
            target: 'generating'
          }
        ]
      }
    },
    generating: {
      invoke: {
        src: (context, event) => generateToCanvas(context.canvas, context),
        onDone: {
          target: 'idle'
        },
        onError: {
          target: 'warning'
        }
      }
    },
    exporting: {
      invoke: {
        id: 'exportToFile',
        src: exportToFile,
        onDone: {
          target: 'idle'
        },
        onError: {
          target: 'warning'
        }
      },
    },
    warning: {
      invoke: {
        src: async (context, event) => {
          // TODO electron-log
          console.warn(event.data)
          alert(event.data)
        },
        onDone: 'idle'
      }
    },
    finished: {
      type: 'final'
    }
  },
  on: {
    'CLOSE': 'finished'
  }
})

const start = async () => {
  let project
  let canvas

  project = await getProjectData(await getData())

  canvas = document.createElement('canvas')
  document.querySelector('.output .inner').appendChild(canvas)

  const service = interpret(
    machine.withContext({
      ...machine.initialState.context,
      project,
      canvas
    })
  )
  .onTransition((state, event) => console.log(state, event))
  .onDone(() => window.close())

  ReactDOM.render(
    React.createElement(PrintApp, { service }),
    document.querySelector('.input')
  )

  document.addEventListener('keydown', event => {
    switch (event.key) {
      case 'Escape':
        service.send('CLOSE')
        break
    }
  })

  service.start()
}
start()
