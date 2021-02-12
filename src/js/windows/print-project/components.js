const React = require('react')
const { useService } = require('@xstate/react')
const h = require('../../utils/h')
const { specs } = require('./machine')

const preventDefault = (fn, ...args) => e => {
  e.preventDefault()
  fn(e, ...args)
}

var range = (start, end) =>
  [...Array(end - start + 1)].map((_, i) => start + i)

const RadioGroup = ({ name, value, onChange, children }) =>
  React.createElement('div', { className: 'group' }, React.Children.map(children, child =>
    React.cloneElement(child, {
      ...child.props,
      checked: value == child.props.value,
      name,
      onChange
    })))

const Radio = ({ name, value, label, onChange, checked, title }) =>
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

const Checkbox = ({ name, label, onChange, checked }) =>
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
  boardTimeDisplay,
  boardTextSize,
  header
}) => {
  const setPaperSizeKey = event => send({
    type: 'SET_PAPER_SIZE_KEY',
    value: event.target.value
  })

  return h(
    [React.Fragment, [
      ['a.close', { href: '#', onClick: onClose }, '×'],

      ['form', { action: '#', className: state.matches('busy') ? 'busy' : null },
        ['div.upper',
          ['h1.title', 'Print'],

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
                  range(...specs.rows).map(value =>
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
                  range(...specs.columns).map(value =>
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
                  ['div', 'Header'],

              //     ['fieldset',
              //         ['div',
              //             ['legend', { name: 'header-pages' }, 'Pages']],
              //         ['div.group',
              //             ['div.radio',
              //                 ['input#pages-none', 
              //                     {
              //                         defaultChecked: 'checked',
              //                         value: 'none',
              //                         type: 'radio',
              //                         name: 'pages',
              //                     }],
              //                 ['label', { htmlFor: 'pages-none' }, 'None']],
              //             ['div.radio',
              //                 ['input#pages-all', 
              //                     {
              //                         value: 'all',
              //                         type: 'radio',
              //                         name: 'pages',
              //                     }],
              //                 ['label', { htmlFor: 'pages-all' }, 'All']],
              //             ['div.radio',
              //                 ['input#pages-scene', 
              //                     {
              //                         value: 'scene',
              //                         type: 'radio',
              //                         name: 'pages',
              //                     }],
              //                 ['label', { htmlFor: 'pages-scene' }, 'First of Scene']]]],

              ['fieldset',
                ['div',
                  ['legend', { name: 'stats' }, 'Stats']],
                ['div.group',

                  [Checkbox, {
                    name: 'stats-boards',
                    label: 'Boards',
                    checked: header.stats.boards,
                    onChange: event =>
                      send({ type: 'SET_HEADER_STATS_BOARDS', value: event.target.checked })
                  }],
                  [Checkbox, {
                    name: 'stats-shots',
                    label: 'Shots',
                    checked: header.stats.shots,
                    onChange: event =>
                      send({ type: 'SET_HEADER_STATS_SHOTS', value: event.target.checked })
                  }],
                  [Checkbox, {
                    name: 'stats-scene-duration',
                    label: 'Duration',
                    checked: header.stats.sceneDuration,
                    onChange: event =>
                      send({ type: 'SET_HEADER_STATS_SCENE_DURATION', value: event.target.checked })
                  }],
                  [Checkbox, {
                    name: 'stats-aspect-ratio',
                    label: 'Aspect Ratio',
                    checked: header.stats.aspectRatio,
                    onChange: event =>
                      send({ type: 'SET_HEADER_STATS_ASPECT_RATIO', value: event.target.checked })
                  }],
                  [Checkbox, {
                    name: 'stats-date-exported',
                    label: 'Date',
                    checked: header.stats.dateExported,
                    onChange: event =>
                      send({ type: 'SET_HEADER_STATS_DATE_EXPORTED', value: event.target.checked })
                  }],

                ]],
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
                      onChange: (event =>
                        send({ type: 'SET_ENABLE_DIALOGUE', value: event.target.checked })
                      )
                    }],
                    [Checkbox, {
                      name: 'text-action',
                      label: 'Action',
                      checked: enableAction,
                      onChange: (event =>
                        send({ type: 'SET_ENABLE_ACTION', value: event.target.checked })
                      )
                    }],
                    [Checkbox, {
                      name: 'text-notes',
                      label: 'Notes',
                      checked: enableNotes,
                      onChange: (event =>
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
                        onChange: (event =>
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

                  ['fieldset',
                    ['div',
                      ['legend', { name: 'board-text-size' }, 'Text Size']
                    ],

                    ['.select',
                      ['select', {
                        value: boardTextSize,
                        onChange: event =>
                          send({ type: 'SET_BOARD_TEXT_SIZE', value: parseInt(event.target.value) })
                        },
                        range(...specs.boardTextSize).map(value =>
                          ['option', { name: 'board-text-size', value: value }, value]
                        )
                      ]
                    ]
                  ]

                ],

              // ['details', { open: true },
              //     ['summary', 'Pagination'],
              //     ['div.group',
              //         ['div.checkbox',
              //             ['input#pagination-header', { type: 'checkbox' }],
              //             ['label', { htmlFor: 'pagination-header' }, 'Header']],
              //         ['div.checkbox',
              //             ['input#pagination-footer', { type: 'checkbox' }],
              //             ['label', { htmlFor: 'pagination-footer' }, 'Footer']]]]],

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

  const onExport = preventDefault(event => send('EXPORT'))

  return React.createElement(
    InputView, {
      onClose, onExport,
      state, send,
      ...state.context
  })
}

module.exports = {
  PrintApp
}
