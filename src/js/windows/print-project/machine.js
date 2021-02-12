const { Machine, assign } = require('xstate')

const groupByPage = require('../../exporters/pdf/group-by-page')

const specs = {
  paperSize: {
    'a4': [841.89, 595.28],
    'letter': [792.0, 612.0]
  },
  rows: [1, 10],
  columns: [1, 10]
}

const getPaperSize = (key, orientation) => {
  let size = specs.paperSize[key]

  let portrait = (a, b) => a - b
  let landscape = (a, b) => b - a

  switch (orientation) {
    case 'portrait':
      return size.sort(portrait)
    case 'landscape':
      return size.sort(landscape)
  }
}

const initialContext = {
  paperSizeKey: 'a4',
  orientation: 'landscape',
  paperSize: getPaperSize('a4', 'landscape'),

  gridDim: [2, 5],
  direction: 'row',

  pages: [0, 0],

  // pages to preview (TODO constrain max, depends .pages)
  pageToPreview: 0,

  enableDialogue: true,
  enableAction: true,
  enableNotes: true,
  enableShotNumber: true,
  boardTimeDisplay: 'duration', // none, duration, TODO: sceneTime, scriptTime

  header: {
    stats: {
      boards: true,
      shots: true,
      sceneDuration: true,
      aspectRatio: true,
      dateExported: true
    }
  }
}

const createHeaderStatsAssigner = name => (context, event) => ({
  ...context,
  header: {
    ...context.header,
    stats: {
      ...context.header.stats,
      [name]: event.value
    }
  }
})

const gridRowsAssigner = ({ gridDim }, { value }) => ({
  gridDim: [value, gridDim[1]]
})

const gridColumnsAssigner = ({ gridDim }, { value }) => ({
  gridDim: [gridDim[0], value]
})

const pagesAssigner = (context, event) => {
  let { gridDim, project } = context
  let [rows, columns] = gridDim

  // TODO to improve performance, only calculate total number of pages
  let groups = groupByPage(project.scenes, rows * columns)

  return {
    pages: [0, groups.length - 1]
  }
}

const machine = Machine({
  id: 'print-project',
  context: initialContext,
  initial: 'busy',
  states: {
    available: {
      id: 'available',
      initial: 'idle',
      entry: [assign(pagesAssigner)],
      states: {
        idle: {
        },
        debouncing: {
          after: {
            1100: '#busy.generating'
          }
        }
      },
      on: {
        'EXPORT': 'busy.exporting',
        'SET_PAPER_SIZE_KEY': [
          {
            actions: assign((context, event) => ({
              paperSizeKey: event.value,
              paperSize: getPaperSize(event.value, context.orientation)
            })),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_ORIENTATION': [
          {
            actions: assign((context, event) => ({
              orientation: event.value,
              paperSize: getPaperSize(context.paperSizeKey, event.value)
            })),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_GRID_ROWS': [
          {
            actions: [assign(gridRowsAssigner), assign(pagesAssigner)],
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_GRID_COLUMNS': [
          {
            actions: [assign(gridColumnsAssigner), assign(pagesAssigner)],
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_DIRECTION': [
          {
            actions: assign({ direction: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_ENABLE_DIALOGUE': [
          {
            actions: assign({ enableDialogue: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_ENABLE_ACTION': [
          {
            actions: assign({ enableAction: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_ENABLE_NOTES': [
          {
            actions: assign({ enableNotes: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_ENABLE_SHOT_NUMBER': [
          {
            actions: assign({ enableShotNumber: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_BOARD_TIME_DISPLAY': [
          {
            actions: assign({ boardTimeDisplay: (_, { value }) => value }),
            target: '.debouncing',
            internal: false
          }
        ],


        'SET_HEADER_STATS_BOARDS': [
          {
            actions: assign(createHeaderStatsAssigner('boards')),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_HEADER_STATS_SHOTS': [
          {
            actions: assign(createHeaderStatsAssigner('shots')),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_HEADER_STATS_SCENE_DURATION': [
          {
            actions: assign(createHeaderStatsAssigner('sceneDuration')),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_HEADER_STATS_ASPECT_RATIO': [
          {
            actions: assign(createHeaderStatsAssigner('aspectRatio')),
            target: '.debouncing',
            internal: false
          }
        ],
        'SET_HEADER_STATS_DATE_EXPORTED': [
          {
            actions: assign(createHeaderStatsAssigner('dateExported')),
            target: '.debouncing',
            internal: false
          }
        ],
      }
    },
    busy: {
      id: 'busy',
      initial: 'generating',
      states: {
        generating: {
          invoke: {
            src: 'generateToCanvas',
            onDone: {
              target: '#available'
            },
            onError: {
              target: '#warning'
            }
          }
        },
        exporting: {
          invoke: {
            src: 'exportToFile',
            onDone: {
              target: '#available'
            },
            onError: {
              target: '#warning'
            }
          },
        }
      }
    },
    warning: {
      id: 'warning',
      invoke: {
        src: 'displayWarning',
        onDone: '#available'
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

module.exports = { specs, machine }
