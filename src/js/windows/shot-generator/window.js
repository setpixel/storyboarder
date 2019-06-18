const { ipcRenderer, shell } = electron = require('electron')
const { app } = electron.remote
const electronUtil = require('electron-util')

const React = require('react')
const { useRef } = React
const { Provider, connect } = require('react-redux')
const ReactDOM = require('react-dom')
const { ActionCreators } = require('redux-undo')
console.clear() // clear the annoying dev tools warning
const log = require('electron-log')
log.catchErrors()



// TODO use the main Storyboarder store instead of a special one for Shot Generator
//
// configureStore:
const { createStore, applyMiddleware, compose } = require('redux')
const thunkMiddleware = require('redux-thunk').default
const undoable = require('redux-undo').default
const { reducer } = require('../../shared/reducers/shot-generator')

const actionSanitizer = action => (
  action.type === 'ATTACHMENTS_SUCCESS' && action.payload ?
  { ...action, payload: { ...action.payload, value: '<<DATA>>' } } : action
)
const stateSanitizer = state => state.attachments ? { ...state, attachments: '<<ATTACHMENTS>>' } : state
const reduxDevtoolsExtensionOptions = {
  actionSanitizer,
  stateSanitizer
}
const composeEnhancers = (
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ &&
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__(reduxDevtoolsExtensionOptions)
  ) || compose
const configureStore = function configureStore (preloadedState) {
  const store = createStore(
    reducer,
    preloadedState,
    composeEnhancers(
      applyMiddleware(thunkMiddleware)
    )
  )
  return store
}



const h = require('../../utils/h')
const Editor = require('../../shot-generator/Editor')

const presetsStorage = require('../../shared/store/presetsStorage')
const { initialState, loadScene, resetScene, updateDevice, updateServer, setBoard } = require('../../shared/reducers/shot-generator')

const createServer = require('../../services/createServer')
const createDualShockController = require('../../shot-generator/DualshockController')

const XRServer = require('../../express-xr/app')
let xrServer


window.addEventListener('load', () => {
  ipcRenderer.send('shot-generator:window:loaded')
})

// TODO better error handling for user
// window.onerror = (message, source, lineno, colno, error) => {
//   alert(`An error occurred\n\n${message}\n\nin ${source}:${lineno}`)
// }

const store = configureStore({
  ...initialState,
  presets: {
    ...initialState.presets,
    scenes: {
      ...initialState.presets.scenes,
      ...presetsStorage.loadScenePresets().scenes
    },
    characters: {
      ...initialState.presets.characters,
      ...presetsStorage.loadCharacterPresets().characters
    },
    poses: {
      ...initialState.presets.poses,
      ...presetsStorage.loadPosePresets().poses
    }
  },
})



ipcRenderer.on('loadBoard', (event, { storyboarderFilePath, boardData, board }) => {
  let shot = board.sg

  store.dispatch({ type: 'SET_META_STORYBOARDER_FILE_PATH', payload: storyboarderFilePath })

  let aspectRatio = parseFloat(boardData.aspectRatio)
  store.dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })

  store.dispatch(setBoard( board ))

  if (shot) {
    store.dispatch(loadScene(shot.data))
    store.dispatch(ActionCreators.clearHistory())
  } else {
    store.dispatch(resetScene())
    store.dispatch(ActionCreators.clearHistory())
  }

  if (!xrServer) {
    xrServer = new XRServer({ store })
  }

})
ipcRenderer.on('update', (event, { board }) => {
  store.dispatch(setBoard( board ))
})

ipcRenderer.on('shot-generator:edit:undo', () => {
  store.dispatch( ActionCreators.undo() )
})
ipcRenderer.on('shot-generator:edit:redo', () => {
  store.dispatch( ActionCreators.redo() )
})


window.$r = { store }

// disabled for now so we can reload the window easily during development
// ipcRenderer.once('ready', () => {})

log.info('ready!')
electronUtil.disableZoom()

ReactDOM.render(
  h([
    Provider, { store }, [
      Editor
    ]
  ]),
  document.getElementById('main')
)

const throttle = require('lodash.throttle')
const updater = (values, changed) => {
  store.dispatch(updateDevice(
    0,
    {
      analog: {
        ...values.analog
      },
      motion: {
        ...values.motion
      },
      digital: {
        ...values.digital
      }
    }
  ))
}
createDualShockController(throttle(updater, 16, { leading: true }))

createServer({
  setInputAccel: payload => store.dispatch({ type: 'SET_INPUT_ACCEL', payload }),
  setInputMag: payload => store.dispatch({ type: 'SET_INPUT_MAG', payload }),
  setInputSensor: payload => store.dispatch({ type: 'SET_INPUT_SENSOR', payload }),
  setInputDown: payload => store.dispatch({ type: 'SET_INPUT_DOWN', payload }),
  setInputMouseMode: payload => store.dispatch({ type: 'SET_INPUT_MOUSEMODE', payload }),
  setInputOrbitMode: payload => store.dispatch({ type: 'SET_INPUT_ORBITMODE', payload }),
  
  updateServer: payload => store.dispatch(updateServer(payload))
})

// are we testing locally?
// SHOT_GENERATOR_STANDALONE=true npm start
if (process.env.SHOT_GENERATOR_STANDALONE) {
  log.info('loading shot from shot-generator.storyboarder')

  const fs = require('fs')
  const path = require('path')

  let storyboarderFilePath = path.join(
    __dirname, '..', '..', '..', '..', 'test', 'fixtures', 'shot-generator', 'shot-generator.storyboarder'
  )

  let file = JSON.parse(fs.readFileSync(storyboarderFilePath))

  let win = electron.remote.BrowserWindow.getAllWindows()
    .find(w => w.webContents.getURL() === window.location.toString())

  win.webContents.send('loadBoard', { storyboarderFilePath, boardData: file, board: file.boards[0] })

  // send storyboarderFilePath immediately so XRServer has access to it
  store.dispatch({ type: 'SET_META_STORYBOARDER_FILE_PATH', payload: storyboarderFilePath })

  xrServer = new XRServer({ store })
}

