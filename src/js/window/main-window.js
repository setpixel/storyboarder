const {ipcRenderer, shell, remote, nativeImage, clipboard} = require('electron')
const { app } = require('electron').remote
const child_process = require('child_process')
const fs = require('fs-extra')
const path = require('path')
const menu = require('../menu')
const util = require('../utils/index')
const sortFilePaths = require('../utils/sortFilePaths')
const Color = require('color-js')
const plist = require('plist')
const R = require('ramda')
const CAF = require('caf')
const isDev = require('electron-is-dev')
const log = require('../shared/storyboarder-electron-log')
log.catchErrors()
const ReactDOM = require('react-dom')
const { useEffect } = require('react')
const h = require('../utils/h')
const ShotGeneratorPanel = require('./components/ShotGeneratorPanel')

const { getInitialStateRenderer } = require('electron-redux')
const configureStore = require('../shared/store/configureStore')
const observeStore = require('../shared/helpers/observeStore')


const StoryboarderSketchPane = require('./storyboarder-sketch-pane')
const { SketchPane } = require('alchemancy')
const SketchPaneUtil = require('alchemancy').util
const undoStack = require('../undo-stack')

const Toolbar = require('./toolbar')
const tooltips = require('./tooltips')
const ContextMenu = require('./context-menu')
const ColorPicker = require('./color-picker')
const PomodoroTimerView = require('./pomodoro-timer-view')
const Transport = require('./transport')
const notifications = require('./notifications')
const NotificationData = require('../../data/messages.json')
const Guides = require('./guides')
const OnionSkin = require('./onion-skin')
const Sonifier = require('./sonifier/index')
const LayersEditor = require('./layers-editor')
const DiagnosticsView = require('./diagnostics-view')
const sfx = require('../wonderunit-sound')
const keytracker = require('../utils/keytracker')
const createIsCommandPressed = keytracker.createIsCommandPressed
const SceneTimelineView = require('./scene-timeline-view')

const storyTips = new(require('./story-tips'))(sfx, notifications)
const exporter = require('./exporter')
const exporterCommon = require('../exporters/common')
const exporterCopyProject = require('../exporters/copy-project')
const exporterArchive = require('../exporters/archive')
const exporterWeb = require('../exporters/web')
const exporterPsd = require('../exporters/psd')

const importerPsd = require('../importers/psd')

const sceneSettingsView = require('./scene-settings-view')

const boardModel = require('../models/board')
const watermarkModel = require('../models/watermark')

const AudioPlayback = require('./audio-playback')
const AudioFileControlView = require('./audio-file-control-view')

const LinkedFileManager = require('./linked-file-manager')

const getIpAddress = require('../utils/getIpAddress')

const pkg = require('../../../package.json')
const { scaleBy, setScale, resizeScale, initialize} = require('../utils/uiScale')

const sharedObj = remote.getGlobal('sharedObj')
//#region Localization 
const i18n = require('../services/i18next.config')
i18n.on('loaded', (loaded) => {
  let lng = ipcRenderer.sendSync("getCurrentLanguage")
  i18n.changeLanguage(lng, () => {
    i18n.on("languageChanged", changeLanguage)
    updateHTMLText()
  })
  i18n.off('loaded')
})

const changeLanguage = (lng) => {
  if(remote.getCurrentWindow().isFocused()) {
    menu.setMenu(i18n)
  }
  ipcRenderer.send("languageChanged", lng)
}

ipcRenderer.on("languageChanged", (event, lng) => {
  i18n.off("languageChanged", changeLanguage)
  i18n.changeLanguage(lng, () => {
    i18n.on("languageChanged", changeLanguage)
    updateHTMLText()
  })
})

const translateHtml = (elementName, traslationKey) => {
  document.querySelector(elementName).innerHTML = i18n.t(`${traslationKey}`)
}

const translateCheckbox = (elementName, traslationKey) => {
  let childNodes = document.querySelector(elementName).childNodes
  if(childNodes.length === 0) return
  childNodes[childNodes.length - 1].textContent = i18n.t(traslationKey)
}

const GridView = require("./components/GridView")
const { setEtag, getEtag } = require('../utils/etags')
const translateTooltip = (elementName, traslationKey) => {
  let element = document.querySelector(elementName)
  if(!element) return
  element.setAttribute("data-tooltip-title", i18n.t(`${traslationKey}.title`))
  element.setAttribute("data-tooltip-description", i18n.t(`${traslationKey}.description`))
}

ipcRenderer.on("languageModified", (event, lng) => {
  i18n.reloadResources(lng).then(() => updateHTMLText())
})

ipcRenderer.on("languageAdded", (event, lng) => {
  i18n.loadLanguages(lng).then(() => { i18n.changeLanguage(lng); menu.setWelcomeMenu(i18n)})
})

ipcRenderer.on("languageRemoved", (event, lng) => {
  i18n.changeLanguage(lng)
  menu.setWelcomeMenu(i18n)
})

const updateHTMLText = () => { 
  //#region Toolbar elements
    //#region Tools
    translateTooltip("#toolbar-light-pencil", "main-window.toolbar.tools.light-pencil")
    translateTooltip("#toolbar-brush", "main-window.toolbar.tools.brush")
    translateTooltip("#toolbar-tone", "main-window.toolbar.tools.tone")
    translateTooltip("#toolbar-pencil", "main-window.toolbar.tools.pencil")
    translateTooltip("#toolbar-pen", "main-window.toolbar.tools.pen")
    translateTooltip("#toolbar-light-pencil", "main-window.toolbar.tools.light-pencil")
    translateTooltip("#toolbar-note-pen", "main-window.toolbar.tools.note-pen")
    translateTooltip("#toolbar-eraser", "main-window.toolbar.tools.eraser")
    //#endregion
    //#region Colors
    translateTooltip("#toolbar-current-color", "main-window.toolbar.colors.current-color")
    translateTooltip(".toolbar-brush-modifier-controls_size", "main-window.toolbar.colors.controls-size")
    translateTooltip(".toolbar-brush-modifier-controls_stroke-opacity", "main-window.toolbar.colors.controls-stroke-opacity")
    translateTooltip("#toolbar-palette-colorA", "main-window.toolbar.colors.palette-colorA")
    translateTooltip("#toolbar-palette-colorB", "main-window.toolbar.colors.palette-colorB")
    translateTooltip("#toolbar-palette-colorC", "main-window.toolbar.colors.palette-colorC")
    //#endregion
    //#region Editing
    translateTooltip("#toolbar-trash", "main-window.toolbar.editing.toolbar-trash")
    translateTooltip("#toolbar-move", "main-window.toolbar.editing.toolbar-move")
    translateTooltip("#toolbar-scale", "main-window.toolbar.editing.toolbar-scale")
    translateTooltip("#toolbar-marquee", "main-window.toolbar.editing.toolbar-marquee")
    //#endregion
    //#region Undo / Redo
    translateTooltip("#toolbar-undo", "main-window.toolbar.actions.toolbar-undo")
    translateTooltip("#toolbar-redo", "main-window.toolbar.actions.toolbar-redo")
    //#endregion
    //#region Views
    translateTooltip("#toolbar-grid", "main-window.toolbar.view.toolbar-grid")
    translateTooltip("#toolbar-center", "main-window.toolbar.view.toolbar-center")
    translateTooltip("#toolbar-thirds", "main-window.toolbar.view.toolbar-thirds")
    translateTooltip("#toolbar-perspective", "main-window.toolbar.view.toolbar-perspective")
    translateTooltip("#toolbar-onion", "main-window.toolbar.view.toolbar-onion")
    translateTooltip("#toolbar-captions", "main-window.toolbar.view.toolbar-captions")
    //#endregion
    //#region Externals
    translateTooltip("#toolbar-open-in-editor", "main-window.toolbar.externals.toolbar-open-in-editor")
    //#endregion
    //#region prpomodoroomodoro
    translateTooltip("#toolbar-pomodoro-rest", "main-window.toolbar.pomodoro.toolbar-pomodoro-rest")
    translateTooltip("#toolbar-pomodoro-running", "main-window.toolbar.pomodoro.toolbar-pomodoro-running")
    //#endregion
    tooltips.update()
  //#endregion
  //#region board-information
  renderShotMetadata()

  translateCheckbox("#new-shot-label", "main-window.board-information.new-shot")
  translateCheckbox("#duration", "main-window.board-information.duration")
  translateTooltip("#line-mileage", "main-window.board-information.line-mileage")
  translateTooltip("#shot-generator-container", "main-window.board-information.shot-generator-container")
  translateTooltip("#new-shot", "main-window.board-information.new-shot-tooltip")
  translateTooltip("#duration-ms", "main-window.board-information.duration-ms")
  translateTooltip("#duration-fps", "main-window.board-information.duration-fps")
  translateHtml("#dialog-title", "main-window.board-information.dialog-title")
  translateTooltip("#suggested-dialogue-duration", "main-window.board-information.suggested-dialogue-duration")
  translateTooltip("#dialogue-tooltip", "main-window.board-information.dialogue-tooltip")
  translateHtml("#action-title", "main-window.board-information.action-title")
  translateTooltip("#action-tooltip", "main-window.board-information.action-tooltip")
  translateHtml("#note-title", "main-window.board-information.note-title")
  translateTooltip("#note-tooltip", "main-window.board-information.note-tooltip")
  translateHtml("#clear-note-title", "main-window.board-information.clear-note-title")
  translateTooltip("#clear-note-tooltip", "main-window.board-information.clear-note-tooltip")
  translateTooltip("#remove-audio", "main-window.board-information.remove-audio")
  translateHtml("#reference-layer-title", "main-window.board-information.reference-layer-title")
  translateTooltip("#reference-layer-tooltip", "main-window.board-information.reference-layer-tooltip")
  translateHtml("#clear-title", "main-window.board-information.clear-title")
  translateTooltip("#reference-layer-tooltip", "main-window.board-information.reference-layer-tooltip")
  
  translateTooltip("#merge-down-tooltip", "main-window.board-information.merge-down-tooltip")
  translateHtml("#merge-down-title", "main-window.board-information.merge-down-title")
  translateTooltip("#merge-up-tooltip", "main-window.board-information.merge-up-tooltip")
  translateHtml("#merge-up-title", "main-window.board-information.merge-up-title")
  translateTooltip("#layer-opacity-tooltip", "main-window.board-information.layer-opacity-tooltip")
  translateTooltip("#sts-random", "main-window.board-information.sts-random")
  translateTooltip("#sts-input1", "main-window.board-information.sts-input1")
  translateTooltip("#sts-select", "main-window.board-information.sts-select")
  translateTooltip("#sts-shots", "main-window.board-information.sts-shots")
  
  translateHtml("#scene", "main-window.board-information.scene")
  translateHtml("#frame-rate", "main-window.board-information.frame-rate")
  translateTooltip("#show-in-finder-button", "main-window.board-information.show-in-finder-button")
  translateHtml("#show-in-finder-title", "main-window.board-information.show-in-finder-title")
  
  translateTooltip("#prev-scene-tooltip", "main-window.playback.prev-scene-tooltip")
  translateTooltip("#prev-board-tooltip", "main-window.playback.prev-board-tooltip")
  translateTooltip("#play-tooltip", "main-window.playback.play-tooltip")
  translateTooltip("#next-board-tooltip", "main-window.playback.next-board-tooltip")
  translateTooltip("#next-scene-tooltip", "main-window.playback.next-scene-tooltip")

  //#endregion
}
//#endregion
const store = configureStore(getInitialStateRenderer(), 'renderer')
window.$r = { store } // for debugging, e.g.: $r.store.getStore()
const isCommandPressed = createIsCommandPressed(store)

const prefsModule = require('electron').remote.require('./prefs')
prefsModule.init(path.join(app.getPath('userData'), 'pref.json'))
// we're gradually migrating prefs to a reducer
// we read any 2.0 toolbar related prefs into the toolbar reducer manually
// NOTE this is async so preferences will be invalid until main IPC dispatches back to renderers
if (prefsModule.getPrefs().toolbar) {
  store.dispatch({
    type: 'TOOLBAR_MERGE_FROM_PREFERENCES', payload: prefsModule.getPrefs()
  })
}

const CanvasRecorder = require('../recording/canvas-recorder')
const moment = require('moment')
let isRecording = false
let isRecordingStarted = false
let canvasRecorder

let boardFilename // absolute path to .storyboarder
let boardPath
let boardData
let currentBoard = 0

let scriptFilePath // .fountain/.fdx, only used for multi-scene projects
let scriptData
let locations
let characters
let boardSettings
let currentPath
let currentScene = 0

let boardFileDirty = false
let boardFileDirtyTimer

let recordingToBoardIndex = undefined

let linkedFileManager

const ALLOWED_AUDIO_FILE_EXTENSIONS = [
  'wav',
  'mp3',
  'm4a',
  'mp4'
]

let imageFileDirtyTimer
let isSavingImageFile = false // lock for saveImageFile

let drawIdleTimer
let editModeState = false 
let isEditMode = () => editModeState || gridView.IsEditMode
let editModeTimer
let enableEditModeDelay = 750 // msecs
let periodicDragUpdateTimer
let periodicDragUpdatePeriod = 30 // msecs
let mouseDragStartX

let textInputMode = false
let textInputAllowAdvance = false

let viewMode = 0

let selections = new Set()

let thumbnailCursor = {
  visible: false,
  x: 0,
  el: null
}

let lastPointer = { x: null, y: null }

let toolbar
let contextMenu
let colorPicker
let transport
let guides
let onionSkin
let layersEditor
let pomodoroTimerView
// let shotTemplateSystem
let audioPlayback
let audioFileControlView
let sceneTimelineView

let storyboarderSketchPane
let fakePosterFrameCanvas

let exportWebWindow

let dragMode = false
let preventDragMode = false
let dragPoint
let dragTarget
let scrollPoint

let gridView

// CAF cancel tokens for async functions
let cancelTokens = {}

const msecsToFrames = value => Math.round(value / 1000 * boardData.fps)
const framesToMsecs = value => Math.round(value / boardData.fps * 1000)

// via https://stackoverflow.com/a/41115086
const serial = funcs =>
    funcs.reduce((promise, func) =>
        promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]))

const cacheKey = filepath => {
  try {
    // file exists, cache based on mtime
    return fs.statSync(filepath).mtimeMs
  } catch (err) {
    // file not found, cache buster based on current time
    return Date.now()
  }
}

let srcByUid = {} // TODO review, was used for setThumbnailDisplayAsPending, do we still need it?
let shouldRenderThumbnailDrawer = true

//  analytics.event('Application', 'open', filename)

// flag set after we've warned about FPS at least once since this window opened
let hasWarnedOnceAboutFps = false

remote.getCurrentWindow().on('focus', () => {
  menu.setMenu(i18n)
  // HACK update to reflect current value
  audioPlayback && audioPlayback.setEnableAudition(audioPlayback.enableAudition)
})

///////////////////////////////////////////////////////////////
// Loading / Init Operations
///////////////////////////////////////////////////////////////

const load = async (event, args) => {
  try {
    if (args[1]) {
      logToView({ type: 'progress', message: 'Loading Project with Script' })
      log.info("LOADING SCRIPT FILE", args[0])
      ipcRenderer.send('analyticsEvent', 'Application', 'open script', args[0])

      scriptFilePath = args[0]

      // there is scriptData - the window opening is a script type
      scriptData = args[1]
      locations = args[2]
      characters = args[3]
      boardSettings = args[4]
      currentPath = args[5]

      await updateSceneFromScript()
      store.dispatch({
        type: 'SCENE_FILE_LOADED',
        payload: { path: boardFilename }
      })
    } else {
      logToView({ type: 'progress', message: 'Loading Project File' })
      // if not, its just a simple single boarder file
      boardFilename = args[0]
      boardPath = boardFilename.split(path.sep)
      boardPath.pop()
      boardPath = boardPath.join(path.sep)
      log.info(' BOARD PATH: ', boardFilename)
      try {
        boardData = JSON.parse(fs.readFileSync(boardFilename))
        ipcRenderer.send('analyticsEvent', 'Application', 'open', boardFilename, boardData.boards.length)

        store.dispatch({
          type: 'SCENE_FILE_LOADED',
          payload: { path: boardFilename }
        })
      } catch (error) {
        throw new Error(`Could not read file ${path.basename(boardFilename)}. The file may be inaccessible or corrupt.\nError: ${error.message}`)
      }
    }

    migrateScene()

    await loadBoardUI()

    ///////////////////////////////////////////////////////////////
    // was: updateBoardUI
    logToView({ type: 'progress', message: 'Rendering User Interface' })
    document.querySelector('#canvas-caption').style.display = 'none'
    renderViewMode()
    await ensureBoardExists()
    ///////////////////////////////////////////////////////////////

    await verifyScene()
    await renderScene()

    logToView({ type: 'progress', message: 'Preparing to display' })

    resize()
    // storyboarderSketchPane.resize()
    await new Promise(resolve => setTimeout(resolve, 50)) // wait for the DOM to catch up to avoid FOUC

    ipcRenderer.send('workspaceReady')

    let win = remote.getCurrentWindow()
    win.webContents.addListener('before-input-event', (event, input) => {
      // TODO need a different fix for dev tools, which doesn't have before-input-event
      // see: https://github.com/wonderunit/storyboarder/issues/1202

      //
      //
      // intercept some key commands
      //
      // TODO avoid key doubling where Menu still tries to send the command
      // see: https://github.com/wonderunit/storyboarder/issues/1206
      //
      // construct a unique set of keys including the one JUST intercepted
      let pressedKeys = [...new Set([...keytracker.pressed(), input.key])]
      //
      // intercept: New Board (IPC: newBoard)
      if (isCommandPressed('menu:boards:new-board', pressedKeys)) {
        // keyDown triggers newBoard
        if (input.type == 'keyDown') {
          // sanity check
          if (!textInputMode) {
            // manually construct a new board
            newBoard()
              .then(index => {
                // go to the board
                gotoBoard(index)
                // report
                ipcRenderer.send('analyticsEvent', 'Board', 'new')
              })
              .catch(err => log.error(err))
          }
        }

        // keyUp AND keyDown cause menu to be ignored and key to be trapped
        win.webContents.setIgnoreMenuShortcuts(true)
        event.preventDefault()
        return
      }

      // intercept: Change Tool (IPC: setTool)
      // e.g.: '1'-'6' shouldn't flash the menu
      for (let [command, toolName] of [
        ['menu:tools:light-pencil', 'light-pencil'],
        ['menu:tools:brush', 'brush'],
        ['menu:tools:tone', 'tone'],
        ['menu:tools:pencil', 'pencil'],
        ['menu:tools:pen', 'pen'],
        ['menu:tools:note-pen', 'note-pen'],
        ['menu:tools:eraser', 'eraser']
      ]) {
        if (isCommandPressed(command, pressedKeys)) {
          if (input.type == 'keyDown' &&
              !textInputMode &&
              !storyboarderSketchPane.getIsDrawingOrStabilizing()
          ) {
            store.dispatch({
              type: 'TOOLBAR_TOOL_CHANGE',
              payload: toolName,
              meta: { scope: 'local' }
            })
          }

          win.webContents.setIgnoreMenuShortcuts(true)
          event.preventDefault()
          return
        }
      }

      // if we're in text input mode, and have not pressed Control or Meta
      if (textInputMode && !(input.control || input.meta)) {
        // ignore any key that might trigger the menu
        win.webContents.setIgnoreMenuShortcuts(true)
      } else {
        // otherwise, allow it through
        win.webContents.setIgnoreMenuShortcuts(false)
      }
    })

  } catch (error) {
    log.error(error)

    // DEBUG show current window
    if (isDev) {
      remote.getCurrentWindow().show()
      remote.getCurrentWebContents().openDevTools()
    }

    logToView({ type: 'error', message: error.message })
    remote.dialog.showMessageBox({
      type: 'error',
      message: error.message
    })
    // TODO add a cancel button to loading view when a fatal error occurs?
  }
  initialize(path.join(app.getPath('userData'), 'storyboarder-settings.json'))
  electron.remote.getCurrentWindow().on('resize', resizeScale)
}
ipcRenderer.on('load', load)

let toggleNewShot = () => {
  storeUndoStateForScene(true)
  boardData.boards[currentBoard].newShot = !boardData.boards[currentBoard].newShot
  sfx.playEffect(boardData.boards[currentBoard].newShot ? 'on' : 'off')
  document.querySelector('input[name="newShot"]').checked = boardData.boards[currentBoard].newShot
  markBoardFileDirty()
  renderThumbnailDrawer()
  storeUndoStateForScene()
}

const commentOnLineMileage = (miles) => {
  let message = []
  let otherMessages
  switch (miles) {
    // REMOVED TO LIMIT NOTIFICATIONS
    // case 0.01:
    //   otherMessages = [
    //     "Yes!!! The first stroke. I remember my first stroke – fondly.",
    //     "I can tell this one is going to be good!",
    //     "What are you drawing?",
    //     "Let's make this one better than the last one.",
    //     "What's happening in this point of the story?",
    //     "Here we go again!",
    //     "Let's do this!",
    //     "I wish I could draw as good as that.",
    //   ]
    //   message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
    //   break
    // case 1:
    //   otherMessages = [
    //     "Looking great!!!",
    //     "Absolutely fantastic!",
    //     "You're like a regular Picaso.",
    //     "Hey - this looks great. And to think I doubted you.",
    //     "This is way better than your last board!",
    //     "Hooray! A great start.",
    //     "I can see great form in this one.",
    //     "There is so much potential with this drawing!",
    //     "Imagine when your friends see this.",
    //     "Let's keep the line miles to a minimum.",
    //   ]
    //   message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
    //   sfx.playEffect('tool-pencil')
    //   break
    case 5:
      message.push('5 line miles.')
      otherMessages = [
        "You should be done with your rough drawing.",
        "You got the basic form down?",
        "Are you sure this is the layout you want?",
        "Let's get to cleaning this up!",
        "Such great composition!",
        "Oh. Now I can see what you're going for.",
        "Let's wrap this one up.",
        "Beautiful.",
        "You make me proud.",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.playEffect('tool-light-pencil')
      break
    case 8:
      message.push('8 line miles.')
      otherMessages = [
        "Let's finish this up!",
        "Are you done yet?",
        "We have so many other boards to do still...",
        "Yes.. Very close to done.",
        "Can we move on to the next drawing and come back to this one?",
        "I think you need to pee.",
        "Is it finished?",
        "Yeah.. I'm gonna need you to come in this weekend and finish the rest of these boards.",
        "Wrap it up!",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.playEffect('tool-brush')
      break
    case 10:
      message.push('10 miles!')
      otherMessages = [
        "Let's finish this up!",
        "Are you done yet?",
        "Alright, I think this one is done.",
        "Yes.. Very close to done. Actually, looks done to me.",
        "Let's move on.",
        "Remember, you're not making the next Moner Lisa.",
        "Who do you think you are, Picaso?",
        "Looks great! But let's not make it too great.",
        "Sweet!",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.positive()
      break
    case 20:
      message.push('20 miles!!!')
      otherMessages = [
        "This is done. Let's move on.",
        "Woot. You're finished!",
        "You're taking too long.",
        "Come on buddy... put the pen down.",
        "You know you're not burning that many more calories working this hard on this board.",
        "YESSSS!!! BEAUTIFUL!!!!",
        "I LOVE IT!!!!",
        "How did you learn to draw so well?",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.negative()
      break
    case 50:
      message.push('50 miles!!!')
      otherMessages = [
        "Uhh.. I fell asleep. What did I miss?",
        "Are you painting the sixteen chapel or something?",
        "I'm waiting for your paint to dry.",
        "Come on buddy... put the pen down. Let's go for a walk.",
        "Why don't you tweet this masterpiece out?",
        "Hey. This is like some sort of torture.",
        "I thought it looked nice an hour ago.",
        "How about starting a new board?",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.negative()
      break
    case 100:
      message.push('100 miles!!!')
      otherMessages = [
        "Nope!!! I'm going to delete this board if you keep drawing. Just kidding. Or am I?",
        "I FEEL ASLEEP.",
        "Wake me up when you need me.",
        "Dude. You remember you are storyboarding.",
        "Let's go for a walk.",
        "How many boards do we have left?",
        "I thought it looked nice 2 hours ago.",
        "How about starting a new board?",
        "Post this one to twitter, it's a f*cking masterpiece.",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.error()
      break
    case 200:
      message.push('200 miles!!!')
      otherMessages = [
        "Now you're just fucking with me.",
        "I FEEL ASLEEP.",
        "You haven't worked your wrist out this hard since you were 13.",
        "I think your pen is going to break.",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.error()
      break
    case 300:
      message.push('300 miles!!!')
      otherMessages = [
        "I quit.",
        "Imagine what I'll say at 1000 miles.",
        "I'm going home.",
        "I hate you.",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.error()
      break
    case 500:
      message.push('500 miles!!!')
      otherMessages = [
        "So close to 1000!!!",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.error()
      break
    case 1000:
      message.push('1000 miles!!!')
      otherMessages = [
        "Great job. :/ See ya.",
      ]
      message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
      sfx.error()
      setTimeout(()=> {window.close()}, 5000);
      break
  }
  notifications.notify({message: message.join(' '), timing: 10})
}

// TODO this is really similar to verifyScene, but verifyScene requires the UI to be ready (for notifications)
const migrateScene = () => {
  let boardImagesPath = path.join(boardPath, 'images')

  // if at least one board.url file exists, consider this an old project
  let needsMigration = false
  for (let board of boardData.boards) {
    if (fs.existsSync(path.join(boardImagesPath, board.url))) {
      if (!(board.layers && board.layers.fill)) {
        // needs to be migrated
        needsMigration = true
        break
      }
    }
  }

  if (!needsMigration) return false

  // is this scene itself a migrated backup?
  let foldername = path.dirname(boardFilename)
  // does the basename end with `-backup`?
  let foldernameContainsStringBackup = foldername.match(/-backup$/i) != null
  // is this a backup folder alongside the original?
  let calculatedOriginalFilename = foldername.replace(/-backup$/i, '')
  let isAlongside = fs.existsSync(calculatedOriginalFilename)
  if (foldernameContainsStringBackup && isAlongside) {
    // we don't need to migrate
    remote.dialog.showMessageBox({
      message: "This appears to be a backup of a scene created with an older version of Storyboarder. It will not be migrated. Some layers won’t appear correctly in this version of Storyboarder."
    })
    return false
  }

  // make a backup
  let src = boardFilename
  let dst = path.join(path.dirname(boardFilename), '..',
    path.basename(boardFilename, path.extname(boardFilename)) + '-backup')
  if (fs.existsSync(dst)) {
    remote.dialog.showMessageBox({
      type: 'error',
      message: `Tried to migrate scene to new Storyboarder format but a backup already exists.\n\n${dst}\n\nPlease move or rename the backup folder and retry.`
    })
    window.close()
    throw new Error('Could not migrate')
    return false
  }

  fs.ensureDirSync(dst)
  log.info('Preparing to migrate scene to new Storyboarder layers format')
  log.info('Making a backup before migrating …')
  exporterCopyProject.copyProject(
    src,
    dst,
    {
      // copy board url main images
      copyBoardUrlMainImages: true,
      // ignore missing files, like posterframes or thumbnails
      ignoreMissing: true
    })

  // upgrade to the 1.6 layers format
  // see: https://github.com/wonderunit/storyboarder/issues/1160
  for (let board of boardData.boards) {
    // if a file exists for the board.url, we haven't migrated yet
    if (fs.existsSync(path.join(boardImagesPath, board.url))) {
      // catch edge case where fill layer already exists
      if (board.layers && board.layers.fill) {
        log.warn('Found an old main layer but fill already exists')
        remote.dialog.showMessageBox({
          type: 'error',
          message: 'Error while migrating board: fill layer already exists'
        })
      } else {
        // ensure board.layers exists
        if (!board.layers) {
          board.layers = {}
        }
        // move main layer to fill layer
        let filename = boardModel.boardFilenameForLayer(board, 'fill')
        log.info(`Moving ${board.url} to new fill layer ${filename}`)
        fs.moveSync(path.join(boardImagesPath, board.url), path.join(boardImagesPath, filename))
        board.layers.fill = {
          url: filename
        }
        markBoardFileDirty()
      }
    }
  }
}

// NOTE we assume that all resources (board data and images) are saved BEFORE calling verifyScene
const verifyScene = async () => {
  // find all used files
  const flatten = arr => Array.prototype.concat(...arr)
  const pngFiles = flatten(boardData.boards.map(board => ([
    ...boardModel.boardOrderedLayerFilenames(board).filenames,
    boardModel.boardFilenameForThumbnail(board)
  ])))

  //
  //
  // PNG: notify about any missing PNG file, create it
  //
  let missing = []
  for (let filename of pngFiles) {
    if (!fs.existsSync(path.join(boardPath, 'images', filename))) {
      missing.push(filename)
    }
  }

  if (missing.length) {
    let message = `[WARNING] This scene is missing the following file(s):\n\n${missing.join('\n')}\n\n` +
                  `This is probably not your fault, but is a bug caused by previous releases of Storyboarder.`

    notifications.notify({ message, timing: 60 })

    // create placeholder image
    let size = boardModel.boardFileImageSize(boardData)
    let context = createSizedContext(size)
    let canvas = context.canvas
    let imageData = canvas.toDataURL()

    for (let filename of missing) {
      log.info('saving placeholder', filename)
      saveDataURLtoFile(imageData, filename)
    }
    notifications.notify({ message: 'We’ved added placeholder files for any missing image(s). ' +
                                    'You should not see this warning again for this scene.', timing: 60 })
  }


  //
  //
  // PSD: notify about any missing PSD file, and unlink
  //
  for (let board of boardData.boards) {
    if (board.link) {
      if (!fs.existsSync(path.join(boardPath, 'images', board.link))) {
      let message = `[WARNING] This scene is missing the linked file ${board.link}. ` +
                    `It will be unlinked.`
        log.warn(message)
        notifications.notify({ message, timing: 60 })
        delete board.link
        markBoardFileDirty()
      }
    }
  }
  // setup LinkedFileManager
  if (linkedFileManager) { linkedFileManager.dispose() }
  linkedFileManager = new LinkedFileManager({ storyboarderFilePath: boardFilename })
  boardData.boards
    .filter(b => b.link)
    .forEach(b => linkedFileManager.addBoard(b, { skipTimestamp: true }))


  let boardsWithMissingPosterFrames = []
  for (let board of boardData.boards) {
    if (!fs.existsSync(path.join(boardPath, 'images', boardModel.boardFilenameForPosterFrame(board)))) {
      if (boardsWithMissingPosterFrames.length == 0) {
        notifications.notify({ message: 'Generating missing posterframes. Please wait …', timing: 60 })
      }
      boardsWithMissingPosterFrames.push(board)
    }
  }
  if (boardsWithMissingPosterFrames.length) {
    // wait 500 msecs for notification to show, then save all the poster frames
    await new Promise(resolve => setTimeout(resolve, 500))

    boardsWithMissingPosterFrames.forEach(board => savePosterFrame(board, true))
    notifications.notify({ message: `Done. Added ${boardsWithMissingPosterFrames.length} posterframes.`, timing: 60 })
  }
}

const loadBoardUI = async () => {
  logToView({ type: 'progress', message: 'Loading User Interface' })

  let size = boardModel.boardFileImageSize(boardData)

  // shotTemplateSystem = new ShotTemplateSystem({ width: size[0], height: size[1] })

  if (!SketchPane.canInitialize()) {
    remote.dialog.showMessageBox({
      type: 'error',
      message: 'Sorry, Storyboarder is not supported on your device because WebGL could not be initialized.'
    })
    window.close()
    return
  }

  storyboarderSketchPane = new StoryboarderSketchPane(
    document.getElementById('storyboarder-sketch-pane'),
    size,
    store
  )
  storyboarderSketchPane.onWebGLContextLost = () => {
    alert('An unexpected WebGL error occurred and Storyboarder could not continue.')
    window.close()
  }
  await storyboarderSketchPane.load()

  window.addEventListener('resize', () => {
    resize()
    // storyboarderSketchPane.resize()
  })

  // fix to prevent pen touch events from being interpreted as scroll commands
  // see: https://github.com/wonderunit/storyboarder/issues/1405
  window.addEventListener('touchstart', event => event.preventDefault(), { passive: false })
  window.addEventListener('touchmove', event => event.preventDefault(), { passive: false })
  window.addEventListener('touchend', event => event.preventDefault(), { passive: false })
  window.addEventListener('touchcancel', event => event.preventDefault(), { passive: false })

  window.ondragover = () => { return false }
  window.ondragleave = () => { return false }
  window.ondragend = () => { return false }

  window.ondrop = e => {
    e.preventDefault()

    if (!e || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) {
      return
    }

    let files = e.dataTransfer.files

    for (let file of files) {
      if (path.extname(file.name).match(/\.aif*/)) {
        notifications.notify({ message: `Whoops! Sorry, Storyboarder can’t read AIFF files (yet).`, timing: 5 })
        return
      }

      let hasRecognizedExtension = ALLOWED_AUDIO_FILE_EXTENSIONS.includes(path.extname(file.name).replace('.', ''))
      if (
        hasRecognizedExtension &&
        audioPlayback.supportsType(file.name)
      ) {
        notifications.notify({ message: `Copying audio file\n${file.name}`, timing: 5 })
        audioFileControlView.onSelectFile(file.path)
        return
      }
    }

    let hasStoryboarderFile = false
    let filepaths = []
    for (let file of files) {
      if (file.name.indexOf(".storyboarder") > -1) {
        hasStoryboarderFile = true
        // force load
        ipcRenderer.send('openFile', file.path)
        break
      } else {
        filepaths.push(file.path)
      }
    }

    if (!hasStoryboarderFile) {
      insertNewBoardsWithFiles(sortFilePaths(filepaths))
    }
  }

  storyboarderSketchPane.on('addToUndoStack', layerIndices => {
    clearTimeout(drawIdleTimer)
    storeUndoStateForImage(true, layerIndices)
  })

  storyboarderSketchPane.on('markDirty', layerIndices => {
    storeUndoStateForImage(false, layerIndices)
    markImageFileDirty(layerIndices)

    // TODO performance pass. this is slow!
    //      see: https://github.com/wonderunit/storyboarder/issues/1193
    if (isRecording) {
      // grab full-size image from current sketchpane (in memory)
      let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height,
        storyboarderSketchPane.visibleLayersIndices
      )
      // un-premultiply
      SketchPaneUtil.arrayPostDivide(pixels)
      // send as a canvas
      canvasRecorder.capture([
        SketchPaneUtil.pixelsToCanvas(
          pixels,
          storyboarderSketchPane.sketchPane.width,
          storyboarderSketchPane.sketchPane.height
        )
      ])
      if (!isRecordingStarted) isRecordingStarted = true
    }

    drawIdleTimer = setTimeout(onDrawIdle, 500)
  })
  // storyboarderSketchPane.on('pointerdown', () => {
  //   clearTimeout(drawIdleTimer)
  // })

  storyboarderSketchPane.on('lineMileage', value =>
    addToLineMileage(value))


  let sketchPaneEl = document.querySelector('#storyboarder-sketch-pane')

  let captionEl = document.createElement('div')
  captionEl.id = 'canvas-caption'
  sketchPaneEl.appendChild(captionEl)



  for (var item of document.querySelectorAll('#board-metadata input:not(.layers-ui-reference-opacity), textarea')) {
    item.addEventListener('focus', (e)=> {
      textInputMode = true
      textInputAllowAdvance = false
      switch (e.target.name) {
        case 'duration':
        case 'frames':
          textInputAllowAdvance = true
          break
      }
    })

    item.addEventListener('blur', (e)=> {
      textInputMode = false
      textInputAllowAdvance = false
    })

    item.addEventListener('change', (e)=> {
      switch (e.target.name) {
        case 'newShot':
          boardData.boards[currentBoard].newShot = e.target.checked
          sfx.playEffect(e.target.checked ? 'on' : 'off')
          markBoardFileDirty()
          textInputMode = false
          break
        case 'dialogue':
          renderCaption()
          break
      }
      renderThumbnailDrawer()
    })

    item.addEventListener('input', e => {
      switch (e.target.name) {
        case 'duration':
          // if we can't parse the value as a number (e.g.: empty string),
          // set to undefined
          // which will render as the scene's default duration
          let newDuration = isNaN(parseInt(e.target.value, 10))
            ? undefined
            : e.target.value

          // set the new duration value
          for (let index of selections) {
            boardData.boards[index].duration = newDuration
          }

          // update the `frames` view
          document.querySelector('input[name="frames"]').value = msecsToFrames(boardModel.boardDuration(boardData, boardData.boards[currentBoard]))

          renderThumbnailDrawer()
          renderMarkerPosition()
          break
        case 'frames':
          let newFrames = isNaN(parseInt(e.target.value, 10))
            ? undefined
            : e.target.value

          for (let index of selections) {
            boardData.boards[index].duration = newFrames != null
              ? framesToMsecs(newFrames)
              : undefined
          }

          // update the `duration` view
          document.querySelector('input[name="duration"]').value = newFrames != null
            ? framesToMsecs(newFrames)
            : ''

          renderThumbnailDrawer()
          renderMarkerPosition()
          break
        case 'dialogue':
          boardData.boards[currentBoard].dialogue = (e.target.value)
          break
        case 'action':
          boardData.boards[currentBoard].action = (e.target.value)
          break
        case 'notes':
          boardData.boards[currentBoard].notes = (e.target.value)
          break
      }
      markBoardFileDirty()
    })
  }

  document.querySelector('#thumbnail-container').addEventListener('pointerdown', (e)=>{
    if (e.pointerType == 'pen' || e.pointerType == 'mouse') {
      dragTarget = document.querySelector('#thumbnail-container')
      dragTarget.style.overflow = 'hidden'
      dragTarget.style.scrollBehavior = 'unset'
      dragMode = true
      dragPoint = [e.pageX, e.pageY]
      scrollPoint = [dragTarget.scrollLeft, dragTarget.scrollTop]
      mouseDragStartX = e.clientX
      periodicDragUpdate()
    }
  })

  document.querySelector('.board-metadata-container').addEventListener('pointerdown', (e)=>{
    if (e.pointerType == 'pen' || e.pointerType == 'mouse') {
      dragTarget = document.querySelector('.board-metadata-container')
      dragTarget.style.overflow = 'hidden'
      dragTarget.style.scrollBehavior = 'unset'
      dragMode = true
      dragPoint = [e.pageX, e.pageY]
      scrollPoint = [dragTarget.scrollLeft, dragTarget.scrollTop]
    }
  })

  // toggle scroll-indicator visibility based on scroll position
  const renderScrollIndicator = () => {
    let target = document.querySelector('.board-metadata-container')
    let el = document.querySelector('#board-metadata .scroll-indicator')
    if (target.offsetHeight + target.scrollTop === target.scrollHeight) {
      el.style.opacity = 0
    } else {
      el.style.opacity = 1.0
    }
  }
  document.querySelector('.board-metadata-container').addEventListener('scroll', () => renderScrollIndicator())
  document.querySelector('#board-metadata .scroll-indicator').addEventListener('click', e => {
    let el = document.querySelector('.board-metadata-container')
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth'
    })
  })
  window.addEventListener('resize', () => renderScrollIndicator())
  renderScrollIndicator() // initialize

  for (var item of document.querySelectorAll('.board-metadata-container input, .board-metadata-container textarea')) {
    item.addEventListener('pointerdown', (e)=>{
      preventDragMode = true
      dragTarget = document.querySelector('.board-metadata-container')
      dragTarget.style.scrollBehavior = 'smooth'
    })
  }

  document.querySelector('#suggested-dialogue-duration').addEventListener('pointerdown', (e)=>{
    let board = boardData.boards[currentBoard]
    board.duration = e.target.dataset.duration
    renderMetaData()
  })


    // for (var item of document.querySelectorAll('.thumbnail')) {
    //   item.classList.remove('active')
    // }


  const getActiveLayerFilePath = () => {
    let board = boardData.boards[currentBoard]
    let state = store.getState()
    if (state.toolbar.activeTool !== 'eraser') {
      let filename = boardModel.boardFilenameForLayer(board, state.toolbar.tools[state.toolbar.activeTool].defaultLayerName)
      let filepath = path.join(boardPath, 'images', filename)
      try {
        if (fs.statSync(filepath).isFile()) {
          return filepath
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err
        }
      }
    }
  }
  document.querySelector('#show-in-finder-button').addEventListener('pointerdown', event => {
    let filepath = getActiveLayerFilePath()
    if (filepath) {
      log.info('revealing', filepath)
      shell.showItemInFolder(filepath)
    } else {
      // TODO find the first existing layer? see: https://github.com/wonderunit/storyboarder/issues/1173

      // e.g.: `eraser`, or a layer image that hasn't save yet
      log.info('could not find image file for current layer')

      // uncomment to warn artist first
      // remote.dialog.showMessageBox({
      //   message: 'This layer does not have an image file yet. It may be empty, or in the process of saving. Please choose a different layer to show.'
      // })

      // just show the images folder
      shell.showItemInFolder(path.join(boardPath, 'images'))
    }
  })

  window.addEventListener('pointermove', (e)=>{
    lastPointer = { x: e.clientX, y: e.clientY }

    // if you move enough,
    // we switch into dragging mode
    // and clear any possible editModeTimer
    if (Math.abs(mouseDragStartX - e.clientX) > 15 * boardData.aspectRatio) {
      clearTimeout(editModeTimer)
    }

    if (isEditMode() && dragMode) {
      // defer to periodicDragUpdate()
      return
    }

    if (dragMode && !preventDragMode) {
      dragTarget.scrollLeft = scrollPoint[0] + (dragPoint[0] - e.pageX)
      dragTarget.scrollTop = scrollPoint[1] + (dragPoint[1] - e.pageY)
    }
  })

  window.addEventListener('pointerup', (e)=>{
    if (dragMode) {
      disableDragMode()
      preventDragMode = false
    }

    mouseDragStartX = null
    clearTimeout(editModeTimer)

    // log.info('pointerup', isEditMode)
    if (isEditMode()) {
      let checkoutBoard 
      let index
      if(gridView.IsEditMode) {
        let el = gridView.gridViewFromPoint(gridView.gridViewCursor.x, gridView.gridViewCursor.y) || gridView.gridViewCursor.el
        if (!el) {
          log.warn("couldn't find nearest thumbnail")
          return
        }
        if (el) {
          if(gridView.gridViewCursor.side === "Left") {
            index = Number(el.dataset.thumbnail)
          } else {
            index = Number(el.dataset.thumbnail) + 1
          }
        }
        checkoutBoard = () => gridView.renderGridView(() => gotoBoard(currentBoard, true))

      } else {
        let x = e.clientX, y = e.clientY

        // 1) try to find nearest thumbnail, otherwise,
        // HACK 2) try to find last known thumbnail position
        let el = thumbnailFromPoint(x, y) || thumbnailCursor.el
  
        el =  thumbnailFromPoint(x, y) || thumbnailCursor.el
        let offset = 0
        if (el) {
          offset = el.getBoundingClientRect().width
          el =  gridView.gridViewFromPoint(x, y, offset/2) 
        }
  
        if (!el) {
          log.warn("couldn't find nearest thumbnail")
        }
  
        if (isBeforeFirstThumbnail(x, y)) {
          index = 0
        } else if (el) {
          index = Number(el.dataset.thumbnail) + 1
        }

        checkoutBoard = () => gotoBoard(currentBoard, true)
      }

      if (!util.isUndefined(index)) {
        log.info('user requests move operation:', selections, 'to insert after', index)
        saveImageFile().then(() => {
          let didChange = moveSelectedBoards(index)

          if (didChange) {
            notifications.notify({message: 'Reordered!', timing: 5})
          }

          renderThumbnailDrawer()

          checkoutBoard()
        })
      } else {
        log.info('could not find point for move operation')
      }
      disableEditMode()

    }
  })

  toolbar = new Toolbar(store, document.getElementById('toolbar'))
  toolbar.on('trash', () => {
    clearLayers()
  })
  toolbar.on('undo', () => {
    if (storyboarderSketchPane.preventIfLocked()) return

    if (undoStack.getCanUndo()) {
      undoStack.undo()
      sfx.rollover()
    } else {
      sfx.error()
      notifications.notify({message: 'Nothing left to undo!', timing: 5})
    }
    sfx.playEffect('metal')
  })
  toolbar.on('redo', () => {
    if (storyboarderSketchPane.preventIfLocked()) return

    if (undoStack.getCanRedo()) {
      undoStack.redo()
      sfx.rollover()
    } else {
      sfx.error()
      notifications.notify({message: 'Nothing more to redo!', timing: 5})
    }
    sfx.playEffect('metal')
  })
  toolbar.on('open-in-editor', () => {
    openInEditor()
  })

  // initialize
  store.dispatch({ type: 'TOOLBAR_TOOL_CHANGE', payload: 'light-pencil' })



  tooltips.init()

  transport = new Transport()
  transport.on('previousScene', () => {
    previousScene()
  })
  transport.on('prevBoard', () => {
    goNextBoard(-1)
  })
  transport.on('togglePlayback', () => {
    togglePlayback()
  })
  transport.on('nextBoard', () => {
    goNextBoard(+1)
  })
  transport.on('nextScene', () => {
    nextScene()
  })

  notifications.init(document.getElementById('notifications'), prefsModule.getPrefs()['enableNotifications'])
  setupRandomizedNotifications()

  //
  //
  // Current Color, Palette, and Color Picker connections
  //
  colorPicker = new ColorPicker()
  const setCurrentColor = color => {
    store.dispatch({ type: 'TOOLBAR_TOOL_SET', payload: { color: util.colorToNumber(color) } })
    colorPicker.setState({ color: color.toCSS() })
    sfx.playEffect('metal')
  }
  const setPaletteColor = (tool, index, color) => {
    store.dispatch({
      type: 'TOOLBAR_TOOL_PALETTE_SET',
      payload: {
        index,
        color: util.colorToNumber(color)
      }
    })

    colorPicker.setState({ color: color.toCSS() })
  }
  toolbar.on('current-color-picker', () => {
    sfx.positive()
    colorPicker.attachTo(document.getElementById('toolbar-current-color'))
    colorPicker.removeAllListeners('color') // HACK

    // initialize color picker active swatch
    const state = store.getState()
    colorPicker.setState({
      color: Color(
        util.numberToColor(state.toolbar.tools[state.toolbar.activeTool].color)
      )
    })

    colorPicker.addListener('color', setCurrentColor)
  })
  toolbar.on('palette-color-picker', ({ target, index }) => {
    sfx.positive()

    colorPicker.attachTo(target)
    colorPicker.removeAllListeners('color') // HACK

    // initialize color picker to selected palette color
    const state = store.getState()
    colorPicker.setState({
      color: Color(
        util.numberToColor(state.toolbar.tools[state.toolbar.activeTool].palette[index])
      )
    })

    colorPicker.addListener('color', setPaletteColor.bind(this, state.toolbar.activeTool, index))
  })

  guides = new Guides({
    width: storyboarderSketchPane.sketchPane.width,
    height: storyboarderSketchPane.sketchPane.height,
    perspectiveGridFn: () => {}, // shotTemplateSystem.requestGrid.bind(shotTemplateSystem),
    onRender: guideCanvas => {
      storyboarderSketchPane.sketchPane.layers[
        storyboarderSketchPane.sketchPane.layers.findByName('guides').index
      ].replaceTextureFromCanvas(
        guideCanvas
      )
    }
  })
  onionSkin = new OnionSkin({
    width: storyboarderSketchPane.sketchPane.width,
    height: storyboarderSketchPane.sketchPane.height,
    onSetEnabled: value => {
      storyboarderSketchPane.sketchPane.layers[
        storyboarderSketchPane.sketchPane.layers.findByName('onion').index
      ].setVisible(value)
    },
    onRender: onionSkinCanvas => {
      storyboarderSketchPane.sketchPane.layers[
        storyboarderSketchPane.sketchPane.layers.findByName('onion').index
      ].sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY
      storyboarderSketchPane.sketchPane.layers[
        storyboarderSketchPane.sketchPane.layers.findByName('onion').index
      ].replaceTextureFromCanvas(
        onionSkinCanvas
      )
    }
  })
  // connect toolbar state to UI
  observeStore(store, state => state.toolbar, () => {
    const state = store.getState()

    // connect to guides
    guides.setState({
      grid: state.toolbar.grid,
      center: state.toolbar.center,
      thirds: state.toolbar.thirds,
      perspective: false // state.toolbar.perspective
    })

    // connect to captions
    document.querySelector('#canvas-caption').style.visibility = state.toolbar.captions
      ? 'visible'
      : 'hidden'

    // connect to onion skin
    if (onionSkin.state.enabled !== state.toolbar.onion) {
      if (state.toolbar.onion) {
        onionSkin.setState({ enabled: true })
        onionSkin.load().catch(err => {
          log.info('could not load onion skin')
          log.info(err)
        })
      } else {
        onionSkin.setState({ enabled: false })
      }
    }
  }, true)

  layersEditor = new LayersEditor(storyboarderSketchPane, sfx, notifications)
  layersEditor.on('opacity', async () => {
    let board = boardData.boards[currentBoard]

    if (board.layers) {
      // if board has a reference layer ...
      if (board.layers.reference) {
        let refLayer = storyboarderSketchPane.sketchPane.layers.findByName('reference')
        // ... and the opacity value is stale ...
        if (board.layers.reference.opacity !== refLayer.getOpacity()) {
          // ... update the opacity value ...
          board.layers.reference.opacity = refLayer.getOpacity()

          // ... and save the board file
          markBoardFileDirty()

          // update posterframe and thumbnail
          markImageFileDirty([refLayer.index])
        }
      }

      // if board has a shot generator layer ...
      if (board.layers['shot-generator']) {
        let sgLayer = storyboarderSketchPane.sketchPane.layers.findByName('shot-generator')
        // ... and the opacity value is stale ...
        if (board.layers['shot-generator'].opacity !== sgLayer.getOpacity()) {
          // ... update the opacity value ...
          board.layers['shot-generator'].opacity = sgLayer.getOpacity()

          // ... and save the board file
          markBoardFileDirty()

          // update posterframe and thumbnail
          markImageFileDirty([sgLayer.index])
        }
      }
    }

    // alternately, to immediately update ONLY posterframe and thumbnail:
    /*
    // update the posterframe
    await savePosterFrame(board, false)
    // update the thumbnail
    let index = await saveThumbnailFile(boardData.boards.indexOf(board))
    await updateThumbnailDisplayFromFile(index)
    */
  })
  storyboarderSketchPane.on('beforePointerDown', () => {
    // if artist is drawing on the reference layer, ensure it has opacity
    if (
      store.getState().toolbar.activeTool === 'light-pencil' &&
      storyboarderSketchPane.getLayerOpacity(
        storyboarderSketchPane.sketchPane.layers.findByName('reference').index
      ) === 0
    ) {
      layersEditor.setReferenceOpacity(exporterCommon.DEFAULT_REFERENCE_LAYER_OPACITY)
    }
  })

  // ask if its ok to draw
  storyboarderSketchPane.on('requestUnlock', () => {
    // if artist is drawing on a linked layer...
    let board = boardData.boards[currentBoard]
    if (board.link) {
      // ...prompt them, to see if they really want to remove the link
      remote.dialog.showMessageBox({
        type: 'question',
        message: 'This board was edited in Photoshop and linked to a PSD file. ' +
                 'What would you like to do?',
        buttons: [
          'Open in Photoshop', // 0
          'Draw in Storyboarder', // 1
          'Cancel' // 2
        ],
        defaultId: 2
      })
      .then(({ response }) => {
        if (response === 0) {
          // Open in Photoshop
          openInEditor()
        } else if (response === 1) {
          // Draw in Storyboarder
          remote.dialog.showMessageBox({
            type: 'question',
            message: 'If you draw, Storyboarder will stop watching ' +
                    'Photoshop for changes, and unlink the PSD from ' +
                    'this board. Are you absolutely sure?',
            buttons: [
              'Unlink and Draw', // 0
              'Cancel' // 1
            ],
            defaultId: 1
          })
          .then(({ response }) => {
            if (response === 0) {
              // Unlink and Draw
              notifications.notify({ message: `Stopped watching\n${board.link}\nfor changes.` })
              linkedFileManager.removeBoard(board)
              delete board.link
              markBoardFileDirty()

              storyboarderSketchPane.setIsLocked(false)
            }
          })
          .catch(err => log.error(err))
        }
      })
      .catch(err => log.error(err))
    }
  })


  // setup timeline dragging
  let tlEl = document.querySelector('#movie-timeline-content')
  tlEl.addEventListener('pointerdown', () => {
    let onPointerMove = event => {
      let node = Number(event.target.dataset.node)
      if (!util.isUndefined(node) && !isNaN(node)) {
        if (currentBoard !== node) {
          saveImageFile().then(() => {
            currentBoard = node
            gotoBoard(currentBoard)
          })
        }
      }
    }

    let onPointerUp = () => {
      tlEl.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
    tlEl.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  })



  sfx.init()

  const enableDrawingSoundEffects = prefsModule.getPrefs('sound effects')['enableDrawingSoundEffects']
  if (enableDrawingSoundEffects) {
    storyboarderSketchPane.on('pointerdown', Sonifier.start)
    storyboarderSketchPane.on('pointermove', Sonifier.trigger)
    storyboarderSketchPane.on('pointerup', Sonifier.stop)

    Sonifier.init(storyboarderSketchPane.getCanvasSize())

    window.addEventListener('resize', () =>
      Sonifier.setSize(storyboarderSketchPane.getCanvasSize()))
  }

  const onUndoStackAction = async (state) => {
    if (state.type === 'image') {
      await applyUndoStateForImage(state)
    } else if (state.type === 'scene') {
      await applyUndoStateForScene(state)
    }
  }
  undoStack.on('undo', onUndoStackAction)
  undoStack.on('redo', onUndoStackAction)

  // Pomodoro Timer
  pomodoroTimerView = new PomodoroTimerView()
  toolbar.on('pomodoro-rest', () => {
    sfx.positive()
    pomodoroTimerView.attachTo(document.getElementById('toolbar-pomodoro-rest'))

    pomodoroTimerView.addListener('update', (data)=>{
      toolbar.updatePomodoroTimer(data)

      if(isRecording && data.state === "completed") {
        // make sure we capture the last frame
        notifications.notify({message: "Congratulations! Generating your timelapse! This can take a minute.", timing: 5})

        // grab full-size image from current sketchpane (in memory)
        let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
          storyboarderSketchPane.sketchPane.width,
          storyboarderSketchPane.sketchPane.height,
          storyboarderSketchPane.visibleLayersIndices
        )
        // un-premultiply
        SketchPaneUtil.arrayPostDivide(pixels)
        // send as a canvas
        canvasRecorder.capture([
          SketchPaneUtil.pixelsToCanvas(
            pixels,
            storyboarderSketchPane.sketchPane.width,
            storyboarderSketchPane.sketchPane.height
          )
        ], {force: true})
        setTimeout(()=>{
          canvasRecorder.stop()
        }, 2000)
        isRecording = false
        isRecordingStarted = false
      }
    })

    pomodoroTimerView.addListener('cancel', (data)=>{
      canvasRecorder.cancel()
      isRecording = false
      isRecordingStarted = false
    })

    pomodoroTimerView.addListener('start', (data)=>{
      toolbar.startPomodoroTimer(data)
      let boardSize = storyboarderSketchPane.getCanvasSize()
      let outputWidth = 700
      let targetOutputHeight = (outputWidth/boardSize.width)*boardSize.height

      isRecording = true
      let exportsPath = exporterCommon.ensureExportsPathExists(boardFilename)
      let filename = path.basename(boardFilename, path.extname(boardFilename)) + " timelapse " + moment().format('YYYY-MM-DD hh.mm.ss')
      canvasRecorder = new CanvasRecorder({
        exportsPath: exportsPath,
        filename: filename,
        outputStrategy: "CanvasBufferOutputGifStrategy",
        outputWidth: outputWidth,
        outputHeight: targetOutputHeight,
        recordingStrategy: "RecordingStrategyTimeRatio",
        recordingTime: data.duration,
        shouldWatermark: prefsModule.getPrefs().enableWatermark,
        watermarkImagePath: watermarkModel.watermarkImagePath(prefsModule.getPrefs(), app.getPath('userData'))
      })

      canvasRecorder.on('recording-ready', (filepaths)=> {
        pomodoroTimerView.newRecordingReady(filepaths)
      })
      canvasRecorder.start()
    })

  })
  toolbar.on('pomodoro-running', () => {
    pomodoroTimerView.attachTo(document.getElementById('toolbar-pomodoro-running'))
  })



  //
  //
  // Devtools
  //
  // devtools-focused
  ipcRenderer.on('devtools-focused', () => {
    textInputMode = true

    // listen for focus to change
    window.addEventListener('focus', onDevToolsBlur)
  })
  // devtools-closed
  ipcRenderer.on('devtools-closed', () => {
    onDevToolsBlur()
  })
  // devtools-blur
  const onDevToolsBlur = () => {
    window.removeEventListener('focus', onDevToolsBlur)

    textInputMode = false
  }

  window.addEventListener('beforeunload', event => {
    log.info('Close requested! Saving ...')

    saveImageFile() // NOTE image is saved first, which ensures layers are present in data
    saveBoardFile() // ... then project data can be saved

    // try to close the Shot Generator based on its URL
    //
    // HACK find the Shot Generator window manually
    const shotGeneratorWindow = remote.BrowserWindow.getAllWindows()
      .find(w => w.webContents.getURL().match(/shot\-generator\.html/))
    // try to close it
    if (shotGeneratorWindow && !shotGeneratorWindow.isDestroyed()) {
      shotGeneratorWindow.close()
    }

    // still dirty?
    if (boardFileDirty) {
      // pass the electron-specific flag
      // to trigger `will-prevent-unload` handler in main.js
      event.returnValue = false
    } else {
      // dispose of any audio buffers
      audioPlayback.dispose()

      // remove any existing listeners
      linkedFileManager.dispose()

      // dispatch a change to preferences merging in toolbar data
      // first dispatch locally
      store.dispatch({ type: 'PREFERENCES_MERGE_FROM_TOOLBAR', payload: store.getState().toolbar, meta: { scope: 'local' } })
      log.info('setting toolbar preferences')
      // TODO set caption value from toolbar ui state
      prefsModule.set('toolbar', store.getState().preferences.toolbar)
      log.info('writing to prefs.json')
      prefsModule.savePrefs()
      // then, let main and the rest of the renderers know
      // NOTE this is async
      // TODO use wait-service instead? https://jlongster.com/Two-Weird-Tricks-with-Redux
      //      would be nice to dispatch to main + renderers, wait until we know they all have state, then save
      store.dispatch({ type: 'PREFERENCES_MERGE_FROM_TOOLBAR', payload: store.getState().toolbar })

      // TODO should we have an explicit SCENE_FILE_CLOSED dispatch?
      store.dispatch({
        type: 'SCENE_FILE_LOADED',
        payload: { path: null }
      })
    }
  })

  // text input mode on blur, to prevent menu trigger on preferences typing
  window.addEventListener('blur', () => {
    textInputMode = true
  })
  window.addEventListener('focus', () => {
    // is a child window still claiming focus?
    for (let w of remote.getCurrentWindow().getChildWindows()) {
      if (w.isFocused()) {
        // keep preventing text input
        textInputMode = true
        return
      }
    }

    // otherwise, allow direct text input again
    textInputMode = false
    
  })
  // changedPrefs is an object with only the top-level primitive prefs that have actually changed (it does not track objects or arrays nested in prefs)
  ipcRenderer.on('prefs:change', (event, changedPrefs) => {
    if (Object.keys(changedPrefs).length) {
      if (boardData && changedPrefs.defaultBoardTiming != null && boardData.defaultBoardTiming != changedPrefs.defaultBoardTiming) {
        boardData.defaultBoardTiming = changedPrefs.defaultBoardTiming
        saveBoardFile()
        renderMetaData()
      }

      notifications.notify({
        message: `Storyboarder preferences have changed. Please close and re-open this project window for new preferences to take effect.`,
        timing: 30
      })
    }
  })

  // if (shotTemplateSystem.isEnabled()) {
  //   StsSidebar.init(shotTemplateSystem, size[0] / size[1], store)
  //   StsSidebar.on('change', () => {
  //     // HACK reset any open tooltips
  //     tooltips.closeAll()
  //   })
  //   StsSidebar.on('select', (img, params, camera) => {
  //     if (storyboarderSketchPane.preventIfLocked()) return
  //
  //     let board = boardData.boards[currentBoard]
  //
  //     board.sts = {
  //       params,
  //       camera
  //     }
  //     markBoardFileDirty()
  //     guides && guides.setPerspectiveParams({
  //       cameraParams: board.sts && board.sts.camera,
  //       rotation: 0
  //     })
  //
  //     if (!img) return
  //
  //     storyboarderSketchPane.replaceLayer(storyboarderSketchPane.sketchPane.layers.findByName('reference').index, img)
  //
  //     // force a file save and thumbnail update
  //     markImageFileDirty([storyboarderSketchPane.sketchPane.layers.findByName('reference').index])
  //     saveImageFile()
  //   })
  // } else {
  //   notifications.notify({ message: 'For better performance on your machine, Shot Generator and Perspective Guide have been disabled.' })
  //   StsSidebar.setEnabled(false)
  // }

  sceneSettingsView.init({ fps: boardData.fps })
  sceneSettingsView.on('fps', fps => {
    if (boardData.fps !== fps) {
      boardData.fps = fps
      markBoardFileDirty()
    }
  })

  audioPlayback = new AudioPlayback({
    store,
    sceneData: boardData,
    getAudioFilePath: (filename) => path.join(boardPath, 'images', filename)
  })
  audioFileControlView = new AudioFileControlView({
    // onSelectFile = via drop
    onSelectFile: async function (filepath) {
      if ( ! audioFileControlView.isIdle() ) {
        notifications.notify({ message: `Can’t add an audio file while recorder is active. Recorder mode is: ${audioFileControlView.state.mode}.`, timing: 5 })
        return
      }

      let board = boardData.boards[currentBoard]

      // rename to match uid
      let newFilename = `${board.uid}-${path.basename(filepath)}`

      // copy to project folder
      let newpath = path.join(boardPath, 'images', newFilename)

      let shouldOverwrite = true
      if (fs.existsSync(newpath)) {
        const { response } = await remote.dialog.showMessageBox({
          type: 'question',
          buttons: ['Yes', 'No'],
          title: 'Confirm',
          message: `A file named ${path.basename(newpath)} already exists in this project. Overwrite it?`
        })
        shouldOverwrite = (response === 0)
      }
      if (!shouldOverwrite) {
        notifications.notify({ message: 'Cancelled', timing: 5 })
        return
      }

      fs.copySync(filepath, newpath)

      // update board’s audio object
      storeUndoStateForScene(true)
      board.audio = board.audio || {}
      board.audio.filename = newFilename
      // update the audio playback buffers
      const { failed } = await audioPlayback.updateBuffers()
      failed.forEach(filename => notifications.notify({ message: `Could not load audio file ${filename}` }))
      updateAudioDurations()
      storeUndoStateForScene()

      // mark .storyboarder scene JSON file dirty
      markBoardFileDirty()

      renderThumbnailDrawer()
      audioFileControlView.setState({
        boardAudio: board.audio
      })
    },
    onSelectFileCancel: function () {
      // NOOP
    },
    // onRequestFile = via dialog
    onRequestFile: function (event) {
      if (event) event.preventDefault()

      if ( ! audioFileControlView.isIdle() ) {
        notifications.notify({ message: `Can’t add an audio file while recorder is active. Recorder mode is: ${audioFileControlView.state.mode}.`, timing: 5 })
        return
      }

      remote.dialog.showOpenDialog(
        {
          title: 'Select Audio File',
          filters: [
            {
              name: 'Audio',
              extensions: ALLOWED_AUDIO_FILE_EXTENSIONS
            }
          ]
        }
      )
      .then(({ filePaths }) => {
        if (filePaths.length) {
          this.onSelectFile(filePaths[0])
        } else {
          this.onSelectFileCancel()
        }
      })
      .catch(err => log.error(err))
    },
    onClear: async function () {
      let board = boardData.boards[currentBoard]

      if (!board.audio) return

      const { response } = await remote.dialog.showMessageBox({
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'Are you sure?\n' +
                 'Audio will be removed from this board.\n' +
                 'NOTE: File will not be deleted from disk.'
      })

      const shouldClear = (response === 0)

      if (shouldClear) {
        // remove board’s audio object
        storeUndoStateForScene(true)
        delete board.audio

        // TODO could clear out unused buffers to save RAM
        // audioPlayback.resetBuffers()

        // update the audio playback buffers
        const { failed } = await audioPlayback.updateBuffers()
        failed.forEach(filename => notifications.notify({ message: `Could not load audio file ${filename}` }))
        storeUndoStateForScene()

        // mark .storyboarder scene JSON file dirty
        markBoardFileDirty()

        renderThumbnailDrawer()
        audioFileControlView.setState({
          boardAudio: board.audio
        })
      }
    },
    onStartRecord: function (event) {
      event.preventDefault()

      if (R.isNil(recordingToBoardIndex)) {
        // silence current sounds
        audioPlayback.stopAllSounds()
        // prevent auditioning
        audioPlayback.pushState()
        audioPlayback.setEnableAudition(false)

        recordingToBoardIndex = currentBoard
        audioFileControlView.startCountdown({
          onComplete: function () {
            audioFileControlView.startRecording({
              boardAudio: boardData.boards[recordingToBoardIndex].audio
            })
          }
        })
      }
    },
    onStopRecord: function (event) {
      event.preventDefault()

      if (!R.isNil(recordingToBoardIndex)) {
        audioFileControlView.stopRecording({
          boardAudio: boardData.boards[currentBoard].audio
        })
      }
    },
    onAudioComplete: async function (buffer) {
      // set auditioning to prior value
      audioPlayback.popState()

      // TODO can this ever actually happen?
      if (R.isNil(recordingToBoardIndex)) {
        log.error('whoops! not currently recording!')
        return
      }

      let board = boardData.boards[recordingToBoardIndex]

      // NOTE catch for if they very quickly hit the stop button before chunks?
      // TODO can we reproduce this? can this really happen?
      //      maybe just fail silently?
      if (!buffer) {
        notifications.notify({ message: 'No audio recorded.', timing: 5 })

        renderThumbnailDrawer()
        audioFileControlView.setState({
          boardAudio: boardData.boards[currentBoard].audio
        })

        recordingToBoardIndex = undefined
        return
      }

      // name to match uid
      let datestamp = Date.now() // (new Date()).toISOString()
      let newFilename = `${board.uid}-audio-${datestamp}.wav`

      // copy to project folder
      let newPath = path.join(boardPath, 'images', newFilename)

      log.info('saving audio to', newPath)

      try {
        fs.writeFileSync(newPath, buffer, { encoding: 'binary' })
        notifications.notify({ message: 'Saved audio!', timing: 5 })
      } catch (err) {
        log.error(err)
        notifications.notify({ message: `Error saving audio. ${err}`, timing: 5 })
        recordingToBoardIndex = undefined
        return
      }

      // update board’s audio object
      storeUndoStateForScene(true)
      board.audio = board.audio || {}
      board.audio.filename = newFilename
      // update the audio playback buffers
      const { failed } = await audioPlayback.updateBuffers()
      failed.forEach(filename => notifications.notify({ message: `Could not load audio file ${filename}` }))
      updateAudioDurations()
      storeUndoStateForScene()

      // mark .storyboarder scene JSON file dirty
      markBoardFileDirty()

      renderThumbnailDrawer()
      audioFileControlView.setState({
        boardAudio: boardData.boards[currentBoard].audio
      })



      recordingToBoardIndex = undefined
    },
    onCounterTick: function (counter) {
      if (counter > 0) {
        sfx.counterTick()
      }
    },
    onNotify: function (...rest) {
      notifications.notify(...rest)
    }
  })

  menu.setMenu(i18n)
  // HACK initialize the menu to match the value in preferences
  audioPlayback.setEnableAudition(prefsModule.getPrefs().enableBoardAudition)

  // for debugging:
  //
  // remote.getCurrentWebContents().openDevTools()


  gridView = new GridView(boardData, boardPath, saveImageFile, getSelections,
                          getCurrentBoard, setCurrentBoard, getContextMenu, renderThumbnailDrawerSelections, 
                          gotoBoard, gridDrag, setSketchPaneVisibility, boardModel, setEditorModeTimer, renderTimelineModeControlView)
}
const getSelections = () => selections
const getCurrentBoard = () => currentBoard
const setCurrentBoard = (board) => currentBoard = board
const getContextMenu = () => contextMenu
const setEditorModeTimer = (timer) => editModeTimer = timer

// whenever the scene changes
const renderScene = async () => {
  audioPlayback.setSceneData(boardData)
  audioPlayback.resetBuffers()

  const { failed } = await audioPlayback.updateBuffers()
  failed.forEach(filename => notifications.notify({ message: `Could not load audio file ${filename}` }))
  updateAudioDurations()

  // now that audio buffers have loaded, we can create the scene timeline
  // if it doesn't already exist
  srcByUid = {}
  if (!sceneTimelineView) {
    sceneTimelineView = new SceneTimelineView({
      show: !shouldRenderThumbnailDrawer,
      scene: boardData,

      scale: 1,
      position: 0,

      mini: false,

      currentBoardIndex: currentBoard,

      getAudioBufferByFilename: audioPlayback.getAudioBufferByFilename.bind(audioPlayback),

      onSetCurrentBoardIndex: async index => {
        if (currentBoard !== index) {
          await saveImageFile()
          currentBoard = index
          gotoBoard(currentBoard)
        }
      },

      onMoveSelectedBoards: (_selections, _position) => {
        selections = _selections
        let didChange = moveSelectedBoards(_position)
        renderThumbnailDrawer() // calls renderSceneTimeline
        return didChange
      },

      onModifyBoardDurationByIndex: (index, duration) => {
        // TODO could store undo state after idle?
        // storeUndoStateForScene(true)
        boardData.boards[index].duration = duration
        // storeUndoStateForScene()
        markBoardFileDirty()
        renderThumbnailDrawer()
        renderMetaData()
      },

      getSrcByUid: uid => {
        if (srcByUid[uid]) {
          return srcByUid[uid]
        } else {
          let board = boardData.boards.find(b => b.uid === uid)
          if (board) {
            return path.join(
              path.dirname(boardFilename),
              'images',
              boardModel.boardFilenameForThumbnail(board)
            )
          } else {
            log.warn('getSrcByUid failed', uid)
            return undefined
          }
        }
      }
    })
    document.getElementById('scene-timeline-container')
      .appendChild(sceneTimelineView.element)
    sceneTimelineView.connectedCallback()
  }

  // render the thumbnail drawer
  renderThumbnailDrawer()
  // go to the correct board
  audioPlayback.setBypassed(true)
  await gotoBoard(currentBoard)
  audioPlayback.setBypassed(false)
}

///////////////////////////////////////////////////////////////
// Board Operations
///////////////////////////////////////////////////////////////

let insertNewBoardDataAtPosition = (position) => {
  let uid = util.uidGen(5)

  let board = {
    uid: uid,
    url: `board-${position + 1}-${uid}.png`,
    newShot: false,
    lastEdited: Date.now(),
    layers: {}
  }

  boardData.boards.splice(position, 0, board)

  return board
}

let newBoard = async (position, shouldAddToUndoStack = true) => {
  // NOTE when loading a script, storyboarderSketchPane will not be initialized yet #1235
  if (storyboarderSketchPane && storyboarderSketchPane.getIsDrawingOrStabilizing()) {
    sfx.error()
    return Promise.reject('not ready')
  }

  if (isSavingImageFile) {
    // notifications.notify({ message: 'Could not create new board. Please wait until Storyboarder has saved all recent image edits.', timing: 5 })
    sfx.error()
    return Promise.reject('not ready')
  }

  if (typeof position == "undefined") position = currentBoard + 1

  if (shouldAddToUndoStack) {
    await saveImageFile() // force-save any current work
    await storeUndoStateForScene(true)
  }

  // create array entry
  let board = insertNewBoardDataAtPosition(position)

  markBoardFileDirty() // board data is dirty

  // NOTE when loading a script, sketchPane is not initialized yet #1235
  //      posterframe will be created by loadSketchPaneLayers instead
  if (typeof storyboarderSketchPane != 'undefined') {
    // create blank posterframe
    await savePosterFrame(
      board,
      true, // read from files
      true // blank
    )
  }
  // create blank thumbnail
  await saveThumbnailFile(position, { forceReadFromFiles: true, blank: true })

  renderThumbnailDrawer()
  storeUndoStateForScene()

  // play a sound effect (unless this is for a brand new project)
  if (shouldAddToUndoStack) {
    // notifications.notify({ message: "Added a new board. Let's make it a great one!", timing: 5 })
    // sfx.bip('c6')
    sfx.down(-2, 0)
  }

  return position
}

// Called from "Import Images to New Boards…" or from window.ondrop
let insertNewBoardsWithFiles = async filepaths => {
  log.info('main-window#insertNewBoardsWithFiles')

  let count = filepaths.length
  notifications.notify({
    message: `Importing ${count} image${count !== 1 ? 's' : ''}.\nPlease wait …`,
    timing: 2
  })

  let insertionIndex = currentBoard + 1
  let numAdded = 0
  for (let filepath of filepaths) {
    try {
      let imageDataURL = loadImageFileAsDataURL(filepath)

      if (imageDataURL == null) {
        throw new Error(`Could not read image file ${filepath}`)
      }

      // resize image if too big
      let dim = [
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height
      ]
      const scaledImageData = await fitImageData(dim, imageDataURL)

      storeUndoStateForScene(true)
      let board = insertNewBoardDataAtPosition(insertionIndex)
      board.layers.reference = {
        ...board.layers.reference, // TODO what if this is undefined?
        url: boardModel.boardFilenameForLayer(board, 'reference'),
        opacity: 1.0 // alternatively: exporterCommon.DEFAULT_REFERENCE_LAYER_OPACITY
      }
      storeUndoStateForScene()
      saveDataURLtoFile(scaledImageData, board.layers.reference.url)

      await savePosterFrame(board, true)
      await saveThumbnailFile(insertionIndex, { forceReadFromFiles: true })

      markBoardFileDirty() // save new board data

      insertionIndex++
      numAdded++
    } catch (error) {
      log.error('Error loading image', error)
      notifications.notify({
        message: `Could not load image ${path.basename(filepath)}\n` + error.message,
        timing: 10
      })
    }
  }

  renderThumbnailDrawer()

  if (numAdded > 0) {
    notifications.notify({
      message: `Imported ${numAdded} image${numAdded !== 1 ? 's' : ''}.\n\n` +
              `The image${numAdded !== 1 ? 's are' : ' is'} on the reference layer, ` +
              `so you can draw over ${numAdded !== 1 ? 'them' : 'it'}. ` +
              `If you'd like ${numAdded !== 1 ? 'them' : 'it'} to be the main layer, ` +
              `you can merge ${numAdded !== 1 ? 'them' : 'it'} up on the sidebar`,
      timing: 10
    })
    sfx.positive()
  }
}

const importImageAndReplace = async filepath => {
  log.info('main-window#importImageAndReplace')

  try {
    let dataURL = loadImageFileAsDataURL(filepath)
    await replaceReferenceLayerImage(dataURL)
  } catch (err) {
    log.error(err)
    notifications.notify({ message: err.toString() })
    sfx.error()
  }
}

const importImageFromMobile = async dataURL => {
  log.info('main-window#importImageFromMobile')

  try {
    await replaceReferenceLayerImage(dataURL)
  } catch (err) {
    log.error(err)
    notifications.notify({ message: err.toString() })
    sfx.error()
  } 
}

const loadImageFileAsDataURL = filepath => {
  let ext = path.extname(filepath).toLowerCase()

  if (ext === '.psd') {
    let buffer = fs.readFileSync(filepath)
    let canvas = importerPsd.fromPsdBufferComposite(buffer)
    return canvas.toDataURL()

  } else if (ext === '.jpg' || ext === '.jpeg') {
    let data = fs.readFileSync(filepath, { encoding: 'base64' })
    let mediatype = 'image/jpeg'
    return `data:${mediatype};base64,${data}`

  } else if (ext === '.png') {
    let data = fs.readFileSync(filepath, { encoding: 'base64' })
    let mediatype = 'image/png'
    return `data:${mediatype};base64,${data}`

  }
}

const updateAudioDurations = () => {
  let shouldSave = false
  for (let board of boardData.boards) {
    if (board.audio) {
      if (!board.audio.duration) {
        // log.info(`duration missing for ${board.uid}. adding.`)
        shouldSave = true
      }
      board.audio.duration = audioPlayback.getAudioBufferByFilename(board.audio.filename).duration * 1000
      // log.info(`set audio duration to ${board.audio.duration}`)
    }
  }
  if (shouldSave) {
    markBoardFileDirty()
  }
}

let markBoardFileDirty = () => {
  boardFileDirty = true
  clearTimeout(boardFileDirtyTimer)
  boardFileDirtyTimer = setTimeout(saveBoardFile, 5000)
}

let saveBoardFile = (opt = { force: false }) => {
  // TODO is this check still even necessary?
  //
  // are we still drawing?
  if (storyboarderSketchPane.getIsDrawingOrStabilizing()) {
    // wait, then retry
    boardFileDirtyTimer = setTimeout(saveBoardFile, 5000)
    return
  }

  if (boardFileDirty) {
    clearTimeout(boardFileDirtyTimer)
    boardData.version = pkg.version
    if (opt.force || prefsModule.getPrefs()['enableAutoSave']) {

      try {
        // save to backup file
        let backupFilePath = boardFilename + '.backup-' + Date.now()
        fs.writeFileSync(backupFilePath, JSON.stringify(boardData, null, 2))
        // swap backup file for actual file
        fs.moveSync(backupFilePath, boardFilename, { overwrite: true })

        boardFileDirty = false
        log.info('saved board file:', boardFilename)
      } catch (err) {
        log.error(err)
        alert('Could not save project.\n' + err)
      }
    }
  }
}

let markImageFileDirty = layerIndices => {
  // force update layers dirty flag
  storyboarderSketchPane.markLayersDirty(layerIndices)

  clearTimeout(imageFileDirtyTimer)
  imageFileDirtyTimer = setTimeout(saveImageFile, 5000)
}

const addToLineMileage = value => {
  let board = boardData.boards[currentBoard]
  if (!(board.lineMileage)) {
    board.lineMileage = 0
  }

  let allowNotificationsForLineMileage = prefsModule.getPrefs()['allowNotificationsForLineMileage']
  if (allowNotificationsForLineMileage) {
    let mileageChecks = [5,8,10,20,50,100,200,300,1000]
    for (let checkAmount of mileageChecks) {
      if ((board.lineMileage/5280 < checkAmount) && ((board.lineMileage + value)/5280 > checkAmount)) {
        commentOnLineMileage(checkAmount)
      }
    }
  }

  board.lineMileage += value
  markBoardFileDirty()
}

const onDrawIdle = () => {
  clearTimeout(drawIdleTimer)

  // update the line mileage in two places
  renderMetaDataLineMileage()
  renderStats()

  // update the thumbnail
  updateThumbnailDisplayFromMemory()

  // notification
  if (!hasWarnedOnceAboutFps && storyboarderSketchPane.shouldWarnAboutFps()) {
    hasWarnedOnceAboutFps = true
    notifications.notify({
      message:  'Hmm, looks like Storyboarder is running a little slow. ' +
                'For a speed boost, try disabling the “High Quality Drawing Engine” in Preferences.',
      timing: 30
    })
  }
}

let saveDataURLtoFile = (dataURL, filename) => {
  let imageData = dataURL.replace(/^data:image\/\w+;base64,/, '')
  let imageFilePath = path.join(boardPath, 'images', filename)
  fs.writeFileSync(imageFilePath, imageData, 'base64')
}

//
// saveImageFile
//
//  - saves DIRTY layers
//  - saves CURRENT board
//
// this function saves only the CURRENT board
// call it before changing boards to ensure the current work is saved
//
let saveImageFile = async () => {
  log.info('main-window#saveImageFile')

  isSavingImageFile = true

  let indexToSave = currentBoard

  // are we still drawing?
  if (storyboarderSketchPane.getIsDrawingOrStabilizing()) {
    // wait, then retry
    log.warn('Still drawing. Not ready to save yet. Retry in 5s')
    imageFileDirtyTimer = setTimeout(saveImageFile, 5000)
    isSavingImageFile = false
    return
  }

  const imagesPath = path.join(boardPath, 'images')

  let board = boardData.boards[indexToSave]

  let exportables = []
  let total = 0
  let complete = 0
  for (let index of storyboarderSketchPane.visibleLayersIndices) {
    if (storyboarderSketchPane.getLayerDirty(index)) {
      let layer = storyboarderSketchPane.sketchPane.layers[index]

      let filename = boardModel.boardFilenameForLayer(board, layer.name)

      // ensure board.layers exists
      if (!board.layers) {
        board.layers = {}
        markBoardFileDirty()
      }

      // ensure board.layers[layer.name] exists
      if (!board.layers[layer.name]) {
        log.info(`\tadding layer “${layer.name}” to board data`)
        board.layers[layer.name] = {
          url: filename,

          // special case for reference layer
          // match whatever the slider says
          opacity: (index === storyboarderSketchPane.sketchPane.layers.findByName('reference').index)
            ? layersEditor.getReferenceOpacity()
            : undefined
        }
        markBoardFileDirty()
      }

      let imageFilePath = path.join(imagesPath, filename)
      exportables.push({ index, layer, imageFilePath })

      total++
    }
  }

  // note in the board file all the layers we intend to save now
  saveBoardFile()

  // save the poster frame first
  // if at least one layer is dirty, save a poster frame JPG
  if (total > 0) {
    await savePosterFrame(board, false)
  }

  // export layers to PNG
  for (let { index, layer, imageFilePath } of exportables) {
    log.info(`\tsaving layer “${layer.name}” to ${imageFilePath}`)
    fs.writeFileSync(
      imageFilePath,
      storyboarderSketchPane.exportLayer(index, 'base64'),
      'base64'
    )

    storyboarderSketchPane.clearLayerDirty(index)

    complete++
  }

  // TODO should we only clear the timeout if we saved at least one file?
  clearTimeout(imageFileDirtyTimer)

  if (complete > 0) {
    log.info(`\tsaved ${complete} modified layers`)
  }

  // create/update the thumbnail image file if necessary
  if (complete > 0) {
    // TODO can this be synchronous?
    await saveThumbnailFile(indexToSave)
    await updateThumbnailDisplayFromFile(indexToSave)
    // TODO save a posterframe?
  }

  isSavingImageFile = false

  return indexToSave

  /*
  let layersData = [
    [1, 'main', board.url],
    [0, 'reference', board.url.replace('.png', '-reference.png')],
    [3, 'notes', board.url.replace('.png', '-notes.png')]
  ]

  let shouldSaveThumbnail = false
  let shouldSaveBoardFile = false

  let numSaved = 0
  for (let [index, layerName, filename] of layersData) {
    if (storyboarderSketchPane.getLayerDirty(index)) {
      shouldSaveThumbnail = true
      clearTimeout(imageFileDirtyTimer)

      let imageFilePath = path.join(boardPath, 'images', filename)
      let imageData = storyboarderSketchPane.exportLayer(index, 'base64')

      try {
        fs.writeFileSync(imageFilePath, imageData, 'base64')

        // add to boardData if it doesn't already exist
        if (index !== storyboarderSketchPane.sketchPane.layers.findByName('main').index) {
          board.layers = board.layers || {}

          if (!board.layers[layerName]) {
            board.layers[layerName] = { url: filename }

            // special handling for reference layer
            if (index === storyboarderSketchPane.sketchPane.layers.findByName('reference').index) {
              let referenceOpacity = layersEditor.getReferenceOpacity()
              if (board.layers.reference.opacity !== referenceOpacity) {
                // update the value
                board.layers.reference.opacity = referenceOpacity
              }
            }

            log.info('added', layerName, 'to board .layers data')

            shouldSaveBoardFile = true
          }
        }

        storyboarderSketchPane.clearLayerDirty(index)
        numSaved++
        log.info('\tsaved', layerName, 'to', filename)
      } catch (err) {
        log.warn(err)
      }
    }
  }

  if (shouldSaveBoardFile) {
    markBoardFileDirty()
    saveBoardFile()
  }

  log.info(`saved ${numSaved} modified layers`)

  // create/update the thumbnail image file if necessary
  let indexToSave = currentBoard // copy value
  if (shouldSaveThumbnail) {
    await saveThumbnailFile(indexToSave)
    await updateThumbnailDisplayFromFile(indexToSave)
  }

  isSavingImageFile = false

  return indexToSave
  */
}

// TODO performance
const savePosterFrame = async (board, forceReadFromFiles = false, blank = false) => {
  const imageFilePath = path.join(
    boardPath,
    'images',
    boardModel.boardFilenameForPosterFrame(board)
  )

  let canvas

  // composite from files
  if (forceReadFromFiles) {
    canvas = document.createElement('canvas')

    canvas.width = storyboarderSketchPane.sketchPane.width
    canvas.height = storyboarderSketchPane.sketchPane.height

    // draw a white matte background first
    let context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (!blank) {
      await exporterCommon.flattenBoardToCanvas(
        board,
        canvas,
        [ canvas.width, canvas.height ],
        boardFilename)
    }

  // composite from memory
  } else {
    if (!blank) {
      // grab full-size image from current sketchpane (in memory)
      let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height,
        storyboarderSketchPane.visibleLayersIndices
      )

      SketchPaneUtil.arrayPostDivide(pixels)

      canvas = SketchPaneUtil.pixelsToCanvas(
        pixels,
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height
      )
    } else {
      canvas = document.createElement('canvas')

      canvas.width = storyboarderSketchPane.sketchPane.width
      canvas.height = storyboarderSketchPane.sketchPane.height
    }

    // draw a white matte background behind the transparent art
    // using destination-over
    let context = canvas.getContext('2d')
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  // save to a file
  fs.writeFileSync(
    imageFilePath,
    canvas.toDataURL('image/jpeg').replace(/^data:image\/\w+;base64,/, ''),
    'base64'
  )

  log.info('saved posterframe', path.basename(imageFilePath))
}

let openInEditor = async () => {
  log.info('openInEditor')

  try {
    let selectedBoards = []

    // assume selection always includes currentBoard,
    // so make sure we've saved its contents to the filesystem
    await saveImageFile()
    // and indicate that it is now locked
    storyboarderSketchPane.setIsLocked(true)

    for (let selection of selections) {
      selectedBoards.push(boardData.boards[selection])
    }

    // save each selected board to its own PSD
    for (board of selectedBoards) {
      // collect the layer image data
      let namedCanvases = []
      for (let index of storyboarderSketchPane.visibleLayersIndices) {
        let layer = storyboarderSketchPane.sketchPane.layers[index]
        if (board.layers[layer.name]) {
          // load the image to a canvas
          let image = await exporterCommon.getImage(path.join(boardPath, 'images', board.layers[layer.name].url))

          let canvas = document.createElement('canvas')
          let context = canvas.getContext('2d')

          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight

          context.drawImage(image, 0, 0)

          namedCanvases.push({
            canvas,
            name: layer.name
          })
        } else {
          // blank transparent layer
          let canvas = document.createElement('canvas')
          let context = canvas.getContext('2d')

          canvas.width = storyboarderSketchPane.sketchPane.width
          canvas.height = storyboarderSketchPane.sketchPane.height

          namedCanvases.push({
            canvas,
            name: layer.name
          })
        }
      }

      // assign a PSD file path
      let psdPath = path.join(boardPath, 'images', boardModel.boardFilenameForLink(board))

      // fs.statSync checks if file exists without triggering a change that Photoshop would detect
      //
      // fs.existSync will trigger "The disk copy of “file.psd” was changed since you last opened or saved it.
      //                         Do you wish to update it?"
      let fileExists = false
      try {
        if (fs.statSync(psdPath).isFile()) {
          fileExists = true
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          fileExists = false
        } else {
          throw err
        }
      }

      let shouldOverwrite = true
      if (fileExists) {
        if (board.link) {
          // file exists and link exists
          // don't overwrite, don't prompt
          shouldOverwrite = false
        } else {
          // file exists but link does not exist
          // we need to know if user wants us to overwrite existing file before linking
          shouldOverwrite = false
          const { response } = await remote.dialog.showMessageBox({
            type: 'question',
            title: `Overwrite ${path.extname(psdPath)}?`,
            message: `A PSD file already exists for this board. Overwrite it?`,
            buttons: ['Yes, overwrite', `No, open existing PSD`]
          })
          shouldOverwrite = (response === 0)
        }
      } else {
        if (board.link) {
          // file doesn’t exist but link exists
          let shouldOverwrite = true
          notifications.notify({
            message:  `[WARNING] Could not find linked file:\n${board.link}\n` +
                      `Saving to:\n${path.basename(psdPath)} instead.`
          })
          // TODO could check to see if psdPath and board.link differ? that would be a weird edge case
        } else {
          // file doesn't exist AND link doesn't exist
          let shouldOverwrite = true
        }
      }

      if (shouldOverwrite) {
        let buffer = await exporterPsd.toPsdBuffer(namedCanvases, psdPath)
        fs.writeFileSync(psdPath, buffer)
      }

      // update the 'link'
      board.link = path.basename(psdPath)
    }

    // the board links changed, so save the project JSON file
    markBoardFileDirty()

    // actually open each board
    for (board of selectedBoards) {
      let errmsg

      let pathToLinkedFile = path.join(boardPath, 'images', board.link)
      let pathToEditor = prefsModule.getPrefs()['absolutePathToImageEditor']
      if (pathToEditor) {
        let binaryPath
        let execString

        // use .exe directly on win32
        if (pathToEditor.match(/\.exe$/)) {
          binaryPath = pathToEditor
          execString = `"${binaryPath}" "${pathToLinkedFile}"`
        // find binary in .app package on macOS
        } else if (pathToEditor.match(/\.app$/)) {
          binaryPath = pathToEditor
          execString = `open -a "${binaryPath}" "${pathToLinkedFile}"`
        } else {
          binaryPath = pathToEditor
          execString = `"${binaryPath}" "${pathToLinkedFile}"`
        }

        log.info('\tbinaryPath', binaryPath)
        log.info('\tpathToLinkedFile', pathToLinkedFile)
        log.info('\texecString', execString)

        if (binaryPath) {
          child_process.exec(execString, (error, stdout, stderr) => {
            if (error) {
              log.warn(error)
              notifications.notify({ message: `[WARNING] ${error}` })
              return
            }
            // log.info(`stdout: ${stdout}`)
            // log.info(`stderr: ${stderr}`)
          })
        } else {
          errmsg = 'Could not open editor'
        }
      } else {
        log.info('\tshell.openPath', board.link)
        log.info('\t\t', board.link)
        log.info('\t\t', pathToLinkedFile)
        let err = await shell.openPath(pathToLinkedFile)
        if (err != '') {
          log.error(err)
          errmsg = 'Could not open editor'
        }
      }

      if (errmsg) {
        log.warn(errmsg)
        notifications.notify({ message: `[WARNING] ${errmsg}` })
      }
    }

    linkedFileManager.addBoard(board)

    ipcRenderer.send('analyticsEvent', 'Board', 'edit in photoshop')

  } catch (error) {
    log.error(error)
    notifications.notify({ message: '[WARNING] Error opening files in editor.' })
    notifications.notify({ message: error.toString() })
    return
  }
}

const refreshLinkedBoardByFilename = async (filename, options = { forceReadFromFiles: false }) => {
  log.info('refreshLinkedBoardByFilename', filename)

  // find the board associated with this link filename
  let board = boardData.boards.find(b => b.link === filename)

  if (!board) {
    let message =
      'Tried to update, from external editor,' +
      'a file that is not linked to any board: ' + filename

    log.info(message)
    notifications.notify({
      message
    })

    return
  }

  // Update the current canvas if it's the same board coming back in.
  let isCurrentBoard = boardData.boards[currentBoard].uid === board.uid

  try {
    log.info('\tloading', path.join(boardPath, 'images', board.link))

    let buffer = fs.readFileSync(
      path.join(boardPath, 'images', board.link)
    )

    log.info('\treading', path.join(boardPath, 'images', board.link))
    let canvas = importerPsd.fromPsdBufferComposite(buffer)

    let layer = storyboarderSketchPane.sketchPane.layers.findByName('reference')

    // ensure layer data exists
    log.info('\tupdating layer data')

    // clear all non-reference layers
    log.info(
      'clearing non-reference layers from data' +
      isCurrentBoard
        ? ' and SketchPane'
        : ''
    )
    // NOTE gets layer indexes and names from CURRENT board,
    //      even if we're operating on a NON-CURRENT board
    //      we're assuming here that ALL boards have the SAME
    //      layer indexes and names
    for (let index of storyboarderSketchPane.visibleLayersIndices) {
      let layerName = storyboarderSketchPane.sketchPane.layers[index].name

      if (layerName !== 'reference') {
        if (isCurrentBoard && !options.forceReadFromFiles) {
          log.info('\t\t', layerName, 'sketchpane layer cleared')
          storyboarderSketchPane.sketchPane.layers.findByName(layerName).clear()
        }

        if (board.layers[layerName]) {
          log.info('\t\t', layerName, 'data cleared')
          delete board.layers[layerName]
          // NOTE we DO NOT delete the PNG file from the file system
        }
      }
    }
    log.info('\tupdating reference layer data')
    let filename = boardModel.boardFilenameForLayer(board, layer.name)
    board.layers.reference = {
      ...board.layers.reference,
      url: filename,
      opacity: 1.0
    }
    // sync opacity
    layersEditor.setReferenceOpacity(board.layers.reference.opacity)
    // mark to be saved
    markBoardFileDirty() // NOTE ALWAYS results in a JSON update, even if data
                         // hasn't actually changed

    log.info('\tisCurrentBoard?', isCurrentBoard)
    if (isCurrentBoard && !options.forceReadFromFiles) {
      // save undo state for ALL layers
      log.info('\tstoring undoable state (pre)')
      storeUndoStateForImage(true, storyboarderSketchPane.visibleLayersIndices)

      // update reference layer
      log.info('\tstamping to reference layer')
      layer.replace(canvas)

      // store undo state for reference layer
      log.info('\tmarking undo-able (post)')
      storeUndoStateForImage(false, [layer.index])

      // mark the reference layer dirty
      log.info('\tmarking layer dirty so it will save', layer.index)
      markImageFileDirty([layer.index])

      // uncomment to save image and update thumbnail immediately
      // await saveImageFile()

      // update thumbnail immediately
      log.info('\tupdating thumbnail')
      let index = await saveThumbnailFile(boardData.boards.indexOf(board))
      await updateThumbnailDisplayFromFile(index)

      log.info('\trendering thumbnail')
      renderThumbnailDrawer()
    } else {
      log.info('\tsaving reference layer to:', filename)
      saveDataURLtoFile(canvas.toDataURL(), filename)

      // update the thumbnail
      //
      // explicitly indicate to renderer that the thumbnail file has changed
      // FIXME use mtime instead of etags?
      log.info('\tupdating etag')
      setEtag(path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(board)))
      // save
      log.info('\tsaving thumbnail')
      let index = await saveThumbnailFile(boardData.boards.indexOf(board), { forceReadFromFiles: true })
      // render thumbnail
      await updateThumbnailDisplayFromFile(index)

      // save a posterframe for onion skin
      log.info('\tsaving posterframe')
      await savePosterFrame(board, true)

      // FIXME known issue: onion skin does not reload to reflect the changed file
      //       see: https://github.com/wonderunit/storyboarder/issues/1185
    }

    log.info('\tdone!')
  } catch (err) {
    log.error(err)
    notifications.notify({
      message: `[WARNING] Could not import from file ${filename}.`
    })
    notifications.notify({
      message: err.toString()
    })
    return
  }
}

// // always currentBoard
// const saveProgressFile = () => {
//   let imageFilePath = ''//
//   let size = [x, y]//

//     let context = createBlankContext(size)
//     let canvas = context.canvas//

//     let canvasImageSources = storyboarderSketchPane.getCanvasImageSources()

//   exporterCommon.flattenCanvasImageSourfocesDataToContext(context, canvasImageSources, size)

//   // save

//   // could use  saveDataURLtoFile, which is sync

//   promise.then(() => {
//       let imageData = canvas
//         .toDataURL('image/png')
//         .replace(/^data:image\/\w+;base64,/, '')

//       try {
//         fs.writeFile(imageFilePath, imageData, 'base64', () => {
//           resolve()
//           log.info('saved thumbnail', imageFilePath)
//         })
//       } catch (err) {
//         log.error(err)
//         reject(err)
//       }/




// }

// TODO move to boardModel?
const getThumbnailSize = boardData => [Math.floor(60 * boardData.aspectRatio) * 2, 60 * 2 ]
const getLayerThumbnailSize = aspectRatio => [320, 320 / aspectRatio ].map(n => Math.ceil(n * 2))

const renderThumbnailToNewCanvas = (index, options = { forceReadFromFiles: false }) => {
  let size = getThumbnailSize(boardData)

  if (!options.forceReadFromFiles && index === currentBoard) {
    // grab from current sketchpane (in memory)
    let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
      size[0],
      size[1],
      storyboarderSketchPane.visibleLayersIndices
    )

    SketchPaneUtil.arrayPostDivide(pixels)

    let canvas = SketchPaneUtil.pixelsToCanvas(
      pixels,
      size[0],
      size[1]
    )

    // draw a white matte background behind the transparent art
    let context = canvas.getContext('2d')
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    return Promise.resolve(canvas)
  } else {
    // grab from files
    let context = createSizedContext(size)
    fillContext(context, 'white')
    let canvas = context.canvas

    return exporterCommon.flattenBoardToCanvas(
      boardData.boards[index],
      canvas,
      size,
      boardFilename
    )
  }
}

const saveThumbnailFile = async (index, options = { forceReadFromFiles: false, blank: false }) => {
  let imageFilePath = path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(boardData.boards[index]))

  let canvas

  if (options.blank) {
    let size = getThumbnailSize(boardData)
    let context = createSizedContext(size)
    fillContext(context, 'white')
    canvas = context.canvas
  } else {
    canvas = await renderThumbnailToNewCanvas(index, options)
  }

  // explicitly indicate to renderer that the file has changed
  setEtag(imageFilePath)

  let imageData = canvas
    .toDataURL('image/png')
    .replace(/^data:image\/\w+;base64,/, '')

  fs.writeFileSync(imageFilePath, imageData, 'base64')

  log.info('saved thumbnail', path.basename(imageFilePath), 'at index:', index)

  return index
}

const updateThumbnailDisplayFromFile = index => {
  // load the thumbnail image file
  let board = boardData.boards[index]
  let imageFilePath = path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(board))
  let src = imageFilePath + '?' + getEtag(path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(board)))

  // does a thumbnail exist in the thumbnail drawer already?
  let el = document.querySelector(`[data-thumbnail="${index}"] img`)
  if (el) {
    el.src = src
  }

  srcByUid[boardData.boards[index].uid] = src

  renderSceneTimeline()
}

const updateThumbnailDisplayFromMemory = () => {
  let index = currentBoard
  return renderThumbnailToNewCanvas(index).then(canvas => {
    let imageData = canvas
      .toDataURL('image/png')

    // cache image
    srcByUid[boardData.boards[index].uid] = imageData

    // find the thumbnail image
    let el = document.querySelector(`[data-thumbnail="${index}"] img`)
    if (el) {
      el.src = imageData
    }

    renderSceneTimeline()
  })
}

// DEPRECATED
// const setThumbnailDisplayAsPending = async (index) => {
//   let size = getThumbnailSize(boardData)
//   let context = createSizedContext(size)
//   fillContext(context, 'white')
//   let imageData = context.canvas.toDataURL('image/png')
//
//   // cache image
//   srcByUid[boardData.boards[index].uid] = imageData
// }

let deleteSingleBoard = (index) => {
  if (boardData.boards.length > 1) {
    boardData.boards.splice(index, 1)
    markBoardFileDirty()
    renderThumbnailDrawer()
  }
}

let deleteBoards = (args)=> {
  let numDeleted = 0

  if (boardData.boards.length > 1) {
    if (selections.size) {
      storeUndoStateForScene(true)

      // delete all selected boards
      let arr = [...selections]
      arr.sort(util.compareNumbers).reverse().forEach(n =>
        deleteSingleBoard(n))

      if (selections.has(currentBoard)) {
        // if not requested to move forward
        // we take action to move intentionally backward
        if (!args) {
          currentBoard--
        }
      }

      // clear and re-render selections
      selections.clear()
      renderThumbnailDrawer()
      storeUndoStateForScene()
      numDeleted = arr.length
      // if (arr.length > 1) {
      //   // notifications.notify({message: "Deleted " + arr.length + " boards.", timing: 5})
      // } else {
      //   // notifications.notify({message: "Deleted board.", timing: 5})
      // }

    } else {
      // delete a single board
      storeUndoStateForScene(true)
      deleteSingleBoard(currentBoard)
      storeUndoStateForScene()
      // notifications.notify({message: "Deleted board.", timing: 5})

      // if not requested to move forward
      // we take action to move intentionally backward
      if (!args) {
        currentBoard--
      }
      numDeleted = 1
    }
    gotoBoard(currentBoard)
    sfx.playEffect('trash')
    sfx.negative()
  } else {
    // sfx.error()
    // notifications.notify({message: "Cannot delete. You have to have at least one board, silly.", timing: 8})
    numDeleted = 0
  }

  return numDeleted
}

/**
 * duplicateBoard
 *
 * Duplicates layers and board data, updating board data as required to reflect new uid
 *
 */
let duplicateBoard = async () => {
  if (isSavingImageFile) {
    sfx.error()
    // notifications.notify({ message: 'Could not duplicate board. Please wait until Storyboarder has saved all recent image edits.', timing: 5 })
    return Promise.reject('not ready')
  }

  storeUndoStateForScene(true)
  await saveImageFile()

  let insertAt = currentBoard + 1
  let boardSrc = boardData.boards[currentBoard]
  let boardDst = migrateBoards([util.stringifyClone(boardSrc)], insertAt)[0]

  // Per Taino's request, we are not duplicating some metadata

  boardDst.audio = null
  boardDst.newShot = false
  boardDst.dialogue = ''
  boardDst.action = ''
  boardDst.notes = ''
  boardDst.duration = boardSrc.duration // either `undefined` or a value in msecs

  try {
    // log.info('copying files from index', currentBoard, 'to index', insertAt)

    // every layer
    let filePairs = boardSrc.layers
      ? Object.keys(boardSrc.layers)
        .map(name =>
          ({
            from: boardSrc.layers[name].url,
            to: boardDst.layers[name].url
          }))
      : []

    // thumbnail
    filePairs.push({
      from: boardModel.boardFilenameForThumbnail(boardSrc),
      to: boardModel.boardFilenameForThumbnail(boardDst)
    })

    // posterframe
    filePairs.push({
      from: boardModel.boardFilenameForPosterFrame(boardSrc),
      to: boardModel.boardFilenameForPosterFrame(boardDst)
    })

    // is there an existing link?
    if (boardSrc.link) {
      // make a copy with the new name
      filePairs.push({
        from: boardSrc.link,
        to: boardModel.boardFilenameForLink(boardDst)
      })
    }

    // NOTE: audio is not copied

    // absolute paths
    filePairs = filePairs.map(filePair => ({
      from: path.join(boardPath, 'images', filePair.from),
      to: path.join(boardPath, 'images', filePair.to)
    }))

    for (let { from, to } of filePairs) {
      // log.info('duplicate', path.basename(from), 'to', path.basename(to))
      if (!fs.existsSync(from)) {
        log.error('Could not find', from)
        throw new Error('Could not find', from)
      }
    }

    for (let { from, to } of filePairs) {
      // log.info('duplicate is copying from', from, 'to', to)
      fs.writeFileSync(to, fs.readFileSync(from))
    }

    // insert data
    boardData.boards.splice(insertAt, 0, boardDst)
    markBoardFileDirty()
    storeUndoStateForScene()

    // boardData.boards has changed,
    // so reflect spliced board in thumbnail drawer
    renderThumbnailDrawer()

    // sfx.bip('c7')
    sfx.down(-1, 2)
    notifications.notify({ message: 'Duplicated board.', timing: 5 })

    return insertAt
  } catch (err) {
    log.error(err)
    notifications.notify({ message: 'Error: Could not duplicate board.', timing: 5 })
    throw new Error(err)
  }
}

/**
 * clearLayers
 *
 * if we're not on the eraser tool,
 *   and we're either pressing the meta key,
 *     OR being told explicitly to erase the current layer,
 *       we should erase ONLY the current layer
 */
const clearLayers = shouldEraseCurrentLayer => {
  if (storyboarderSketchPane.preventIfLocked()) return

  if (store.getState().toolbar.activeTool !== 'eraser' &&
      (isCommandPressed('drawing:clear-current-layer-modifier') || shouldEraseCurrentLayer)) {
    storyboarderSketchPane.clearLayers([storyboarderSketchPane.sketchPane.getCurrentLayerIndex()])
    // saveImageFile()
    sfx.playEffect('trash')
    notifications.notify({ message: 'Cleared current layer.', timing: 5 })
  } else {
    if (storyboarderSketchPane.isEmpty()) {
      let numDeleted = deleteBoards()
      if (numDeleted > 0) {
        let noun = `board${numDeleted > 1 ? 's' : ''}`
        notifications.notify({
          message: `Deleted ${numDeleted} ${noun}.`,
          timing: 5
        })
      }
    } else {
      storyboarderSketchPane.clearLayers()
      // saveImageFile()
      sfx.playEffect('trash')
      notifications.notify({ message: 'Cleared all layers.', timing: 5 })
    }
  }
}

///////////////////////////////////////////////////////////////
// UI Rendering
///////////////////////////////////////////////////////////////

// TODO handle selections / shouldPreserveSelections ?
// TODO handle re-ordering?
let goNextBoard = async (direction, shouldPreserveSelections = false) => {
  let index

  index = direction
    ? currentBoard + direction
    : currentBoard + 1

  index = Math.min(Math.max(index, 0), boardData.boards.length - 1)

  if (index !== currentBoard) {
    log.info(index, '!==', currentBoard)
    await saveImageFile()
    currentBoard = index
    log.info('calling gotoBoard')
    await gotoBoard(currentBoard, shouldPreserveSelections)
  } else {
    log.info('not calling gotoBoard')
  }
}

const ScrollTypes = {
  VERTICAL: "vertical",
  HORIZONTAL: "horizontal"
}

const isElementInViewport = (el, container) => {
 
  let rectElement = el.getBoundingClientRect()
  let rectContainer = container.getBoundingClientRect()
  return (
      rectElement.top >= rectContainer.top &&
      rectElement.left >= rectContainer.left &&
      rectElement.bottom <= rectContainer.bottom &&
      rectElement.right <= rectContainer.right
  );
}
let scrollInterval = {}
const smoothScroll = (currentPosition, desiredPosition, element, selectedElement, scrollType = ScrollTypes.HORIZONTAL) => {
  let steps = 10
  let iteration = 0
  let offset = 10
  // Is in scroll area
  if(isElementInViewport(selectedElement, element)) {
    return
  }
  let padding = Number.parseInt(window.getComputedStyle(element, null).getPropertyValue('padding'))
  let rectElement = selectedElement.getBoundingClientRect()
  let rectContainer = element.getBoundingClientRect()
  let difference
  // Is Object higher 
  if( rectElement.top >= rectContainer.top &&
    rectElement.left >= rectContainer.left) {
    difference = scrollType === ScrollTypes.HORIZONTAL ? rectElement.right - rectContainer.right : rectElement.bottom - rectContainer.bottom
    difference += padding + offset
  }
  else {
    difference = scrollType === ScrollTypes.HORIZONTAL ? rectElement.left - rectContainer.left : rectElement.top - rectContainer.top
    difference -= padding - offset
  }
  let iterationStep = difference / steps
  let interval = setInterval(() => {
    if (currentPosition !== desiredPosition && iteration !== steps) {
      if(scrollType === ScrollTypes.HORIZONTAL) {
        element.scrollTo(currentPosition += iterationStep, 0);
      } else {
        element.scrollTo(0, currentPosition += iterationStep);
      }
      iteration ++;
    } else {
      clearInterval(interval);
    }
  }, 10);
  return interval
}

let gotoBoard = (boardNumber, shouldPreserveSelections = false) => {
  if(isRecording && isRecordingStarted) {
    // make sure we capture the last frame
    // grab full-size image from current sketchpane (in memory)
    let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
      storyboarderSketchPane.sketchPane.width,
      storyboarderSketchPane.sketchPane.height,
      storyboarderSketchPane.visibleLayersIndices
    )
    // un-premultiply
    SketchPaneUtil.arrayPostDivide(pixels)
    canvasRecorder.capture([
      SketchPaneUtil.pixelsToCanvas(
        pixels,
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height
      )
    ], {force: true, duration: 500})
  }

  // toolbar.emit('cancelTransform')
  return new Promise((resolve, reject) => {
    clearTimeout(drawIdleTimer)

    currentBoard = boardNumber
    currentBoard = Math.max(currentBoard, 0)
    currentBoard = Math.min(currentBoard, boardData.boards.length - 1)

    if (!shouldPreserveSelections) selections.clear()
    selections = new Set([...selections.add(currentBoard)].sort(util.compareNumbers))

    renderSceneTimeline()

    // let shouldRenderThumbnailDrawer = false
    if (shouldRenderThumbnailDrawer) {

      renderThumbnailDrawerSelections()
      for (var item of document.querySelectorAll('.thumbnail')) {
        item.classList.remove('active')
      }

      let thumbDivs = document.querySelectorAll(`[data-thumbnail='${currentBoard}']`)
      for(let i = 0; i < thumbDivs.length; i++) {
        let thumbDiv = thumbDivs[i]
        if(thumbDiv.dataset.type === 'thumbnail-grid') {
          thumbDiv.classList.add('active')
          let containerDiv = document.querySelector('.grid-view')
          let rowContainer = thumbDiv.parentNode.parentNode
          if(scrollInterval.interval && !scrollInterval.parentNode.isSameNode(rowContainer)) clearInterval(scrollInterval)

          if(!scrollInterval.parentNode || !scrollInterval.parentNode.isSameNode(rowContainer)) {
            scrollInterval.interval = smoothScroll(containerDiv.scrollTop, thumbDiv.parentNode.offsetTop, containerDiv, thumbDiv, ScrollTypes.VERTICAL)
            scrollInterval.parentNode = rowContainer
          }
        } else {
          if (thumbDiv) {
            thumbDiv.classList.add('active')
            let containerDiv = document.querySelector('#thumbnail-container')
            thumbDiv.scrollIntoView()
            let thumbL = thumbDiv.offsetLeft
            let thumbR = thumbDiv.offsetLeft + thumbDiv.offsetWidth
            
            let containerL = containerDiv.scrollLeft
            let containerR = containerDiv.scrollLeft + containerDiv.offsetWidth
            
            if (thumbR >= containerR) {
              // if right side of thumbnail is beyond the right edge of the visible container
              // scroll the visible container
              // to reveal up to the right edge of the thumbnail
              containerDiv.scrollLeft = (thumbL - containerDiv.offsetWidth) + thumbDiv.offsetWidth + 100
            } else if (containerL >= thumbL) {
              // if left side of thumbnail is beyond the left edge of the visible container
              // scroll the visible container
              // to reveal up to the left edge of the thumbnail
              containerDiv.scrollLeft = thumbL - 50
            }
          } else {
            //
            // TODO when would this happen?
            //
            // wait for render, then update
            setTimeout(
              n => {
                let newThumb = document.querySelector(`[data-thumbnail='${n}']`)
                newThumb.classList.add('active')
                newThumb.scrollIntoView()
              },
              10,
              currentBoard
            )
          }
        }
      }

    }

    renderMetaData()
    renderMarkerPosition()

    let board = boardData.boards[currentBoard]

    // if (shotTemplateSystem.isEnabled()) {
    //   StsSidebar.reset(board.sts)
    // }

    // fix for bug where tooltip remains after ShotGeneratorPanel renders
    tooltips.closeAll()

    renderShotGeneratorPanel()


    // guides && guides.setPerspectiveParams({
    //   cameraParams: board.sts && board.sts.camera,
    //   rotation: 0
    // })

    ipcRenderer.send('analyticsEvent', 'Board', 'go to board', null, currentBoard)

    let updateFromLinkIfRequired = () =>
      (board.link)
        ? linkedFileManager.activateBoard(
            board,
            filename => refreshLinkedBoardByFilename(filename, { forceReadFromFiles: true })
          )
        : Promise.resolve()

    serial([updateFromLinkIfRequired, () => updateSketchPaneBoard()])
      .then(() => {
        audioPlayback.playBoard(currentBoard)
        resolve()
      }).catch(e => {
        log.info('gotoBoard could not updateSketchPaneBoard')
        log.error(e)
        reject(e)
      })
  })
}

const renderShotGeneratorPanel = () => {
  let src = path.join(
    path.dirname(boardFilename),
    'images',
    boardModel.boardFilenameForLayerThumbnail(
      boardData.boards[currentBoard],
      'shot-generator'
    )
  )

  let thumbnail = fs.existsSync(src)
    ? src + '?' + cacheKey(src)
    : null

  let aspectRatio = boardData.aspectRatio

  let onOpen = event => {
    event.preventDefault()

    // briefly show loading cursor while we load the Shot Generator window
    let el = document.querySelector('#shot-generator-container a')
    let prev = el.style.cursor
    el.style.cursor = 'wait'
    setTimeout(() => {
      el.style.cursor = prev
    }, 2000)

    ipcRenderer.send('shot-generator:open')
  }

  ReactDOM.render(
    h([ShotGeneratorPanel, { thumbnail, aspectRatio, onOpen }]),
    document.querySelector('#shot-generator-container')
  )
}

let renderMarkerPosition = () => {
  // let shouldRenderThumbnailDrawer = false
  if (!shouldRenderThumbnailDrawer) return

  let curr = boardData.boards[currentBoard]
  let last = boardData.boards[boardData.boards.length - 1]

  let percentage
  if (last.duration) {
    percentage = (curr.time) / (last.time + last.duration)
  } else {
    percentage = (curr.time) / (last.time + boardData.defaultBoardTiming)
  }

  let width = document.querySelector('#timeline #movie-timeline-content').offsetWidth
  document.querySelector('#timeline .marker').style.left = (width * percentage) + 'px'

  document.querySelector('#timeline .left-block').innerHTML = util.msToTime(curr.time)

  let totalTime
  if (last.duration) {
    totalTime = (last.time + last.duration)
  } else {
    totalTime = (last.time + boardData.defaultBoardTiming)
  }
  document.querySelector('#timeline .right-block').innerHTML = util.msToTime(totalTime)

  sceneTimelineView.update({
    currentBoardIndex: currentBoard
  })
}

const renderShotMetadata = () => {
  document.querySelector('#board-metadata #shot').innerHTML = `${i18n.t('main-window.board-information.shot')}: ` + boardData.boards[currentBoard].shot
  document.querySelector('#board-metadata #board-numbers').innerHTML = `${i18n.t('main-window.board-information.board')}: ` + boardData.boards[currentBoard].number + ` ${i18n.t("main-window.board-information.of")} ` + boardData.boards.length
}

let renderMetaData = () => {
  renderShotMetadata()

  // reset values
  let editableInputs = document.querySelectorAll('#board-metadata input:not(.layers-ui-reference-opacity), textarea')
  for (var item of editableInputs) {
    item.value = ''
    item.checked = false
  }

  if (boardData.boards[currentBoard].newShot) {
    document.querySelector('input[name="newShot"]').checked = true
  }

  if (boardData.boards[currentBoard].duration) {
    if (selections.size == 1) {
      // show current board
      for (let input of editableInputs) {
        input.disabled = false
        let label = document.querySelector(`label[for="${input.name}"]`)
        label && label.classList.remove('disabled')
      }

      document.querySelector('input[name="duration"]').value = boardData.boards[currentBoard].duration != null
        ? boardData.boards[currentBoard].duration
        : ''
      document.querySelector('input[name="frames"]').value = msecsToFrames(boardData.boards[currentBoard].duration)
    } else {
      for (let input of editableInputs) {
        input.disabled = (input.name !== 'duration' && input.name !== 'frames')
        let label = document.querySelector(`label[for="${input.name}"]`)
        label && label.classList.add('disabled')
      }

      let uniqueDurations = util.uniq(boardData.boards.map(b => b.duration))

      if (uniqueDurations.length == 1) {
        // unified
        let duration = uniqueDurations[0]
        document.querySelector('input[name="duration"]').value = duration != null
          ? duration
          : ''
        document.querySelector('input[name="frames"]').value = msecsToFrames(boardModel.boardDuration(boardData, boardData.boards[currentBoard].duration))
      } else {
        document.querySelector('input[name="duration"]').value = null
        document.querySelector('input[name="frames"]').value = null
      }
    }
  }

  if (boardData.boards[currentBoard].dialogue) {
    document.querySelector('textarea[name="dialogue"]').value = boardData.boards[currentBoard].dialogue
    let suggestionDuration = document.querySelector('#suggested-dialogue-duration')
    let duration = util.durationOfWords(boardData.boards[currentBoard].dialogue, 300)+300
    suggestionDuration.innerHTML = "// about " + (duration/1000) + " seconds"
    suggestionDuration.dataset.duration = duration
  }
  renderCaption()

  if (boardData.boards[currentBoard].action) {
    document.querySelector('textarea[name="action"]').value = boardData.boards[currentBoard].action
  }
  if (boardData.boards[currentBoard].notes) {
    document.querySelector('textarea[name="notes"]').value = boardData.boards[currentBoard].notes
  }
  renderMetaDataLineMileage()

  // TODO how to regenerate tooltips?
  // if (boardData.defaultBoardTiming) {
  //   document.querySelector('input[name="duration"]').dataset.tooltipDescription = `Enter the number of milliseconds for a board. There are 1000 milliseconds in a second. ${boardData.defaultBoardTiming} milliseconds is the default.`
  //
  //   let defaultFramesPerBoard = Math.round(boardData.defaultBoardTiming / 1000 * 24)
  //   document.querySelector('input[name="frames"]').dataset.tooltipDescription = `Enter the number of frames for a board. There are 24 frames in a second. ${defaultFramesPerBoard} frames is the default.`
  // }

  renderStats()

  audioFileControlView.setState({
    boardAudio: boardData.boards[currentBoard].audio
  })
}

const renderCaption = () => {
  if (boardData.boards[currentBoard].dialogue) {
    document.querySelector('#canvas-caption').innerHTML = boardData.boards[currentBoard].dialogue
    document.querySelector('#canvas-caption').style.display = 'block'
  } else {
    document.querySelector('#suggested-dialogue-duration').innerHTML = ''
    document.querySelector('#canvas-caption').style.display = 'none'
  }
}

const renderMetaDataLineMileage = () => {
  let board = boardData.boards[currentBoard]
  if (board.lineMileage){
    document.querySelector('#line-miles').innerHTML = (board.lineMileage/5280).toFixed(1) + ' line miles'
  } else {
    document.querySelector('#line-miles').innerHTML = '0 line miles'
  }
}

const renderStats = () => {
  //
  //
  // left stats
  //
  let primaryStats = []
  let secondaryStats = []

  if (!util.isUndefined(scriptData)) {
    primaryStats.push( `SCENE ${currentScene + 1} SHOT ${boardData.boards[currentBoard].shot}` )
  } else {
    primaryStats.push( `SHOT ${boardData.boards[currentBoard].shot}` )
  }

  let stats = []
  let totalNewShots = boardData.boards.reduce((a, b) => a + (b.newShot ? 1 : 0), 0) || 1
  secondaryStats.push(
    `${boardData.boards.length} ${util.pluralize(boardData.boards.length, 'board').toUpperCase()}, ` +
    `${totalNewShots} ${util.pluralize(totalNewShots, 'shot').toUpperCase()}`
  )

  let totalLineMileage = boardData.boards.reduce((a, b) => a + (b.lineMileage || 0), 0)
  let avgLineMileage = totalLineMileage / boardData.boards.length
  secondaryStats.push( (avgLineMileage/5280).toFixed(1) + ' AVG. LINE MILEAGE' )

  document.querySelector('#left-stats .stats-primary').innerHTML = primaryStats.join('<br />')
  document.querySelector('#left-stats .stats-secondary').innerHTML = secondaryStats.join('<br />')



  //
  //
  // right stats
  //
  let rightStatsPrimaryEl = document.querySelector('#right-stats .stats-primary')
  rightStatsPrimaryEl.innerHTML = util.truncateMiddle(path.basename(boardFilename, path.extname(boardFilename))) + '.storyboarder'
  rightStatsPrimaryEl.title = path.basename(boardFilename)

  // if (scriptData) {
  //   let numScenes = scriptData.filter(data => data.type == 'scene').length

  //   let numBoards = 'N' // TODO sum total number of boards in the script

  //   document.querySelector('#right-stats .stats-primary').innerHTML = `${numScenes} SCENES ${numBoards} BOARDS`
  // } else {
  //   let numBoards = boardData.boards.length
  //   document.querySelector('#right-stats .stats-primary').innerHTML = `${numBoards} BOARDS`
  // }
  // document.querySelector('#right-stats .stats-secondary').innerHTML = `AVG BOARDS PER SCENE, TOTAL TIME`


  if (
    (scriptData && viewMode == 5) ||
    (!scriptData && viewMode == 3)
  ) {
    document.getElementById('left-stats').classList.add('stats__large')
    document.getElementById('right-stats').classList.add('stats__large')

    document.querySelector('#right-stats').style.display = 'none' // HACK hide right stats for now, until we have real data
    document.querySelector('#left-stats').style.textAlign = 'center' // HACK
  } else {
    document.getElementById('left-stats').classList.remove('stats__large')
    document.getElementById('right-stats').classList.remove('stats__large')

    document.querySelector('#right-stats').style.display = 'flex' // HACK hide right stats for now, until we have real data
    document.querySelector('#left-stats').style.textAlign = 'left' // HACK
  }
}

let nextScene = ()=> {
  if (scriptData) {
    if (currentBoard < (boardData.boards.length -1) && currentBoard !== 0) {
      currentBoard = (boardData.boards.length -1)
      gotoBoard(currentBoard)
    } else {
      saveBoardFile()
      currentScene++
      loadScene(currentScene).then(() => {
        migrateScene()
        verifyScene().then(() => {
          renderScript()
          renderScene()
        })
      })
    }
  } else {
    if (currentBoard < (boardData.boards.length -1)) {
      currentBoard = (boardData.boards.length -1)
      gotoBoard(currentBoard)
    } else {
      sfx.error()
      notifications.notify({message: "Sorry buddy. I can't go back further.", timing: 5})
    }
  }
}

let previousScene = ()=> {
  if (scriptData) {
    if (currentBoard > 0) {
      currentBoard = 0
      gotoBoard(currentBoard)
    } else {
      saveBoardFile()
      currentScene--
      currentScene = Math.max(0, currentScene)
      loadScene(currentScene).then(() => {
        migrateScene()
        verifyScene().then(() => {
          renderScript()
          renderScene()
        })
      })
    }
  } else {
    if (currentBoard > 0) {
      currentBoard = 0
      gotoBoard(currentBoard)
    } else {
      sfx.error()
      notifications.notify({message: "Nope. I can't go any further.", timing: 5})
    }
  }
}


const loadPosterFrame = async board => {
  let lastModified
  let filename = boardModel.boardFilenameForPosterFrame(board)
  let imageFilePath = path.join(boardPath, 'images', filename)

  if (!fs.existsSync(imageFilePath)) {
    log.info('loadPosterFrame failed')
    return false
  }

  imageFilePath = imageFilePath + '?' + cacheKey(imageFilePath)

  try {
    let image = await exporterCommon.getImage(imageFilePath)
    storyboarderSketchPane.sketchPane.replaceLayer(
      storyboarderSketchPane.sketchPane.layers.findByName('composite').index,
      image
    )
    log.info('loadPosterFrame rendered jpg')
    return true
  } catch (err) {
    log.info('loadPosterFrame failed')
    return false
  }
}
const clearPosterFrame = () => {
  log.info('clearPosterFrame')
  storyboarderSketchPane.clearLayer(
    storyboarderSketchPane.sketchPane.layers.findByName('composite').index
  )
}

// HACK draw a fake poster frame to occlude the view
// TODO we could instead hide/show the layers via PIXI.Sprite#visible?
const renderFakePosterFrame = () => {
  if (
    !fakePosterFrameCanvas ||
    fakePosterFrameCanvas.width != storyboarderSketchPane.sketchPane.width ||
    fakePosterFrameCanvas.height != storyboarderSketchPane.sketchPane.height
  ) {
    let canvas = document.createElement('canvas')
    let context = canvas.getContext('2d')

    canvas.width = storyboarderSketchPane.sketchPane.width
    canvas.height = storyboarderSketchPane.sketchPane.height

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    // context.fillStyle = '#000000'
    // context.font = '24px serif'
    // context.fillText('Loading …', (canvas.width - 50) / 2, canvas.height / 2)
    // context.globalAlpha = 0.5

    fakePosterFrameCanvas = canvas
  }

  let layer = storyboarderSketchPane.sketchPane.layers.findByName('composite')
  layer.replaceTextureFromCanvas(fakePosterFrameCanvas)
  // TODO remove the canvas from PIXI cache?

  log.info('loadPosterFrame rendered white canvas')
}

let loaderIds = 0
function * loadSketchPaneLayers (signal, board, indexToLoad) {
  const loaderId = ++loaderIds

  const imagesPath = path.join(boardPath, 'images')

  // show the poster frame
  let hasPosterFrame = yield loadPosterFrame(board)

  // reset zoom/pan
  zoomIndex = ZOOM_CENTER
  storyboarderSketchPane.zoomCenter(ZOOM_LEVELS[zoomIndex])

  if (!hasPosterFrame) renderFakePosterFrame()

  // HACK yield to get key input and cancel if necessary
  yield CAF.delay(signal, 1)

  // queue up image files for load
  let loadables = []
  // for every layer index
  for (let index of storyboarderSketchPane.visibleLayersIndices) {
    // get the layer
    let layer = storyboarderSketchPane.sketchPane.layers[index]

    // clear the layer
    storyboarderSketchPane.clearLayer(index)

    // do we have data for a layer by this name?
    if (board.layers && board.layers[layer.name] && board.layers[layer.name].url) {
      let filename = board.layers[layer.name].url
      let filepath = path.join(imagesPath, filename)
      loadables.push({ index, filepath })
    }
  }

  for (let { index, filepath } of loadables) {
    log.info(`[${loaderId}] load layer`, index, path.basename(filepath))

    let image = yield exporterCommon.getImage(filepath + '?' + cacheKey(filepath))
    storyboarderSketchPane.sketchPane.replaceLayer(index, image)

    // HACK yield to get key input and cancel if necessary
    yield CAF.delay(signal, 1)

    // uncomment to test slow loading
    // yield CAF.delay(signal, 500)
  }

  // if a link exists, lock the board
  storyboarderSketchPane.setIsLocked(board.link != null)

  // set layer opacity
  layersEditor.loadReferenceOpacity(board)

  clearPosterFrame()

  // for better performance we currently SKIP posterframe save here
  /*
  // no poster frame was found earlier
  if (!hasPosterFrame) {
    // force a posterframe save
    yield savePosterFrame(board, indexToLoad !== currentBoard)
  }
  */
}

const updateSketchPaneBoard = async () => {
  log.info(`%cupdateSketchPaneBoard`, 'color:purple')

  // cancel any in-progress loading
  if (cancelTokens.updateSketchPaneBoard && !cancelTokens.updateSketchPaneBoard.signal.aborted) {
    log.info(`%ccanceling in-progress load`, 'color:red')
    cancelTokens.updateSketchPaneBoard.abort('cancel')
    cancelTokens.updateSketchPaneBoard = undefined
  }

  // start a new loading process
  cancelTokens.updateSketchPaneBoard = new CAF.cancelToken()

  log.info(`%cloadSketchPaneLayers`, 'color:orange')

  // get current board
  let indexToLoad = currentBoard

  let board = boardData.boards[indexToLoad]

  // load and render the layers
  try {
    let cancelable = CAF(loadSketchPaneLayers)
    let signal = cancelTokens.updateSketchPaneBoard.signal
    await cancelable(signal, board, indexToLoad)
  } catch (err) {
    log.info('failed loadSketchPaneLayers')
    log.warn(err)
  }

  // load and render the onion skin
  try {
    // configure onion skin
    onionSkin.setState({
      pathToImages: path.join(boardPath, 'images'),
      currBoard: boardData.boards[indexToLoad],
      prevBoard: boardData.boards[indexToLoad - 1],
      nextBoard: boardData.boards[indexToLoad + 1],
      enabled: store.getState().toolbar.onion
    })
    await onionSkin.load(cancelTokens.updateSketchPaneBoard)
  } catch (err) {
    log.info('failed onionSkin.load')
    log.error(err)
  }
}

let renderThumbnailDrawerSelections = () => {
  renderSceneTimeline()

  let thumbnails = document.querySelectorAll('.thumbnail')
  for (let thumb of thumbnails) {
    let i = Number(thumb.dataset.thumbnail)
    thumb.classList.toggle('active', currentBoard == i)
    thumb.classList.toggle('selected', selections.has(i))
    thumb.classList.toggle('editing', isEditMode())
  }
}

const updateSceneTiming = () => {
  let hasShots = boardData.boards.find(board => board.newShot) != null

  let currentShot = 0
  let subShot = 0
  let boardNumber = 1
  let currentTime = 0

  for (let board of boardData.boards) {
    if (hasShots) {
      if (board.newShot || (currentShot === 0)) {
        currentShot++
        subShot = 0
      } else {
        subShot++
      }

      let substr = String.fromCharCode(97 + (subShot % 26)).toUpperCase()
      if ((Math.ceil(subShot / 25) - 1) > 0) {
        substr += (Math.ceil(subShot / 25))
      }

      board.shot = currentShot + substr
      board.number = boardNumber
    } else {
      board.number = boardNumber
      board.shot = (boardNumber) + 'A'
    }
    boardNumber++

    board.time = currentTime

    currentTime += boardModel.boardDuration(boardData, board)
  }
}

const renderSceneTimeline = () => {
  sceneTimelineView && sceneTimelineView.update({
    scene: boardData,
    currentBoardIndex: currentBoard
  })
}

let renderThumbnailDrawer = () => {
  updateSceneTiming()

  isGridViewMode && gridView.renderGridView()
  // reflect the current view
  cycleViewMode(0)

  renderSceneTimeline()
  if (!shouldRenderThumbnailDrawer) {
    return
  }

  let hasShots = boardData.boards.find(board => board.newShot) != null

  let html = []
  let i = 0
  for (let board of boardData.boards) {
    html.push('<div data-thumbnail="' + i + '" class="thumbnail')
    if (hasShots) {
      if (board.newShot || (i === 0)) {
        html.push(' startShot')
      }

      if (i < boardData.boards.length - 1) {
        if (boardData.boards[i + 1].newShot) {
          html.push(' endShot')
        }
      } else {
        html.push(' endShot')
      }
    } else {
      html.push(' startShot')
      html.push(' endShot')
    }
    let thumbnailWidth = Math.floor(60 * boardData.aspectRatio)
    html.push('" style="width: ' + thumbnailWidth + 'px;">')
    let imageFilename = path.join(boardPath, 'images', board.url.replace('.png', '-thumbnail.png'))
    try {
      if (fs.existsSync(imageFilename)) {
        html.push('<div class="top">')
        let src = imageFilename + '?' + getEtag(path.join(boardPath, 'images', boardModel.boardFilenameForThumbnail(board)))
        html.push('<img src="' + src + '" height="60" width="' + thumbnailWidth + '">')
        html.push('</div>')
      } else {
        // blank image
        html.push('<img src="//:0" height="60" width="' + thumbnailWidth + '">')
      }
    } catch (err) {
      log.error(err)
    }
    html.push('<div class="info">')
    html.push('<div class="number">' + board.shot + '</div>')
    if (board.audio && board.audio.filename.length) {
      html.push(`
        <div class="audio">
          <svg>
            <use xlink:href="./img/symbol-defs.svg#icon-speaker-on"></use>
          </svg>
        </div>
      `)
    }
    html.push('<div class="caption">')
    if (board.dialogue) {
      html.push(board.dialogue)
    }
    html.push('</div><div class="duration">')
    if (board.duration) {
      html.push(util.msToTime(board.duration))
    } else {
      html.push(util.msToTime(boardData.defaultBoardTiming))
    }
    html.push('</div>')
    html.push('</div>')
    html.push('</div>')
    i++
  }
  let thumbnailDrawer = document.querySelector('#thumbnail-drawer')
  thumbnailDrawer.innerHTML = html.join('')

  renderThumbnailButtons()
  renderThumbnailDrawerSelections()

  if (!contextMenu) {
    contextMenu = new ContextMenu()
    // internal
    contextMenu.on('pointerleave', () => {
      contextMenu.remove()
    })

    // external
    contextMenu.on('shown', () => {
      sfx.playEffect('metal')
    })
    contextMenu.on('add', () => {
      newBoard().then(index => {
        gotoBoard(index)
        ipcRenderer.send('analyticsEvent', 'Board', 'new')
      }).catch(err => log.error(err))
    })
    contextMenu.on('delete', () => {
      let numDeleted = deleteBoards()
      if (numDeleted > 0) {
        let noun = `board${numDeleted > 1 ? 's' : ''}`
        notifications.notify({
          message: `Deleted ${numDeleted} ${noun}.`,
          timing: 5
        })
      }
    })
    contextMenu.on('duplicate', () => {
      duplicateBoard()
        .then(index => {
          gotoBoard(index)
          ipcRenderer.send('analyticsEvent', 'Board', 'duplicate')
        })
        .catch(err => log.error(err))
    })
    contextMenu.on('copy', () => {
      copyBoards()
        .then(() => notifications.notify({
          message: 'Copied board(s) to clipboard.', timing: 5
        }))
        .catch(err => {})
    })
    contextMenu.on('paste', () => {
      pasteBoards().catch(err => {})
    })
    contextMenu.on('import', () => {
      // TODO could move the dialog code out of main.js and call it directly here via remote.dialog
      ipcRenderer.send('importImagesDialogue')
    })
    contextMenu.on('reorder-left', () => {
      reorderBoardsLeft()
    })
    contextMenu.on('reorder-right', () => {
      reorderBoardsRight()
    })
  }

  let thumbnails = thumbnailDrawer.querySelectorAll('.thumbnail')
  for (var thumb of thumbnails) {
    thumb.addEventListener('pointerenter', (e) => {
      if (!isEditMode() && selections.size <= 1 && e.target.dataset.thumbnail === currentBoard) {
        contextMenu.attachTo(e.target)
      }
    })
    thumb.addEventListener('pointerleave', (e) => {
      if (!contextMenu.hasChild(e.relatedTarget)) {
        contextMenu.remove()
      }
    })
    thumb.addEventListener('pointermove', (e) => {
      if (!isEditMode() && selections.size <= 1 && e.target.dataset.thumbnail === currentBoard) {
        contextMenu.attachTo(e.target)
      }
    })
    thumb.addEventListener('pointerdown', (e) => {
      log.info('DOWN')
      if (!isEditMode() && selections.size <= 1) contextMenu.attachTo(e.target)

      // always track cursor position
      updateThumbnailCursor(e.clientX, e.clientY)

      if (e.button === 0) {
        editModeTimer = setTimeout(enableEditMode, enableEditModeDelay)
      } else {
        enableEditMode()
      }

      let index = Number(e.target.dataset.thumbnail)
      if (selections.has(index)) {
        // ignore
      } else if (isCommandPressed('workspace:thumbnails:select-multiple-modifier')) {
        if (selections.size === 0 && !util.isUndefined(currentBoard)) {
          // use currentBoard as starting point
          selections.add(currentBoard)
        }

        // add to selections
        let min = Math.min(...selections, index)
        let max = Math.max(...selections, index)
        selections = new Set(util.range(min, max))
        renderThumbnailDrawerSelections()
      } else if (currentBoard !== index) {
        // go to board by index

        // reset selections
        selections.clear()

        saveImageFile().then(() => {
          currentBoard = index
          renderThumbnailDrawerSelections()
          gotoBoard(currentBoard)
        })
      }
    }, true, true)
  }

  renderThumbnailButtons()
  renderTimeline()

  // gotoBoard(currentBoard)
}




let renderThumbnailButtons = () => {
  // let shouldRenderThumbnailDrawer = false
  if (!shouldRenderThumbnailDrawer) return

  if (!document.getElementById('thumbnail-add-btn')) {
    let drawerEl = document.getElementById('thumbnail-drawer')

    let el = document.createElement('div')
    el.dataset.tooltip = true
    el.dataset.tooltipTitle = 'New Board'
    el.dataset.tooltipDescription = 'Create a new board and draw something. Then press N again and draw some more things.'
    el.dataset.tooltipKeys = 'N'
    el.dataset.tooltipPosition = 'top center'
    el.id = 'thumbnail-add-btn'
    el.style.width = 60 + 'px'
    el.innerHTML = `
      <div class="icon">✚</div>
    `
    drawerEl.appendChild(el)

    el.addEventListener('pointerdown', event => {
      // TODO can we remove this? is it still necessary?
      let eventMouseOut = document.createEvent('MouseEvents')
      eventMouseOut.initMouseEvent('mouseout', true, true)
      el.dispatchEvent(eventMouseOut)

      newBoard(boardData.boards.length).then(index => {
        gotoBoard(index)
        ipcRenderer.send('analyticsEvent', 'Board', 'new')
      }).catch(err => log.error(err))
    })

    // NOTE tooltips.setupTooltipForElement checks prefs each time, e.g.:
    // if (sharedObj.prefs['enableTooltips']) { }
    // ... which is slow
    tooltips.setupTooltipForElement(el)
  }
}

let renderTimeline = () => {
  // reflect the current view
  cycleViewMode(0)

  // HACK store original position of marker
  let getMarkerEl = () => document.querySelector('#timeline .marker')
  let markerLeft = getMarkerEl() ? getMarkerEl().style.left : '0px'

  let html = []

  html.push('<div class="marker-holder"><div class="marker"></div></div>')

  let defaultBoardTiming = prefsModule.getPrefs().defaultBoardTiming
  boardData.boards.forEach((board, i) => {
    // if board duration is undefined or 0, use the default,
    // otherwise use the value given
    let duration = (util.isUndefined(board.duration) || board.duration === 0)
      ? defaultBoardTiming
      : board.duration

    html.push(
      `<div style="flex: ${duration}" data-node="${i}" class="t-scene"></div>`
    )
  })

  document.querySelector('#timeline #movie-timeline-content').innerHTML = html.join('')

  let boardNodes = document.querySelectorAll('#timeline #movie-timeline-content .t-scene')
  for (var board of boardNodes) {
    board.addEventListener('pointerdown', (e) => {
      saveImageFile().then(() => {
        currentBoard = Number(e.target.dataset.node)
        gotoBoard(currentBoard)
      })
    }, true, true)
  }

  // HACK restore original position of marker
  if (getMarkerEl()) getMarkerEl().style.left = markerLeft
}

let renderScenes = () => {
  let html = []
  let angle = 0
  let i = 0
  html.push('<div id="outline-gradient"></div>')
  for (var node of scriptData ) {
    switch (node.type) {
      case 'section':
        html.push('<div class="section node">' + node.text + '</div>')
        break
      case 'scene':
        if (node.scene_number !== 0) {
          if (currentScene == (Number(node.scene_number)-1)) {
            html.push('<div class="scene node active" data-node="' + (Number(node.scene_number)-1) + '" style="background:' + getSceneColor(node.slugline) + '">')
          } else {
            html.push('<div class="scene node" data-node="' + (Number(node.scene_number)-1) + '" style="background:' + getSceneColor(node.slugline) + '">')
          }
          html.push('<div class="number">SCENE ' + node.scene_number + ' - ' + util.msToTime(node.duration) + '</div>')
          if (node.slugline) {
            html.push('<div class="slugline">' + node.slugline + '</div>')
          }
          if (node.synopsis) {
            html.push('<div class="synopsis">' + node.synopsis + '</div>')
          }
          // time, duration, page, word_count
          html.push('</div>')
        }
        break
    }
    i++
  }

  document.querySelector('#scenes').innerHTML = html.join('')

  let sceneNodes = document.querySelectorAll('#scenes .scene')
  for (var node of sceneNodes) {
    node.addEventListener('pointerdown', (e)=>{
      if (currentScene !== Number(e.target.dataset.node)) {
        currentScene = Number(e.target.dataset.node)
        loadScene(currentScene).then(() => {
          migrateScene()
          verifyScene().then(() => {
            renderScript()
            renderScene()
          })
        })
      }
    }, true, true)
  }

  document.querySelector('#scenes').addEventListener('pointerdown', (e)=>{
    if (e.pointerType == 'pen' || e.pointerType == 'mouse') {
      dragTarget = document.querySelector('#scenes')
      dragTarget.style.overflow = 'hidden'
      dragTarget.style.scrollBehavior = 'unset'
      dragMode = true
      dragPoint = [e.pageX, e.pageY]
      scrollPoint = [dragTarget.scrollLeft, dragTarget.scrollTop]
    }
  })

  document.querySelector('#script').addEventListener('pointerdown', (e)=>{
    if (e.pointerType == 'pen' || e.pointerType == 'mouse') {
      dragTarget = document.querySelector('#script')
      dragTarget.style.overflow = 'hidden'
      dragTarget.style.scrollBehavior = 'unset'
      dragMode = true
      dragPoint = [e.pageX, e.pageY]
      scrollPoint = [dragTarget.scrollLeft, dragTarget.scrollTop]
    }
  })
}

let renderScript = () => {
  // HACK basic HTML strip, adds two spaces. could use 'striptags' lib instead?
  const stripHtml = string => string.replace(/<[^>]+>/g, ' ')

  // log.info('renderScript currentScene:', currentScene)
  let sceneCount = 0
  let html = []
  for (var node of scriptData ) {
    if (node.type == 'scene') {
      if (node.scene_number == (currentScene+1)) {
        let notes = node.slugline + '\n' + node.synopsis
        html.push('<div class="item slugline" data-notes="' + notes + '" data-duration="' + node.duration + '"><div class="number" style="pointer-events: none">SCENE ' + node.scene_number + ' - ' +  util.msToTime(node.duration) + '</div>')

        html.push('<div style="pointer-events: none">' + node.slugline + '</div>')
        if (node.synopsis) {
          html.push('<div class="synopsis" style="pointer-events: none">' + node.synopsis + '</div>')
        }

        html.push('</div>')
        for (var item of node.script) {
          let durationAsDataAttr = item.duration ? ` data-duration="${item.duration}"` : ''
          switch (item.type) {
            case 'action':
              html.push('<div class="item" data-action="' + stripHtml(item.text) + '"' + durationAsDataAttr + '>' + stripHtml(item.text) + '</div>')
              break
            case 'dialogue':
              html.push('<div class="item" data-character="' + stripHtml(item.character) + '" data-dialogue="' + stripHtml(item.text) + '"' + durationAsDataAttr + '>' + stripHtml(item.character) + '<div class="dialogue" style="pointer-events: none">' + stripHtml(item.text) + '</div></div>')
              break
            case 'transition':
              html.push('<div class="item transition" data-notes="' + stripHtml(item.text) + '"' + durationAsDataAttr + '>' + stripHtml(item.text) + '</div>')
              break
          }
        }
        break
      }
      sceneCount++
    }
  }
  document.querySelector('#script').innerHTML = html.join('')

  let scriptNodes = document.querySelectorAll('#script .item')
  for (let node of scriptNodes) {
    node.addEventListener('dblclick', event => {
      let duration, dialogue, action, notes
      let shouldConfirm = false

      if (event.target.dataset.duration) {
        duration = event.target.dataset.duration
      }
      if (event.target.dataset.dialogue) {
        dialogue = event.target.dataset.character + ': ' + event.target.dataset.dialogue
      }
      if (event.target.dataset.action) {
        action = event.target.dataset.action
      }
      if (event.target.dataset.notes) {
        notes = event.target.dataset.notes
      }

      if (duration || dialogue || action || notes) {
        let board = boardData.boards[currentBoard]

        if (duration && board.duration) shouldConfirm = true
        if (dialogue && board.dialogue) shouldConfirm = true
        if (action && board.action) shouldConfirm = true
        if (notes && board.notes) shouldConfirm = true

        let canWrite
        if (shouldConfirm) {
          canWrite = confirm(
            'This board’s metadata will be overwritten. Are you sure?'
          )
        } else {
          canWrite = true
        }

        if (canWrite && duration) board.duration = duration
        if (canWrite && dialogue) board.dialogue = dialogue
        if (canWrite && action) board.action = action
        if (canWrite && notes) board.notes = notes

        markBoardFileDirty()

        renderMetaData()
      }
    }, true, true)
  }
}

let assignColors = function () {
  let angle = (360/30)*3
  for (var node of locations) {
    angle += (360/30)+47
    c = Color("#00FF00").shiftHue(angle).desaturateByRatio(.1).darkenByRatio(0.65).blend(Color('white'), 0.4).saturateByRatio(.9)
    node.push(c.toCSS())
  }
}

let getSceneColor = function (sceneString) {
  if (sceneString && (sceneString !== 'BLACK')) {
    let location = sceneString.split(' - ')
    if (location.length > 1) {
      location.pop()
    }
    location = location.join(' - ')
    return (locations.find(function (node) { return node[0] == location })[2])
  }
  return ('black')
}

const getScrollingStrength = (distance) => {
  // default is the dead zone at 0
  let strength = 0
  // -1..-0.5
  if (distance < -0.5)
  {
    strength = -util.norm(distance, -0.5, -1)
  }
  // 0.5..1
  else if (distance > 0.5)
  {
    strength = util.norm(distance, 0.5, 1)
  }

  strength = util.clamp(strength, -1, 1)
  return strength
}

let setScroll = (point, target, elementSize, sideName, sizeName, scrollDirection) => {
  let containerRect = target.getBoundingClientRect()
  let mousePos = point - containerRect[sideName]
  let midpointPos = containerRect[sizeName] / 2

  // distance ratio -1...0...1
  let distance = (mousePos - midpointPos) / midpointPos

  let strength = getScrollingStrength(distance)

  // max speed is half of the average board width per pointermove
  let speedlimit = Math.floor(elementSize * boardData.aspectRatio * 0.5)

  // NOTE I don't bother clamping min/max because scrollLeft handles that for us
  let newScroll = target[scrollDirection] + (strength * speedlimit)

  target[scrollDirection] = newScroll
}

let scrollTarget = ({x = null, y = null}, target, elementSize) => {
  if(x) {
    setScroll(x, target, elementSize, 'left', 'width', 'scrollLeft')
  } 
  if(y) {
    setScroll(y, target, elementSize, 'top', 'height', 'scrollTop')
  }

}


let updateDrag = () => {
  if (util.isUndefined(lastPointer.x) || util.isUndefined(lastPointer.y)) {
    return
  }


  if (isEditMode() && dragMode) {

    !gridView.IsEditMode ? scrollTarget({x:lastPointer.x}, dragTarget, 60) :
                          scrollTarget({y:lastPointer.y}, document.querySelector('.grid-view'), gridView.getDefaultHeight())
    updateThumbnailCursor(lastPointer.x, lastPointer.y)
    renderThumbnailCursor()
    gridView.IsEditMode && gridView.updateGridViewCursor(lastPointer.x, lastPointer.y)
    gridView.IsEditMode && gridView.renderGridViewCursor()
  }
}

let periodicDragUpdate = () => {
  updateDrag()
  periodicDragUpdateTimer = setTimeout(periodicDragUpdate, periodicDragUpdatePeriod)
}

///////////////////////////////////////////////////////////////


let loadScene = async (sceneNumber) => {
  if (boardData) {
    await saveImageFile()
    saveBoardFile()
  }

  currentBoard = 0

  let boardsDirectoryFolders = fs.readdirSync(currentPath)
   .filter(
     file => fs.statSync(path.join(currentPath, file)).isDirectory()
   )

  let sceneCount = 0

  for (var node of scriptData) {
    if (node.type == 'scene') {
      // does the boardfile/directory exist?
      if (sceneNumber == (Number(node.scene_number)-1)) {
        // load script
        sceneCount++
        let directoryFound = false
        let foundDirectoryName

        log.info('scene:')
        log.info(node)

        let id

        if (node.scene_id) {
          id = node.scene_id.split('-')
          if (id.length>1) {
            id = id[1]
          } else {
            id = id[0]
          }
        } else {
          id = 'G' + sceneCount
        }

        for (var directory of boardsDirectoryFolders) {
          let directoryId = directory.split('-')
          directoryId = directoryId[directoryId.length - 1]
          if (directoryId == id) {
            directoryFound = true
            foundDirectoryName = directory
            log.info("FOUND THE DIRECTORY!!!!")
            break
          }
        }

        if (!directoryFound) {
          log.info(node)
          log.info("MAKE DIRECTORY")

          let directoryName = 'Scene-' + node.scene_number + '-'
          if (node.synopsis) {
            directoryName += node.synopsis.substring(0, 50).replace(/\|&;\$%@"<>\(\)\+,/g, '').replace(/\./g, '').replace(/ - /g, ' ').replace(/ /g, '-').replace(/[|&;/:$%@"{}?|<>()+,]/g, '-')
          } else {
            directoryName += node.slugline.substring(0, 50).replace(/\|&;\$%@"<>\(\)\+,/g, '').replace(/\./g, '').replace(/ - /g, ' ').replace(/ /g, '-').replace(/[|&;/:$%@"{}?|<>()+,]/g, '-')
          }
          directoryName += '-' + node.scene_id

          log.info(directoryName)
          // make directory
          fs.mkdirSync(path.join(currentPath, directoryName))
          // make storyboarder file

          let newBoardObject = {
            version: pkg.version,
            aspectRatio: boardSettings.aspectRatio,
            fps: prefsModule.getPrefs().lastUsedFps || 24,
            defaultBoardTiming: 2000,
            boards: []
          }
          boardFilename = path.join(currentPath, directoryName, directoryName + '.storyboarder')
          boardData = newBoardObject
          fs.writeFileSync(boardFilename, JSON.stringify(newBoardObject, null, 2))
          // make storyboards directory
          fs.mkdirSync(path.join(currentPath, directoryName, 'images'))

        } else {
          // load storyboarder file
          log.info('load storyboarder!')
          log.info(foundDirectoryName)

          if (!fs.existsSync(path.join(currentPath, foundDirectoryName, 'images'))) {
            fs.mkdirSync(path.join(currentPath, foundDirectoryName, 'images'))
          }


          boardFilename = path.join(currentPath, foundDirectoryName, foundDirectoryName + '.storyboarder')
          boardData = JSON.parse(fs.readFileSync(boardFilename))
        }

        // update UI to reflect current scene node
        let currentNodeId = Number(node.scene_number) - 1

        for (var item of document.querySelectorAll('#scenes .scene')) {
          item.classList.remove('active')
        }
        if (document.querySelector("[data-node='" + currentNodeId + "']")) {
          document.querySelector("[data-node='" + currentNodeId + "']").classList.add('active')
        }
        break
      }
    }
  }

  if (boardFilename) {
    boardPath = boardFilename.split(path.sep)
    boardPath.pop()
    boardPath = boardPath.join(path.sep)
    log.info('BOARD PATH:', boardPath)

    dragTarget = document.querySelector('#thumbnail-container')
    dragTarget.style.scrollBehavior = 'unset'

    ipcRenderer.send('analyticsEvent', 'Application', 'open', boardFilename, boardData.boards.length)

    await ensureBoardExists()
  } else {
    throw new Error(`Missing .storyboarder file for scene ${sceneNumber}.`)
  }
}

const ensureBoardExists = async () => {
  // ensure at least one board exists
  if (boardData.boards.length == 0) {
    // create a new board
    await newBoard(0, false)
  }
}

window.onmousedown = (e) => {
  stopPlaying()
}

const resize = () => {
  const toolbarEl = document.getElementById('toolbar')

  // measure the area available to the drawing workspace
  const scenesWidth = document.getElementById('scenes').getBoundingClientRect().width
  const scriptWidth = document.getElementById('script').getBoundingClientRect().width
  const windowWidth = document.body.offsetWidth

  const workspaceWidth = windowWidth - scenesWidth - scriptWidth

  // toolbar buttons start getting smaller right away
  let breakpointToolbar = 1895
  toolbarEl.classList.toggle('with-toolbar-small', workspaceWidth <= breakpointToolbar)

  // when the workspace is constrained, then the brush tools contract as well
  let breakpointWorkspace = 1635
  toolbarEl.classList.toggle('with-workspace-small', workspaceWidth <= breakpointWorkspace)
}

window.onkeydown = (e) => {
  // if a key is pressed which is NOT the play key ...
  if (!isCommandPressed('menu:navigation:play')) {
    // ... halt playback
    stopPlaying()
  }

  if (!storyboarderSketchPane) return

  // if this is not a locked board
  if (!storyboarderSketchPane.getIsLocked()) {
    // but we're busy (e.g.: marquee, straight line drawing)
    if (store.getState().toolbar.modeStatus === 'busy') {
      // ignore key input
      return
    }
  }


  // TEMPORARY
  // key command to trigger registration window during early testing
  if (isCommandPressed('registration:open')) {
    e.preventDefault()
    ipcRenderer.send('registration:open')
  }

  if (textInputMode) {
    // keyboard control over focus in text fields
    switch (e.target.name) {
      // numbers
      case 'duration':
      case 'frames':
      if (isCommandPressed('input:cancel') || isCommandPressed('input:commit:single-line')) {
        e.target.blur()
      }
      break

      // text
      case 'dialogue':
      case 'action':
      case 'notes':
      if (isCommandPressed('input:cancel') || isCommandPressed('input:commit:multi-line')) {
        e.target.blur()
      }
      break
    }
  }

  if (!textInputMode) {
    // log.info('window.onkeydown', e)

    if (isCommandPressed('drawing:marquee-mode')) {
      if (store.getState().toolbar.mode !== 'marquee') {
          store.dispatch({
            type: 'TOOLBAR_MODE_SET',
            payload: 'marquee',
            meta: { scope: 'local' }
          })
          if (store.getState().toolbar.mode === 'marquee') {
            sfx.playEffect('metal')
          }
      }
    }

    if (isCommandPressed('menu:edit:copy')) {
      e.preventDefault()
      copyBoards()
        .then(() => notifications.notify({
          message: 'Copied board(s) to clipboard.', timing: 5
        }))
        .catch(err => {})

    } else if (isCommandPressed('menu:edit:cut')) {
      e.preventDefault()
      copyBoards()
        .then(() => {
          deleteBoards()
          notifications.notify({ message: 'Cut board(s) to clipboard.', timing: 5 })
        }).catch(err => {})

    } else if (isCommandPressed('menu:edit:paste')) {
      e.preventDefault()
      pasteBoards().catch(err => {})

    } else if (isCommandPressed('menu:edit:redo')) {
      e.preventDefault()

      // FIXME TODO only prevent if undo state board was the locked board #929
      if (storyboarderSketchPane.preventIfLocked()) return

      if (undoStack.getCanRedo()) {
        undoStack.redo()
        sfx.rollover()
      } else {
        sfx.error()
        notifications.notify({ message: 'Nothing more to redo!', timing: 5 })
      }

    } else if (isCommandPressed('menu:edit:undo')) {
      e.preventDefault()

      // FIXME TODO only prevent if undo state board was the locked board #929
      if (storyboarderSketchPane.preventIfLocked()) return

      if (undoStack.getCanUndo()) {
        undoStack.undo()
        sfx.rollover()
      } else {
        sfx.error()
        notifications.notify({ message: 'Nothing left to undo!', timing: 5 })
      }

    // TAB and SHIFT+TAB
    } else if (isCommandPressed('menu:view:cycle-view-mode-reverse')) {
      cycleViewMode(-1)
      e.preventDefault()

    } else if (isCommandPressed('menu:view:cycle-view-mode')) {
      cycleViewMode(+1)
      e.preventDefault()
    }

    // ESCAPE KEY
    if (isCommandPressed('drawing:exit-current-mode')) {
      e.preventDefault()

      if (dragMode && isEditMode() && selections.size) {
        disableEditMode()
        disableDragMode()
      } else {

        // ESCAPE KEY also used to de-select selected boards
        if (isCommandPressed('workspace:thumbnails:select-none')) {
          e.preventDefault()
          selections.clear()
          selections.add(currentBoard)
          renderThumbnailDrawer()
        }

      }
    }
    // ESCAPE KEY
    if (isCommandPressed('menu:navigation:stop-all-sounds')) {
      e.preventDefault()
      audioPlayback.stopAllSounds()
    }

    if (!storyboarderSketchPane.getIsDrawingOrStabilizing()) {
      if (storyboarderSketchPane.sketchPane.zoom === 1) {
        if (isCommandPressed('menu:navigation:play')) {
          e.preventDefault()
          togglePlayback()
        }
      }
    }
  }

  if (!textInputMode || textInputAllowAdvance) {

    //
    //
    // arrow left
    //
    if (isCommandPressed("menu:navigation:previous-scene")) {
      e.preventDefault()
      previousScene()
    } else if (isCommandPressed("menu:boards:reorder-left")) {
      e.preventDefault()
      reorderBoardsLeft()
    } else if (isCommandPressed("menu:navigation:previous-board")) {
      e.preventDefault()
      let shouldPreserveSelections = isCommandPressed("workspace:thumbnails:select-multiple-modifier")
      goNextBoard(-1, shouldPreserveSelections)

    //
    //
    // arrow right
    //
    } else if (isCommandPressed("menu:navigation:next-scene")) {
      e.preventDefault()
      nextScene()
    } else if (isCommandPressed("menu:boards:reorder-right")) {
      e.preventDefault()
      reorderBoardsRight()
    } else if (isCommandPressed("menu:navigation:next-board")) {
      e.preventDefault()
      let shouldPreserveSelections = isCommandPressed("workspace:thumbnails:select-multiple-modifier")
      goNextBoard(1, shouldPreserveSelections)
    }
  }

  contextMenu && contextMenu.remove()
}

let disableDragMode = () => {
  clearTimeout(periodicDragUpdateTimer)
  dragMode = false
  dragTarget.style.overflow = 'scroll'
  // dragTarget.style.scrollBehavior = 'smooth'
}

///////////////////////////////////////////////////////////////
// Playback
///////////////////////////////////////////////////////////////
const NANOSECONDS_TO_MSECS = BigInt(1e+6)

let playbackMode = false
let playbackStart
let playbackFrom

let speakingMode = false
let utter = new SpeechSynthesisUtterance()

const startPlaying = () => {
  playbackMode = true
  playbackStart = process.hrtime.bigint()
  playbackFrom = boardData.boards[currentBoard].time

  audioPlayback.start()
  audioPlayback.playBoard(currentBoard)

  playbackAdvance()

  if (transport) transport.setState({ playbackMode })
  ipcRenderer.send('preventSleep')
}

const stopPlaying = () => {
  // prevent unnecessary calls
  if (!playbackMode) return

  playbackMode = false

  audioPlayback.stop()

  utter.onend = null
  speechSynthesis.cancel()

  if (transport) transport.setState({ playbackMode })
  ipcRenderer.send('resumeSleep')
}

const playSpeech = () => {
  speechSynthesis.cancel()
  utter.pitch = 0.65
  utter.rate = 1.1

  var string = boardData.boards[currentBoard].dialogue.split(':')
  string = string[string.length - 1]

  utter.text = string
  speechSynthesis.speak(utter)
}

const togglePlayback = () =>
  playbackMode
    ? stopPlaying()
    : startPlaying()

const playbackAdvance = async () => {
  if (!playbackMode) return

  let now = process.hrtime.bigint()
  let d = playbackFrom + Number((now - playbackStart) / NANOSECONDS_TO_MSECS)

  let lastBoard = boardData.boards[boardData.boards.length - 1]
  if (d > lastBoard.time + boardModel.boardDurationWithAudio(boardData, lastBoard)) {
    // console.log('playbackAdvance: done!')
    stopPlaying()
    return
  }

  let boardNow
  for (let board of boardData.boards) {
    if (board.time > d) {
      break
    } else {
      boardNow = board
    }
  }
  if (boardData.boards[currentBoard] !== boardNow) {
    if (playbackMode && boardData.boards[currentBoard].dialogue && speakingMode) {
      playSpeech()
    }

    await gotoBoard(boardData.boards.indexOf(boardNow))
  }

  // console.log('playbackAdvance', boardNow.number)
  requestAnimationFrame(playbackAdvance)
}

//// VIEW

let cycleViewMode = async (direction = +1) => {
  if (scriptData) {
    viewMode = (viewMode + 6 + direction) % 6
    switch (viewMode) {
      case 0:
        document.querySelector('#scenes').style.display = 'block'
        document.querySelector('#script').style.display = 'block'
        document.querySelector('#board-metadata').style.display = 'flex'
        document.querySelector('#toolbar').style.display = 'flex'
        document.querySelector('#playback #icons').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 1:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'block'
        document.querySelector('#board-metadata').style.display = 'flex'
        document.querySelector('#toolbar').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 2:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'flex'
        document.querySelector('#toolbar').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 3:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 4:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'none'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 5:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'none'
        document.querySelector('#thumbnail-container').style.display = 'none'
        document.querySelector('#timeline').style.display = 'none'
        document.querySelector('#playback #icons').style.display = 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: false })
        }
        renderTimelineModeControlView({ show: false })
        break
    }
  } else {
    viewMode = (viewMode + 4 + direction) % 4
    switch (viewMode) {
      case 0:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'flex'
        document.querySelector('#toolbar').style.display = 'flex'
        document.querySelector('#playback #icons').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 1:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'flex'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 2:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'none'

        document.querySelector('#thumbnail-container').style.display = shouldRenderThumbnailDrawer ? 'block' : 'none'
        document.querySelector('#timeline').style.display = shouldRenderThumbnailDrawer ? 'flex' : 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: !shouldRenderThumbnailDrawer })
        }
        renderTimelineModeControlView({ show: true })
        break
      case 3:
        document.querySelector('#scenes').style.display = 'none'
        document.querySelector('#script').style.display = 'none'
        document.querySelector('#board-metadata').style.display = 'none'
        document.querySelector('#toolbar').style.display = 'none'
        document.querySelector('#playback #icons').style.display = 'none'

        document.querySelector('#thumbnail-container').style.display = 'none'
        document.querySelector('#timeline').style.display = 'none'
        if (sceneTimelineView) {
          await sceneTimelineView.update({ show: false })
        }
        renderTimelineModeControlView({ show: false })
        break
    }
  }
  // storyboarderSketchPane.resize()
  renderViewMode()
  renderStats()
}

const renderViewMode = () => {
  document.body.classList.toggle(
    'with-script-visible',
    document.querySelector('#script').style.display == 'block'
  )
  document.body.classList.toggle(
    'with-scenes-visible',
    document.querySelector('#scenes').style.display == 'block'
  )
}

const toggleTimeline = () => {
  shouldRenderThumbnailDrawer = !shouldRenderThumbnailDrawer
  // renderTimelineModeControlView({
  //   mode: shouldRenderThumbnailDrawer
  //     ? 'sequence'
  //     : 'time'
  // })
  renderThumbnailDrawer()
}

ipcRenderer.on('newBoard', (event, args)=>{
  // TODO fix doubling bug https://github.com/wonderunit/storyboarder/issues/1206
  if (!textInputMode) {
    if (args > 0) {
      // insert after
      newBoard().then(index => {
        gotoBoard(index)
        ipcRenderer.send('analyticsEvent', 'Board', 'new')
      }).catch(err => log.error(err))
    } else {
      // insert before
      newBoard(currentBoard).then(() => {
        gotoBoard(currentBoard)
        ipcRenderer.send('analyticsEvent', 'Board', 'new')
      }).catch(err => log.error(err))
    }
  }
  ipcRenderer.send('analyticsEvent', 'Board', 'new')
})

ipcRenderer.on('openInEditor', (event, args)=>{
  openInEditor()
})

ipcRenderer.on('togglePlayback', (event, args)=>{
  if (!textInputMode) {
    togglePlayback()
  }
})

ipcRenderer.on('goPreviousBoard', (event, args)=>{
  if (!textInputMode) {
    goNextBoard(-1)
  }
})

ipcRenderer.on('goNextBoard', (event, args)=>{
  if (!textInputMode) {
    goNextBoard()
  }
})

ipcRenderer.on('previousScene', (event, args)=>{
  previousScene()
})

ipcRenderer.on('nextScene', (event, args)=>{
  nextScene()
})

// tools

ipcRenderer.on('undo', (e, arg) => {
  if (!textInputMode && remote.getCurrentWindow().isFocused()) {
    if (storyboarderSketchPane.preventIfLocked()) return

    if (undoStack.getCanUndo()) {
      undoStack.undo()
      sfx.rollover()
    } else {
      sfx.error()
      notifications.notify({message: 'Nothing more to undo!', timing: 5})
    }
  } else {
    // find the focused window (which may be main-window)
    for (let w of remote.BrowserWindow.getAllWindows()) {
      if (w.isFocused()) {
        // log.info('undo on window', w.id)
        w.webContents.undo()
        return
      }
    }
  }
})

ipcRenderer.on('redo', (e, arg) => {
  if (!textInputMode && remote.getCurrentWindow().isFocused()) {
    if (storyboarderSketchPane.preventIfLocked()) return

    if (undoStack.getCanRedo()) {
      undoStack.redo()
      sfx.rollover()
    } else {
      sfx.error()
      notifications.notify({message: 'Nothing left to redo!', timing: 5})
    }
  } else {
    // find the focused window (which may be main-window)
    for (let w of remote.BrowserWindow.getAllWindows()) {
      if (w.isFocused()) {
        // log.info('redo on window', w.id)
        w.webContents.redo()
        return
      }
    }
  }
})

ipcRenderer.on('copy', event => {
  if (remote.getCurrentWindow().webContents.isDevToolsFocused()) {
    remote.getCurrentWindow().webContents.devToolsWebContents.executeJavaScript(
      `document.execCommand('copy')`
    )
    return
  }

  if (!textInputMode && remote.getCurrentWindow().isFocused()) {
    // log.info('copy boards')
    copyBoards()
      .then(() => notifications.notify({
        message: 'Copied board(s) to clipboard.', timing: 5
      }))
      .catch(err => {
        log.error(err)
      })
  } else {
    // find the focused window (which may be main-window)
    for (let w of remote.BrowserWindow.getAllWindows()) {
      if (w.isFocused()) {
        // log.info('copy to clipboard from window', w.id)
        w.webContents.copy()
        return
      }
    }
  }
})

ipcRenderer.on('paste', () => {
  if (remote.getCurrentWindow().webContents.isDevToolsFocused()) {
    remote.getCurrentWindow().webContents.devToolsWebContents.executeJavaScript(
      `document.execCommand('paste')`
    )
    return
  }

  if (!textInputMode && remote.getCurrentWindow().isFocused()) {
    // log.info('pasting boards')
    pasteBoards().catch(err => {
      log.error(err)
    })
  } else {
    // find the focused window (which may be main-window)
    for (let w of remote.BrowserWindow.getAllWindows()) {
      if (w.isFocused()) {
        // log.info('pasting clipboard to window', w.id)
        w.webContents.paste()
        return
      }
    }
  }
})

ipcRenderer.on('paste-replace', () => {
  notifications.notify({ message: `Pasting …` })
  pasteAndReplace()
    .then(() => {
      notifications.notify({ message: `Paste complete.` })
      sfx.positive()
    })
    .catch(err => {
      log.error(err)
      notifications.notify({ message: err.toString() })
      sfx.error()
    })
})

// Replace Reference Layer of Current Board with Image
// - Used when importing from mobile server
// - Used for File > Replace Reference Layer Image
const replaceReferenceLayerImage = async imageDataURL => {
  let board = boardData.boards[currentBoard]

  // resize image if too big
  let dim = [
    storyboarderSketchPane.sketchPane.width,
    storyboarderSketchPane.sketchPane.height
  ]
  const scaledImageData = await fitImageData(dim, imageDataURL)
  let image = await exporterCommon.getImage(scaledImageData)

  let layer = storyboarderSketchPane.sketchPane.layers.findByName('reference')

  // update the board data
  storeUndoStateForScene(true)
  layersEditor.setReferenceOpacity(1.0)
  board.layers = {
    ...board.layers,
    reference: {
      ...board.layers.reference,
      url: boardModel.boardFilenameForLayer(board, layer.name),
      opacity: 1.0 // alternatively: exporterCommon.DEFAULT_REFERENCE_LAYER_OPACITY
    }
  }
  storeUndoStateForScene()
  // mark new board data
  markBoardFileDirty()

  // update the image
  storeUndoStateForImage(true, [layer.index])
  layer.clear()
  layer.replace(image, false)
  storeUndoStateForImage(false, [layer.index])
  // mark new image
  markImageFileDirty([layer.index])

  // save the posterframe
  await savePosterFrame(board)

  // update the thumbnail
  let index = await saveThumbnailFile(boardData.boards.indexOf(board))
  await updateThumbnailDisplayFromFile(index)

  // renderThumbnailDrawer()

  notifications.notify({
    message: `Replaced reference layer image.`,
    timing: 10
  })
  sfx.positive()
}

/**
 * Copy
 *
 * Copies to the clipboard, as 'text', a JSON object containing
 * `boards` (an array of board objects), and
 * `layerDataByBoardIndex` with base64 image data inserted, e.g.:
 *
 * {
 *   boards: [
 *     {
 *       layers: { ... }
 *     }
 *   },
 *   layerDataByBoardIndex: [
 *     { reference: 'data:image/png;base64,...', ... }
 *   ]
 * }
 *
 * For a single board, it will also add a flattened bitmap
 * of all visible layers as an 'image' to the clipboard.
 *
 */

// TODO cancel token
let copyBoards = async () => {
  if (textInputMode) return // ignore copy command in text input mode

  try {
    // list the boards, using a copy of the selection indices set to determine order
    let boards = [...selections].sort(util.compareNumbers).map(n => boardData.boards[n])

    let multiple = boards.length > 1

    // save all current layers and data to disk
    await saveImageFile()

    // collect layers, by name, for each board
    let layerDataByBoardIndex = []
    for (let board of boards) {
      // all the layers, by name, for this board
      let layerData = {}

      for (let name of Object.keys(board.layers)) {
        let filepath = path.join(boardPath, 'images', board.layers[name].url)

        let img = await exporterCommon.getImage(filepath + '?' + cacheKey(filepath))
        if (img) {
          let canvas = document.createElement('canvas')
          let ctx = canvas.getContext('2d')
          canvas.height = img.naturalHeight
          canvas.width = img.naturalWidth
          ctx.drawImage(img, 0, 0)
          layerData[name] = canvas.toDataURL()
        } else {
          log.warn("could not load image for board", board.layers[layerName].url)
        }
      }

      layerDataByBoardIndex.push(layerData)
    }

    let image
    if (multiple) {
      // multiple doesn't include the image
      image = undefined
    } else {
      // a single flattened PNG image (for pasting to external apps)
      // NOTE assumes that, in the UI, single selection always === current board
      let pixels = storyboarderSketchPane.sketchPane.extractThumbnailPixels(
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height,
        storyboarderSketchPane.visibleLayersIndices
      )
      SketchPaneUtil.arrayPostDivide(pixels)
      image = nativeImage.createFromDataURL(
        SketchPaneUtil.pixelsToCanvas(
          pixels,
          storyboarderSketchPane.sketchPane.width,
          storyboarderSketchPane.sketchPane.height
        ).toDataURL())
    }

    let payload = {
      // if not multiple, we'll have an image for one board (the current board)
      image,
      // always include boards and layerDataByBoardIndex
      text: JSON.stringify({ boards, layerDataByBoardIndex }, null, 2)
    }
    clipboard.clear()
    clipboard.write(payload)
    log.info('Copied', boards.length, 'board(s) to clipboard')
    // notifications.notify({ message: "Copied" })
  } catch (err) {
    log.info('Error. Could not copy.')
    log.error(err)
    notifications.notify({ message: 'Error. Couldn’t copy.' })
    throw err
  }
}

const exportAnimatedGif = async () => {
  log.info('main-window#exportAnimatedGif', selections)
  if (selections.has(currentBoard)) {
    saveImageFile()
  }
  let boards
  if (selections.size === 1) {
    // single value
    boards = util.stringifyClone(boardData.boards)
  } else {
    // array of boards
    boards = [...selections].sort(util.compareNumbers).map(
      n => util.stringifyClone(boardData.boards[n])
    )
  }
  let boardSize = storyboarderSketchPane.getCanvasSize()

  notifications.notify({
    message: 'Exporting ' + boards.length + ' boards. Please wait...',
    timing: 5
  })

  sfx.down()

  try {
    let shouldWatermark = prefsModule.getPrefs().enableWatermark
    let watermarkSrc = watermarkModel.watermarkImagePath(prefsModule.getPrefs(), app.getPath('userData'))

    let exportPath = await exporter.exportAnimatedGif(boards, boardSize, 888, boardFilename, shouldWatermark, boardData, watermarkSrc)
    notifications.notify({
      message: 'I exported your board selection as a GIF. Share it with your friends! Post it to your twitter thing or your slack dingus.',
      timing: 20
    })
    sfx.positive()
    shell.showItemInFolder(exportPath)
  } catch (err) {
    log.error(err)
    notifications.notify({ message: 'Could not export. An error occurred.' })
    notifications.notify({ message: err.toString() })
  }
}


const exportFcp = () => {
  notifications.notify({message: "Exporting " + boardData.boards.length + " boards to FCP and Premiere. Please wait...", timing: 5})
  sfx.down()
  setTimeout(()=>{
    exporter.exportFcp(boardData, boardFilename).then(outputPath => {
      notifications.notify({message: "Your scene has been exported for Final Cut Pro X and Premiere.", timing: 20})
      sfx.positive()
      shell.showItemInFolder(outputPath)
    }).catch(err => {
      log.error(err)
      notifications.notify({ message: 'Could not export. An error occurred.' })
      notifications.notify({ message: err.toString() })
    })
  }, 1000)
}

const exportImages = () => {
  notifications.notify({message: "Exporting " + boardData.boards.length + " to a folder. Please wait...", timing: 5})
  sfx.down()
  setTimeout(()=>{
    exporter.exportImages(boardData, boardFilename)
    .then(outputPath => {
      notifications.notify({message: "Your scene has been exported as images.", timing: 20})
      sfx.positive()
      shell.showItemInFolder(outputPath)
    })
    .catch(err => {
      log.error(err)
      notifications.notify({ message: 'Could not export. An error occurred.' })
      notifications.notify({ message: err.toString() })
    })
  }, 1000)
}

const exportCleanup = () => {
  exporter.exportCleanup(boardData, boardFilename).then(newBoardData => {
    // notifications.notify({ message: "Your scene has been cleaned up!", timing: 20 })
    sfx.positive()

    let srcFilePath = scriptFilePath
      ? scriptFilePath // use the .fountain/.fdx file, if it is defined …
      : boardFilename // … otherwise, use the .storyboarder file

    // force reload of project or scene
    ipcRenderer.send('openFile', srcFilePath)
  }).catch(err => {
    log.info(err)
  })
}

const exportVideo = async () => {
  notifications.notify({ message: "Exporting " + boardData.boards.length + " boards to video. For long scenes this could take a few minutes. Please wait...", timing: 30 })

  let scene = boardData
  let sceneFilePath = boardFilename

  try {
    let outputFilePath = await exporter.exportVideo(
      scene,
      sceneFilePath,
      {
        shouldWatermark: prefsModule.getPrefs().enableWatermark,
        watermarkImagePath: watermarkModel.watermarkImagePath(prefsModule.getPrefs(), app.getPath('userData')),
        progressCallback: progress => {}
          // notifications.notify({message: `${Math.round(progress * 100)}% complete`, timing: 1})
      }
    )
    notifications.notify({message: "Your scene has been exported to video.", timing: 20})
    sfx.positive()
    shell.showItemInFolder(outputFilePath)
  } catch (err) {
    log.error(err)
    notifications.notify({ message: 'Could not export. An error occurred.' })
    notifications.notify({ message: err.toString() })
  }
}

let save = () => {
  saveImageFile()
  saveBoardFile({ force: true })
  sfx.positive()

  if (prefsModule.getPrefs()['enableAutoSave']) {
    notifications.notify({message: "Saving is automatic. I already saved before you pressed this, so you don't really need to save at all. \n\nBut I did want you to know, that I think you're special - and I like you just the way you are.\n\nHere's a story tip..." , timing: 15})
    setTimeout(()=>{storyTips.show()}, 1000)
  } else {
    notifications.notify({ message: "Saved." })
  }
}


/**
 * Paste
 *
 * Creates  a) from `text`, one or more new boards
 *               with board objects from the clipboard JSON
 *               and board layer images from the base64 clipboard JSON
 *          b) from `image`, one new board
 *               with clipboard image data inserted as reference layer
 *
 */
let pasteBoards = async () => {
  if (textInputMode) return

  // save the current image to disk
  await saveImageFile()

  let pasted

  // is paste a valid object from Storyboarder?
  let text = clipboard.readText()
  if (text !== "") {
    try {
      pasted = JSON.parse(clipboard.readText())
      if (!pasted.boards.length || pasted.boards.length < 1) throw new Error('no boards')
      if (!pasted.layerDataByBoardIndex.length || pasted.layerDataByBoardIndex.length < 1) throw new Error('no layer data')
    } catch (err) {
      log.info('could not parse clipboard as text')
      log.info(err)
    }
  }

  // paste is probably from an external source
  if (!pasted) {
    // can we at least grab the image?
    let image = clipboard.readImage()
    if (!image.isEmpty()) {
      pasted = {
        boards: [
          // HACK trigger to construct a minimum board
          {
            layers: {
              reference: {
                url: null
              }
            }
          }
        ],
        layerDataByBoardIndex: [
          {
            reference: image.toDataURL()
          }
        ]
      }
    } else {
      log.info('could not read clipboard image')
    }
  }

  if (pasted && pasted.boards && pasted.boards.length) {
    if (pasted.boards.length > 1) {
      notifications.notify({ message: "Pasting " + pasted.boards.length + " boards.", timing: 5 })
    } else {
      notifications.notify({ message: "Pasting a board.", timing: 5 })
    }

    let selectionsAsArray = [...selections].sort(util.compareNumbers)

    // insert after the right-most current selection
    let insertAt = selectionsAsArray[selectionsAsArray.length - 1]

    insertAt = insertAt + 1 // actual splice point

    // old boards is a copy
    let oldBoards = util.stringifyClone(pasted.boards)

    // new boards is a copy, but migrated
    let newBoards = migrateBoards(util.stringifyClone(pasted.boards), insertAt)

    log.info('pasting boards from', oldBoards, 'to', newBoards)

    // insert boards from clipboard data
    try {
      // store the "before" state
      storeUndoStateForScene(true)

      // copy linked boards
      newBoards.forEach((dst, n) => {
        let src = oldBoards[n]

        // NOTE: audio is not copied

        if (src.link) {
          // TODO is link being migrated properly?
          // see: https://github.com/wonderunit/storyboarder/issues/1165
          let from  = path.join(boardPath, 'images', src.link)
          let to    = path.join(boardPath, 'images', boardModel.boardFilenameForLink(dst))

          if (fs.existsSync(from)) {
            log.info('copying linked PSD', from, 'to', to)
            fs.writeFileSync(to, fs.readFileSync(from))
          } else {
            notifications.notify({
              message: `[WARNING]. Could not copy linked file ${src.link}`,
              timing: 8
            })
          }

        }
      })

      await insertBoards(
        boardData.boards,
        insertAt,
        newBoards,
        {
          layerDataByBoardIndex: pasted.layerDataByBoardIndex
        }
      )

      markBoardFileDirty()
      storeUndoStateForScene()

      renderThumbnailDrawer()

      log.info('paste complete')
      notifications.notify({ message: `Paste complete.` })
      sfx.positive()
      await gotoBoard(insertAt)

    } catch (err) {
      log.error(err)
      log.info(err.stack)
      log.info(new Error().stack)
      notifications.notify({ message: `Whoops. Could not paste boards. ${err.message}`, timing: 8 })
      throw err
    }
  } else {
    notifications.notify({ message: "There's nothing in the clipboard that I can paste. Are you sure you copied it right?", timing: 8 })
    sfx.error()
    throw new Error('empty clipboard')
  }
}

// paste to current board
const pasteAndReplace = async () => {
  if (textInputMode) return

  let board = boardData.boards[currentBoard]

  // save the current image to disk
  await saveImageFile()

  let pasted

  // is paste a valid object from Storyboarder?
  let text = clipboard.readText()
  if (text !== '') {
    try {
      pasted = JSON.parse(clipboard.readText())
      if (!pasted.boards.length || pasted.boards.length < 1) throw new Error('no boards')
      if (!pasted.layerDataByBoardIndex.length || pasted.layerDataByBoardIndex.length < 1) throw new Error('no layer data')
    } catch (err) {
      log.info('could not read clipboard data')
      log.info(err)
    }
  }

  // paste is probably from an external source
  if (!pasted) {
    // can we at least grab the image?
    let image = clipboard.readImage()
    if (!image.isEmpty()) {
      pasted = {
        boards: [
          // HACK trigger to construct a minimum board
          {
            layers: {
              reference: {
                url: null
              }
            }
          }
        ],
        layerDataByBoardIndex: [
          {
            reference: image.toDataURL()
          }
        ]
      }
    } else {
      log.info('could not read clipboard image')
    }
  }

  if (pasted && pasted.boards && pasted.boards.length) {
    if (pasted.boards.length > 1) {
      throw new Error("Can't paste. Expected one image, but found multiple.")
    }

    try {
      // store the "before" state
      storeUndoStateForScene(true)
      storeUndoStateForImage(true, storyboarderSketchPane.visibleLayersIndices)

      // NOTE: audio is not copied
      // NOTE: linked PSD is not copied

      let imageData = pasted.layerDataByBoardIndex[0]

      // scale layer images and write to layers
      let size = [
        storyboarderSketchPane.sketchPane.width,
        storyboarderSketchPane.sketchPane.height
      ]

      board.layers = {}

      // for every named layer
      for (let index of storyboarderSketchPane.visibleLayersIndices) {
        let layer = storyboarderSketchPane.sketchPane.layers[index]
        if (imageData[layer.name]) {
          let image = await exporterCommon.getImage(imageData[layer.name])
          // paste the layer

          // if ratio matches,
          // don't bother drawing,
          // just return original image data
          if (
            image.width === size[0] &&
            image.height === size[1]
          ) {
            // full size
            // log.info('\tpasting full size', layer.name)
            storyboarderSketchPane.sketchPane.replaceLayer(index, image)
            markImageFileDirty([index])
          } else {
            // resized
            // log.info('\tpasting resized', layer.name)
            let context = createSizedContext(size)
            let canvas = context.canvas
            context.drawImage(image, ...util.fitToDst(canvas, image).map(Math.round))
            storyboarderSketchPane.sketchPane.replaceLayer(index, canvas)
            markImageFileDirty([index])
          }
        } else {
          // clear the layer
          // log.info('\tclearing', layer.name)
          storyboarderSketchPane.clearLayer(index)
        }
      }

      storeUndoStateForScene()
      storeUndoStateForImage(false, storyboarderSketchPane.visibleLayersIndices)

      markBoardFileDirty()
      renderThumbnailDrawer()

      log.info('paste complete')
    } catch (err) {
      log.error(err)
      log.info(err.stack)
      log.info(new Error().stack)
      throw new Error(`Whoops. Could not paste image. ${err.message}`)
    }
  } else {
    throw new Error("There's nothing in the clipboard that I can paste. Are you sure you copied it correctly?")
  }
}

const insertBoards = async (dest, insertAt, boards, { layerDataByBoardIndex }) => {
  let size = [
    storyboarderSketchPane.sketchPane.width,
    storyboarderSketchPane.sketchPane.height
  ]

  for (let index = 0; index < boards.length; index++) {
    let board = boards[index]

    // for each board
    let position = insertAt + index
    let imageData = layerDataByBoardIndex[index]

    // scale layer images and save to files
    if (imageData) {
      for (let [name, image] of Object.entries(imageData)) {
        // if this is a valid layer
        if (storyboarderSketchPane.sketchPane.layers.findByName(name)) {
          // scale the image
          let scaledImageData = await fitImageData(size, image)
          // save it to a file
          saveDataURLtoFile(scaledImageData, board.layers[name].url)
        }
      }
    }

    // add to the data
    dest.splice(position, 0, board)

    // save the posterframe
    // either from SketchPane in memory, or from the filesystem
    await savePosterFrame(board, position !== currentBoard)

    // update the thumbnail
    await saveThumbnailFile(position, { forceReadFromFiles: true })
  }
}

const fitImageData = async (boardSize, imageData) => {
  let image = await exporterCommon.getImage(imageData)

  // if ratio matches,
  // don't bother drawing,
  // just return original image data
  if (
    image.width === boardSize[0] &&
    image.height === boardSize[1]
  ) {
    return imageData
  } else {
    let context = createSizedContext(boardSize)
    let canvas = context.canvas
    context.drawImage(image, ...util.fitToDst(canvas, image).map(Math.round))
    return canvas.toDataURL()
  }
}

const importFromWorksheet = async (imageArray) => {
  let insertAt = 0 // pos
  let boards = []

  // related: insertNewBoardDataAtPosition, migrateBoards
  for (let i = 0; i < imageArray.length; i++) {
    let board = {}
    let uid = util.uidGen(5)
    board.uid = uid
    board.url = 'board-' + (insertAt + i) + '-' + board.uid + '.png'
    board.layers = {
      reference: {
        url: board.url.replace('.png', '-reference.png')
      }
    }
    board.newShot = false
    board.lastEdited = Date.now()

    boards.push(board)
  }

  let layerDataByBoardIndex = []
  for (let i = 0; i < imageArray.length; i++) {
    let layerData = {}
    layerDataByBoardIndex.push({
      reference: imageArray[i]
    })
  }

  //
  //
  // insert boards from worksheet data
  //
  try {
    notifications.notify({ message: 'Worksheet Import starting …', timing: 5 })

    // store the "before" state
    storeUndoStateForScene(true)

    // save the current layers to disk
    await saveImageFile()
    await insertBoards(boardData.boards, insertAt, boards, { layerDataByBoardIndex })

    markBoardFileDirty()
    storeUndoStateForScene()
    renderThumbnailDrawer()

    sfx.positive()
    notifications.notify({ message: 'Worksheet Import complete.', timing: 5 })
    return gotoBoard(insertAt)
  } catch (err) {
    notifications.notify({ message: 'Whoops. Could not import.', timing: 8 })
    log.info(err)
  }
}

const migrateBoards = (oldBoards, insertAt = 0) => {
  let newBoards = []

  // assign a new uid to the board, regardless of source
  newBoards = oldBoards.map(boardModel.assignUid)

  // set some basic data for the new board
  newBoards = newBoards.map(boardModel.setup)

  // update board layers filenames based on index
  newBoards = newBoards.map((board, index) =>
    boardModel.updateUrlsFromIndex(board, insertAt + index))

  // update link
  newBoards = newBoards.map((board, index) => {
    if (board.link) {
      board.link = boardModel.boardFilenameForLink(board)
    }
    return board
  })

  return newBoards
}

let moveSelectedBoards = position => {
  let didChange = false

  // log.info('moveSelectedBoards position:', position)

  let numRemoved = selections.size
  let firstSelection = [...selections].sort(util.compareNumbers)[0]

  // if moving forward in the list
  // account for position change due to removed elements
  if (position > firstSelection) {
    position = position - numRemoved
  }

  // log.info('move starting at board', firstSelection,
  //             ', moving', numRemoved,
  //             'boards to index', position)

  if (firstSelection !== position) {
    didChange = true

    storeUndoStateForScene(true)

    let movedBoards = boardData.boards.splice(firstSelection, numRemoved)
    boardData.boards.splice(position, 0, ...movedBoards)

    // how far from the start of the selection was the current board?
    let offset = currentBoard - firstSelection

    // what are the new bounds of our selection?
    let b = Math.min(position + movedBoards.length - 1, boardData.boards.length - 1)
    let a = b - (selections.size - 1)
    // update selection
    selections = new Set(util.range(a, b))
    // update currentBoard
    currentBoard = a + offset

    markBoardFileDirty()
    storeUndoStateForScene()
  }

  return didChange
}

let reorderBoardsLeft = () => {
  let selectionsAsArray = [...selections].sort(util.compareNumbers)
  let leftMost = selectionsAsArray[0]
  let position = leftMost - 1
  if (position >= 0) {
    saveImageFile()
    moveSelectedBoards(position)
    renderThumbnailDrawer()
    gotoBoard(currentBoard, true)
    sfx.playEffect('on')
    notifications.notify({message: 'Reordered to the left!', timing: 5})
  }
}

let reorderBoardsRight = () => {
  let selectionsAsArray = [...selections].sort(util.compareNumbers)
  let rightMost = selectionsAsArray.slice(-1)[0] + 1
  let position = rightMost + 1
  if (position <= boardData.boards.length) {
    saveImageFile()
    moveSelectedBoards(position)
    renderThumbnailDrawer()
    gotoBoard(currentBoard, true)
    sfx.playEffect('metal')
    notifications.notify({message: 'Reordered to the right!', timing: 5})
  }
}

let enableEditMode = () => {
  if (!isEditMode() && selections.size) {
    editModeState = true
    thumbnailCursor.visible = true
    renderThumbnailCursor()
    renderThumbnailDrawerSelections()
    contextMenu.remove()
    sfx.positive()
    sfx.playEffect('on')

  }
}

let disableEditMode = () => {
  if (isEditMode()) {
    sfx.playEffect('metal')
    sfx.negative()
    editModeState = false
    thumbnailCursor.visible = false
    gridView.gridViewCursor.visible = false
    gridView.IsEditMode = false
    renderThumbnailCursor()
    isGridViewMode && gridView.renderGridViewCursor()
    renderThumbnailDrawerSelections()
  }
}

let thumbnailFromPoint = (x, y, offset) => {
  if (!offset) { offset = 0 }
  let el = document.elementFromPoint(x-offset, y)
  if (!el || !el.classList.contains('thumbnail')) return null

  // if part of a multi-selection, base from right-most element
  if (selections.has(Number(el.dataset.thumbnail))) {
    // base from the right-most thumbnail in the selection
    let rightMost = Math.max(...selections)
    let rightMostEl = document.querySelector('#thumbnail-drawer div[data-thumbnail="' + rightMost + '"]')
    el = rightMostEl
  }

  return el
}

let isBeforeFirstThumbnail = (x, y) => {
  // HACK are we near the far left edge, before any thumbnails?

  // HACK account for left sidebar by measuring thumbnail-container
  let thumbnailContainer = document.getElementById('thumbnail-container')
  let sidebarOffsetX = -thumbnailContainer.getBoundingClientRect().left

  let gapWidth = Math.floor(20 * boardData.aspectRatio)

  if (x + sidebarOffsetX <= gapWidth) {
    // have we scrolled all the way to the left already?
    let containerScrollLeft = thumbnailContainer.scrollLeft
    if (containerScrollLeft == 0) {
      return true
    }
  }
  return false
}

let updateThumbnailCursor = (x, y) => {
  // let shouldRenderThumbnailDrawer = false
  if (!shouldRenderThumbnailDrawer) return

  if (isBeforeFirstThumbnail(x, y)) {
    thumbnailCursor.x = 0
    thumbnailCursor.el = null
    return
  }

  let el = thumbnailFromPoint(x, y)
  let offset = 0
  if (el) {
    offset = el.getBoundingClientRect().width
    el = thumbnailFromPoint(x, y, offset/2)
  }

  if (el) thumbnailCursor.el = el // only update if found
  if (!el) return

  // store a reference to the nearest thumbnail
  thumbnailCursor.el = el

  // HACK account for left sidebar by measuring thumbnail-container
  let sidebarOffsetX = -el.offsetParent.offsetParent.getBoundingClientRect().left

  // HACK two levels deep of offset scrollLeft
  let scrollOffsetX = el.offsetParent.scrollLeft +
                      el.offsetParent.offsetParent.scrollLeft

  let elementOffsetX = el.getBoundingClientRect().right

  // is this an end shot?
  if (el.classList.contains('endShot')) {
    elementOffsetX += 5
  }

  let arrowOffsetX = -8

  thumbnailCursor.x = sidebarOffsetX +
                      scrollOffsetX +
                      elementOffsetX +
                      arrowOffsetX
}

let renderThumbnailCursor = () => {
  let el = document.querySelector('#thumbnail-cursor')
  if (el) { // shouldRenderThumbnailDrawer
    if (thumbnailCursor.visible) {
      el.style.display = ''
      el.style.left = thumbnailCursor.x + 'px'
    } else {
      el.style.display = 'none'
      el.style.left = '0px'
    }
  }
}

const welcomeMessage = () => {
  let message = []
  let otherMessages
  let hour = new Date().getHours()
  if (hour < 12) {
    message.push('Good morning!')
    otherMessages = [
      "It's time for a healthy breakfast!",
      "It's beautiful out today – At least where I am.",
      "You look great today.",
      "",
      ""
    ]
    message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  } else if (hour > 12 && hour <= 17) {
    message.push('Good afternoon!')
    otherMessages = [
      "If you do a great job, I'll let you have an afternoon snack! Don't tell your mom.",
      "",
      "Almost quittin' time AMIRITE?",
      "I'm still hungry. You?",
      "Should we take a walk later?",
    ]
    message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  } else if (hour > 17) {
    message.push('Good evening!')
    otherMessages = [
      "When it gets dark out is when I do my best work.",
      "Hey. I was just about to leave.",
      "",
    ]
    message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  } else if (hour == 12) {
    message.push('Lunch time!')
    otherMessages = [
      "Wait, you're working at lunchtime? Your boss sounds like a real jerk.",
      "Did you even eat yet?",
      "Yeah! Let's work together!",
    ]
    message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  }
  otherMessages = [
    "It's time to board!",
    "Let's tell some great stories!",
    "I love storyboarding! Let's make something great together!",
    "If you like Storyboarder, maybe like tell your friends on Twitter.",
  ]
  message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  otherMessages = [
    "Here's a quote I totally did not just download from the internet:",
    "I think you're the best.",
    "If you have ideas for Storyboarder, let us know! We'd love to hear from you.",
    "",
  ]
  message.push(otherMessages[Math.floor(Math.random()*otherMessages.length)])
  notifications.notify({message: message.join(' '), timing: 10})
}

const setupRandomizedNotifications = () => {
  let defaultMessages = util.shuffle(NotificationData.messages)
  //setTimeout(()=>{welcomeMessage()}, 1000)
  setTimeout(()=>{runRandomizedNotifications(defaultMessages)}, 3000)
}

const runRandomizedNotifications = (messages) => {
  let count = 0, duration = 60 * 60 * 1000, timeout
  const tick = () => {
    // only fire notification if enabled in preferences
    if (prefsModule.getPrefs('aspirational')['enableAspirationalMessages']) {
      notifications.notify(messages[count++ % messages.length])
    }
    timeout = setTimeout(tick, duration)
  }
  tick()
}

const getSceneNumberBySceneId = (sceneId) => {
  if (!scriptData) return null
  let orderedScenes = scriptData.filter(data => data.type === 'scene')
  return orderedScenes.findIndex(scene => scene.scene_id === sceneId)
}

// returns the scene object (if available) or null
const getSceneObjectByIndex = (index) =>
  scriptData && scriptData.find(data => data.type === 'scene' && data.scene_number === index + 1)

const storeUndoStateForScene = (isBefore) => {
  let scene = getSceneObjectByIndex(currentScene)
  // sceneId is allowed to be null (for a single storyboard with no script)
  let sceneId = scene && scene.scene_id
  undoStack.addSceneData(isBefore, { sceneId: sceneId, boardData: util.stringifyClone(boardData) })
}
const applyUndoStateForScene = async (state) => {
  await saveImageFile() // needed for redo
  if (state.type !== 'scene') return // only `scene`s for now

  let currSceneObj = getSceneObjectByIndex(currentScene)
  if (currSceneObj && currSceneObj.scene_id !== state.sceneId) {
    // go to that scene
    saveBoardFile()
    currentScene = getSceneNumberBySceneId(state.sceneId)
    await loadScene(currentScene)
    // migrateScene() // not required here
    await verifyScene()
    renderScript()
  }
  boardData = state.sceneData
  markBoardFileDirty()
  renderScene()
}

const storeUndoStateForImage = (isBefore, layerIndices = null) => {
  let scene = getSceneObjectByIndex(currentScene)
  let sceneId = scene && scene.scene_id

  if (!layerIndices) layerIndices = [storyboarderSketchPane.sketchPane.getCurrentLayerIndex()]

  let layers = layerIndices.map(index => {
    return {
      index,
      source: storyboarderSketchPane.getUndoStateForLayer(index)
    }
  })

  undoStack.addImageData(isBefore, {
    type: 'image',
    sceneId,
    boardIndex: currentBoard,
    layers
  })
}

const applyUndoStateForImage = async (state) => {
  // if required, go to the scene first
  let currSceneObj = getSceneObjectByIndex(currentScene)
  if (currSceneObj && currSceneObj.scene_id !== state.sceneId) {
    await saveImageFile()
    // go to the requested scene
    currentScene = getSceneNumberBySceneId(state.sceneId)
    await loadScene(currentScene)
    // migrateScene() // not required here
    await verifyScene()
    renderScript()
  }

  // if required, go to the board first
  if (currentBoard !== state.boardIndex) {
    await saveImageFile()
    await gotoBoard(state.boardIndex)
  }

  // uncomment to force save on undo/redo
  // await saveImageFile()

  for (let layerData of state.layers) {
    storyboarderSketchPane.applyUndoStateForLayer(layerData)
    markImageFileDirty([layerData.index])
  }

  // uncomment to force save on undo/redo
  // let index = await saveThumbnailFile(state.boardIndex)
  // await updateThumbnailDisplayFromFile(index)
}

const createSizedContext = size => {
  let canvas = document.createElement('canvas')
  let context = canvas.getContext('2d')
  canvas.width = size[0]
  canvas.height = size[1]
  return context
}

const fillContext = (context, fillStyle = 'white') => {
  context.fillStyle = fillStyle
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
}

const saveAsFolder = async () => {
  let srcFilePath = scriptFilePath
    ? scriptFilePath // use the .fountain/.fdx file, if it is defined …
    : boardFilename // … otherwise, use the .storyboarder file

  // ensure the current board and data is saved
  await saveImageFile()
  saveBoardFile()

  // display the file selection window
  let { canceled, filePath: dstFolderPath } = await remote.dialog.showSaveDialog(null, {
    defaultPath: app.getPath('documents')
  })

  // user cancelled
  if (canceled) {
    return
  }

  // TODO could sanitize filename?
  //      e.g.: https://github.com/parshap/node-sanitize-filename

  // cancel if no value
  if (!dstFolderPath.length || dstFolderPath === '' || dstFolderPath === ' ') {
    remote.dialog.showMessageBox({ message: 'Please choose a valid folder name' })
    saveAsFolder() // loop
    return
  }

  // cancel if filename has an extension
  if (path.extname(dstFolderPath).length) {
    remote.dialog.showMessageBox({ message: 'Please choose a valid folder name (not a file name)' })
    saveAsFolder() // loop
    return
  }

  notifications.notify({ message: `Saving to “${path.basename(dstFolderPath)}” …`})

  try {
    // log.info('Copying to', dstFolderPath)

    // NOTE THIS OVERWRITES EXISTING FILES IN THE SELECTED FOLDER
    //
    // delete existing contents of the folder (if any)
    // and ensure the folder exists
    //
    fs.emptyDirSync(dstFolderPath)

    // copy the project files to the new location
    let { missing } = exporterCopyProject.copyProject(srcFilePath, dstFolderPath, { ignoreMissing: true })

    if (missing.length) {
      let listing = missing.join('\n')
      log.warn('Missing Files', listing)
      remote.dialog.showMessageBox({
        type: 'warning',
        message: `[WARNING] Some expected files are missing from the project:\n\n${listing}`
      })
    }

    ipcRenderer.send('analyticsEvent', 'Board', 'save-as')

    let dstFilePath = path.join(dstFolderPath, path.basename(dstFolderPath) + path.extname(srcFilePath))

    notifications.notify({ message: `Done! Reloading …`})

    // reload the project
    ipcRenderer.send('openFile', dstFilePath)
  } catch (error) {
    log.error(error)
    remote.dialog.showMessageBox({
      type: 'error',
      message: error.message
    })
    notifications.notify({ message: `"Save As" failed.`})
  }
}

const exportWeb = async () => {
  if (!prefsModule.getPrefs().auth) {
    showSignInWindow()
  } else {
    await startWebUpload()
  }
}
const showSignInWindow = () => {
  if (exportWebWindow) {
    exportWebWindow.destroy()
  }

  textInputMode = true
  textInputAllowAdvance = false

  exportWebWindow = new remote.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    backgroundColor: '#333333',
    show: false,
    center: true,
    parent: remote.getCurrentWindow(),
    resizable: true,
    frame: false,
    modal: true,
    webPreferences: {
      webgl: true,
      experimentalFeatures: true,
      experimentalCanvasFeatures: true,
      devTools: true,
      plugins: true,
      nodeIntegration: true,
      enableRemoteModule: true
    }
  })
  exportWebWindow.loadURL(`file://${__dirname}/../../upload.html`)
  exportWebWindow.once('ready-to-show', () => {
    exportWebWindow.show()
  })
  exportWebWindow.on('hide', () => {
    ipcRenderer.send('textInputMode', false)
  })
}
ipcRenderer.on('signInSuccess', (event, response) => {
  notifications.notify({ message: 'Success! You’re Signed In!' })

  prefsModule.set('auth', { token: response.token })

  exportWeb()
})
const startWebUpload = async () => {
  // ensure the current board and data is saved
  await saveImageFile()
  saveBoardFile()

  notifications.notify({ message: 'Uploading to Storyboarders.com. This might take a while …' })

  // let the notification appear
  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    let result = await exporterWeb.uploadToWeb(boardFilename)
    notifications.notify({ message: 'Upload complete!' })
    log.info('Uploaded to', result.link)
    remote.shell.openExternal(result.link)
  } catch (err) {
    if (err.name === 'StatusCodeError' && err.statusCode === 403) {
      notifications.notify({ message: 'Oops! Your credentials are invalid or have expired. Please try signing in again to upload.' })
      prefsModule.set('auth', undefined)
      showSignInWindow()
    } else {
      log.error(err)
      notifications.notify({ message: 'Whoops! An error occurred while attempting to upload.' })
    }
  }
}

const exportZIP = async () => {
  let srcFilePath = scriptFilePath
    ? scriptFilePath // use the .fountain/.fdx file, if it is defined …
    : boardFilename // … otherwise, use the .storyboarder file

  // ensure the current board and data is saved
  await saveImageFile()
  saveBoardFile()

  log.info('Exporting ZIP file')
  notifications.notify({ message: `Exporting ZIP file …` })

  let basename = path.basename(srcFilePath, path.extname(srcFilePath))
  let timestamp = moment().format('YYYY-MM-DD hh.mm.ss')
  let exportFilePath = path.join(boardPath, 'exports', `${basename}-${timestamp}.zip`)

  try {
    const { missing } = await exporterArchive.exportAsZIP(srcFilePath, exportFilePath)

    if (missing.length) {
      let listing = missing.join('\n')
      log.warn('Missing Files', listing)
      notifications.notify({
        message: `[WARNING] Some expected files are missing from the project and could not be added to the ZIP:\n\n${listing}`
      })
    }

    notifications.notify({ message: `Done.` })
    shell.showItemInFolder(exportFilePath)
  } catch (err) {
    log.error(err)
    notifications.notify({ message: `[ERROR] ${err.message}` })
    notifications.notify({ message: `Failed.` })
  }
}

const reloadScript = async (args) => { // [scriptData, locations, characters]
  scriptData = args[0]
  locations = args[1]
  characters = args[2]

  await updateSceneFromScript()

  // goto the board and render the drawer
  renderScene()

  notifications.notify({ message: 'Script has changed. Reloaded.'})
}

const updateSceneFromScript = async () => {
  currentScene = boardSettings.lastScene
  await loadScene(currentScene)

  assignColors()
  document.querySelector('#scenes').style.display = 'block'
  document.querySelector('#script').style.display = 'block'
  renderScenes()
  renderScript()
}

const setSketchPaneVisibility = (isVisible) => {
  let storyboarderSketchPane = document.querySelector("#storyboarder-sketch-pane")
  let gridViewElement = document.querySelector('.grid-view')
  let container = storyboarderSketchPane.getElementsByClassName("container")[0]
  if(isVisible) {
    isGridViewMode = false
    container.style["position"] = "relative"
    container.style["left"] = "0px"
    gridViewElement.style["position"] = "absolute"
    gridViewElement.style["left"] = "-99999px"
    gridView.cleanUpGridView()
    // NOTE(): A hackish way to update sketchpane
    gotoBoard(getCurrentBoard())
  } else {
    isGridViewMode = true
    container.style["position"] = "absolute"
    container.style["left"] = "-99999px"
    gridViewElement.style["position"] = "relative"
    gridViewElement.style["left"] = "0px"
  }
}

//#region Grid view

const gridDrag = (e)=>{
  if (e.pointerType == 'pen' || e.pointerType == 'mouse') {
    dragTarget = document.querySelector('.grid-view')
    dragTarget.style.overflow = 'hidden'
    dragTarget.style.scrollBehavior = 'unset'
    dragMode = true
    dragPoint = [e.pageX, e.pageY]
    scrollPoint = [dragTarget.scrollLeft, dragTarget.scrollTop]
    periodicDragUpdate()
  }
}

// TODO(): Find a better way to switch modes
let isGridViewMode = false
//#endregion
const TimelineModeControlView = ({ mode = 'sequence', show = false }) => {
  let style = { display: show ? 'flex' : 'none' }

  useEffect(() => {
    setSketchPaneVisibility(true)
  }, [])

  const onBoardsSelect = () => {
    shouldRenderThumbnailDrawer = false
    setSketchPaneVisibility(true)
    renderThumbnailDrawer()
  }
  const onTimelineSelect = () => {
    shouldRenderThumbnailDrawer = true
    setSketchPaneVisibility(true)
    renderThumbnailDrawer()
  }
  const onGridViewSelect = () => {
    shouldRenderThumbnailDrawer = true
    setSketchPaneVisibility(false)
    renderThumbnailDrawer()
    gridView.renderGridView()
    gotoBoard(getCurrentBoard())
  }

  return h(
    ['div', { className: 'btn-group', style },
      ['div.btn', {
        className: mode === 'sequence' ? 'selected' : null,
        onPointerUp: onTimelineSelect
      },
        ['svg', { className: 'icon' },
          ['use', { xlinkHref: './img/symbol-defs.svg#timeline-boards' }]
        ],
        ['span', 'Boards']
      ],
      ['div.spacer'],
      ['div.btn', {
        className: mode === 'time' ? 'selected' : null,
        onPointerUp: onBoardsSelect
      },
        ['svg', { className: 'icon' },
          ['use', { xlinkHref: './img/symbol-defs.svg#timeline-timeline' }]
        ],
        ['span', 'Timeline']
      ],
      ['div.spacer'],
      ['div.btn', {
        className: mode === 'grid-view' ? 'selected' : null,
        onPointerUp: onGridViewSelect
      },
        ['svg', { className: 'icon' },
          ['use', { xlinkHref: './img/symbol-defs.svg#timeline-timeline' }]
        ],
        ['span', 'Grid View']
      ]
    ]
  )
}
const renderTimelineModeControlView = ({ show = false }) => {
  let mode = !shouldRenderThumbnailDrawer ? 'time' : isGridViewMode ? 'grid-view' : 'sequence' 
  ReactDOM.render(
    h([TimelineModeControlView, { mode, show }]),
    document.getElementById('timeline-mode-control-view')
  )
}

ipcRenderer.on('setTool', (e, toolName) => {
  if (!textInputMode && !storyboarderSketchPane.getIsDrawingOrStabilizing()) {
    store.dispatch({ type: 'TOOLBAR_TOOL_CHANGE', payload: toolName, meta: { scope: 'local' } })
  }
})

ipcRenderer.on('useColor', (e, arg) => {
  if (!textInputMode) {
    // set the color of the current tool to be the given palette index
    const state = store.getState()
    const color = state.toolbar.tools[state.toolbar.activeTool].palette[arg - 1]
    store.dispatch({ type: 'TOOLBAR_TOOL_SET', payload: { color } })
    colorPicker.setState({ color: Color(color).toCSS() })
    sfx.playEffect('metal')
  }
})


ipcRenderer.on('clear', (e, arg) => {
  if (!textInputMode) {
    clearLayers(arg)
    ipcRenderer.send('analyticsEvent', 'Board', 'clear')
  }
})

ipcRenderer.on('brushSize', (e, direction) => {
  if (!textInputMode) {
    if (direction > 0) {
      store.dispatch({ type: 'TOOLBAR_BRUSH_SIZE_INC' })
      // store.dispatch({ type: 'PLAY_SOUND', payload: 'brush-size-up' }) // TODO
      sfx.playEffect('brush-size-up')
    } else {
      store.dispatch({ type: 'TOOLBAR_BRUSH_SIZE_DEC' })
      // store.dispatch({ type: 'PLAY_SOUND', payload: 'brush-size-down' }) // TODO
      sfx.playEffect('brush-size-down')
    }
  }
})

ipcRenderer.on('flipBoard', (e, arg)=> {
  if (storyboarderSketchPane.preventIfLocked()) return

  if (!textInputMode) {
    storyboarderSketchPane.flipLayers(arg)
    sfx.playEffect('metal')
    notifications.notify({message: 'I flipped the board.', timing: 5})
  }
})

ipcRenderer.on('deleteBoards', (event, args)=>{
  if (!textInputMode) {
    let numDeleted = deleteBoards(args)
    if (numDeleted > 0) {
      let noun = `board${numDeleted > 1 ? 's' : ''}`
      notifications.notify({
        message: `Deleted ${numDeleted} ${noun}.`,
        timing: 5
      })
    }
  }
})

ipcRenderer.on('duplicateBoard', (event, args)=>{
  if (!textInputMode) {
    duplicateBoard()
      .then(index => {
        gotoBoard(index)
        ipcRenderer.send('analyticsEvent', 'Board', 'duplicate')
      })
      .catch(err => log.error(err))
  }
})

ipcRenderer.on('reorderBoardsLeft', (event, args)=>{
  if (!textInputMode) {
    reorderBoardsLeft()
  }
})

ipcRenderer.on('reorderBoardsRight', (event, args)=>{
  if (!textInputMode) {
    reorderBoardsRight()
  }
})

ipcRenderer.on('cycleViewMode', (event, args)=>{
  if (!textInputMode) {
    cycleViewMode(args)
  }
})

ipcRenderer.on('toggleCaptions', (event, args)=>{
  if (!textInputMode) {
    store.dispatch({ type: 'TOOLBAR_CAPTIONS_TOGGLE' })
    sfx.playEffect('metal')
  }
})

ipcRenderer.on('toggleTimeline', () => {
  if (!textInputMode) {
    toggleTimeline()
  }
})

ipcRenderer.on('textInputMode', (event, args)=>{
  textInputMode = args
  textInputAllowAdvance = false
})

// Import Images to New Boards…
ipcRenderer.on('insertNewBoardsWithFiles', (event, filepaths)=> {
  insertNewBoardsWithFiles(sortFilePaths(filepaths))
})
// Replace Reference Layer Image…
ipcRenderer.on('importImageAndReplace', (sender, filepaths) => {
  importImageAndReplace(filepaths[0])
})
// Import from Mobile Server
ipcRenderer.on('importImage', (event, fileData) => {
  importImageFromMobile(fileData)
})

ipcRenderer.on('toggleGuide', (event, arg) => {
  log.info('toggleGuide', arg)
  if (!textInputMode) {
    store.dispatch({ type: 'TOOLBAR_GUIDE_TOGGLE', payload: arg })
    // this.store.dispatch({ type: 'PLAY_SOUND', payload: 'metal' }) // TODO
    sfx.playEffect('metal')
  }
})

ipcRenderer.on('toggleOnionSkin', (event, arg) => {
  if (!textInputMode) {
    store.dispatch({ type: 'TOOLBAR_ONION_TOGGLE' })
    // this.store.dispatch({ type: 'PLAY_SOUND', payload: 'metal' }) // TODO
    sfx.playEffect('metal')
  }
})

ipcRenderer.on('toggleNewShot', (event, args) => {
  if (!textInputMode) {
    toggleNewShot()
  }
})

ipcRenderer.on('toggleSpeaking', (event, args) => {
  speakingMode = !speakingMode
})

ipcRenderer.on('showTip', (event, args) => {
  storyTips.show()
  ipcRenderer.send('analyticsEvent', 'Board', 'showTip')
})

ipcRenderer.on('exportAnimatedGif', (event, args) => {
  exportAnimatedGif()
  ipcRenderer.send('analyticsEvent', 'Board', 'exportAnimatedGif')
})

ipcRenderer.on('exportFcp', (event, args) => {
  exportFcp()
  ipcRenderer.send('analyticsEvent', 'Board', 'exportFcp')
})

ipcRenderer.on('exportImages', (event, args) => {
  exportImages()
  ipcRenderer.send('analyticsEvent', 'Board', 'exportImages')
})

ipcRenderer.on('exportCleanup', (event, args) => {
  exportCleanup()
  ipcRenderer.send('analyticsEvent', 'Board', 'exportCleanup')
})

ipcRenderer.on('exportVideo', (event, args) => {
  exportVideo()
  ipcRenderer.send('analyticsEvent', 'Board', 'exportVideo')
})

let importWindow
let printWindow = [null, null]
const WORKSHEETPW = 0
const PDFEXPORTPW = 1

ipcRenderer.on('exportPrintablePdf', (event, sourcePath, filename) => {
  let outputPath = path.join(
    exporterCommon.ensureExportsPathExists(boardFilename), filename + ' ' + moment().format('YYYY-MM-DD hh.mm.ss') + '.pdf'
  )

  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, fs.readFileSync(sourcePath))

    if (filename == 'Worksheet') {
      notifications.notify({message: "A Worksheet PDF has been exported.", timing: 20})
    } else {
      notifications.notify({message: "A Storyboard PDF has been exported.", timing: 20})
    }
    sfx.positive()
    shell.showItemInFolder(outputPath)

  } else {
    log.error('File exists')
    sfx.error()
    if (filename == 'Worksheet') {
      notifications.notify({ message: "Could not export Worksheet PDF.", timing: 20 })
    } else {
      notifications.notify({message: "Could not export Storyboard PDF.", timing: 20})
    }
  }
})

ipcRenderer.on('exportPDF', (event, args) => {
  openPrintWindow(PDFEXPORTPW, showPDFPrintWindow);
  ipcRenderer.send('analyticsEvent', 'Board', 'exportPDF')
})


ipcRenderer.on('printWorksheet', (event, args) => {
  log.info(boardData)
  openPrintWindow(WORKSHEETPW, showWorksheetPrintWindow);
})

const openPrintWindow = (printWindowType, showPrintWindow) => {
  if (!printWindow[printWindowType]) {
    printWindow[printWindowType] = new remote.BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 600,
      backgroundColor: '#333333',
      show: false,
      center: true,
      parent: remote.getCurrentWindow(),
      resizable: true,
      frame: false,
      modal: true,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true
      }
    })
    printWindow[printWindowType].loadURL(`file://${__dirname}/../../print-window.html`)
    printWindow[printWindowType].once('ready-to-show', () => {
      showPrintWindow(printWindow[printWindowType]);
    })
  } else if (!printWindow[printWindowType].isVisible()) {
      showPrintWindow(printWindow[printWindowType]);
  }

  ipcRenderer.send('analyticsEvent', 'Board', 'show print window')
}

const showPDFPrintWindow = (printWindow) => {
  printWindow.webContents.send('exportPDFData', boardData, boardFilename)
  setTimeout(()=>{printWindow.show()}, 200)
}

const showWorksheetPrintWindow = (printWindow) => {
  printWindow.webContents.send('worksheetData',boardData.aspectRatio, currentScene, scriptData)
  setTimeout(()=>{printWindow.show()}, 200)
}

ipcRenderer.on('importFromWorksheet', (event, args) => {
  importFromWorksheet(args)
})

ipcRenderer.on('importNotification', () => {
  let that = this

  let ip = getIpAddress()
  if (ip) {
    let message = "Did you know that you can import directly from your phone?\n\nOn your mobile phone, go to the web browser and type in: \n\n" + ip + ":1888"
    notifications.notify({message: message, timing: 60})
  }
})

ipcRenderer.on('importWorksheets', (event, args) => {
  if (!importWindow) {
    importWindow = new remote.BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 600,
      backgroundColor: '#333333',
      show: false,
      center: true,
      parent: remote.getCurrentWindow(),
      resizable: true,
      frame: false,
      modal: true,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true
      }
    })
    importWindow.loadURL(`file://${__dirname}/../../import-window.html`)
  } else {
    if (!importWindow.isVisible()) {
      importWindow.webContents.send('worksheetImage',args)
    }
  }

  importWindow.once('ready-to-show', () => {
    importWindow.webContents.send('worksheetImage',args)
  })
  ipcRenderer.send('analyticsEvent', 'Board', 'show import window')
})

ipcRenderer.on('save', (event, args) => {
  save()
  ipcRenderer.send('analyticsEvent', 'Board', 'save')
})

ipcRenderer.on('saveAs', (event, args) => saveAsFolder())

ipcRenderer.on('exportWeb', (event, args) => exportWeb())

ipcRenderer.on('exportZIP', (event, args) => exportZIP())

ipcRenderer.on('reloadScript', (event, args) => reloadScript(args))

//#region UI scale
ipcRenderer.on('scale-ui-by', (event, value) => {
  scaleBy(value)
})
ipcRenderer.on('scale-ui-reset', (event, value) => {
  setScale(value)
})
//#endregion

ipcRenderer.on('focus', async event => {
  if (!prefsModule.getPrefs()['enableForcePsdReloadOnFocus']) return

  if (boardData.boards[currentBoard].link) {
    linkedFileManager.activateBoard(boardData.boards[currentBoard], refreshLinkedBoardByFilename)
  }
})

ipcRenderer.on('stopAllSounds', () => {
  if (!textInputMode) {
    audioPlayback.stopAllSounds()
  }
})

ipcRenderer.on('addAudioFile', () => {
  if (!textInputMode) {
    audioFileControlView.onRequestFile()
  }
})

ipcRenderer.on('toggleAudition', value => {
  audioPlayback.toggleAudition()
})

ipcRenderer.on('revealShotGenerator', value => {
  document.querySelector('#shot-generator-container').scrollIntoView({
    behavior: 'smooth'
  })
})

const ZOOM_LEVELS = [
  .25,
  .33,
  .50,
  .60,
  1.00,
  2.00,
  3.00,
  4.00,
  5.00,
  6.00,
  7.00,
  8.00
]
const ZOOM_CENTER = 4
let zoomIndex = ZOOM_CENTER
// via https://stackoverflow.com/a/25087661
const closest = (arr, target) => {
   for (let i = 1; i < arr.length; i++) {
    // found larger
    if (arr[i] > target) {
      let p = arr[i - 1]
      let c = arr[i]
      // return closest of prev and curr
      return Math.abs( p - target ) < Math.abs( c - target ) ? p : c
    }
  }
  // none larger
  return arr[arr.length - 1]
}
ipcRenderer.on('zoomReset', value => {
  zoomIndex = ZOOM_CENTER
  storyboarderSketchPane.zoomCenter(ZOOM_LEVELS[zoomIndex])
})

const saveToBoardFromShotGenerator = async ({ uid, data, images }) => {
  // find the board by id
  let index = boardData.boards.findIndex(b => b.uid === uid)

  if (index === -1) {
    log.error(`board with uid ${uid} does not exist`)
    alert('Could not save shot: missing board.')
    return
  }

  // make a reference
  let board = boardData.boards[index]

  // update the board data in place
  boardData.boards[index] = {
    ...board,
    layers: {
      ...board.layers,
      'shot-generator': {
        // merge with existing, if available
        ...((board.layers && board.layers['shot-generator']) || {}),
        // ensure url is present
        url: boardModel.boardFilenameForLayer(board, 'shot-generator'),
        // ensure opacity is 1.0
        opacity: 1.0,
        // layer gets a thumbnail
        thumbnail: boardModel.boardFilenameForLayerThumbnail(board, 'shot-generator')
      },
    },
    // shot generator
    sg: {
      version: pkg.version,
      data
    }
  }
  // force the reference layer opacity to be 100
  layersEditor.setReferenceOpacity(1)

  // update the reference
  board = boardData.boards[index]

  markBoardFileDirty()

  // resize
  let { width, height } = storyboarderSketchPane.sketchPane
  let image = await exporterCommon.getImage(images.camera)
  let context = createSizedContext([width, height])

  // fit to destination (until we fix the shot generator render size)
  let [x, y, w, h] = util.fitToDst(context.canvas, image).map(Math.ceil)
  // FIXME can we fix the bug to avoid having to add padding?
  // add some padding to solve for the white line bug
  w += 3
  h += 3
  context.drawImage(image, 0, 0, w, h)

  // save shot-generator.png
  saveDataURLtoFile(context.canvas.toDataURL(), board.layers['shot-generator'].url)

  // save camera-plot (re-use context)
  let plotImage = await exporterCommon.getImage(images.plot)
  context.canvas.width = 900
  context.canvas.height = 900
  context.drawImage(plotImage, 0, 0)
  saveDataURLtoFile(
    context.canvas.toDataURL(),
    boardModel.boardFilenameForCameraPlot(board)
  )

  // save shot-generator-thumbnail.jpg
  // thumbnail size
  let size = getLayerThumbnailSize(boardData.aspectRatio)
  context.canvas.width = size[0]
  context.canvas.height = size[1]
  // FIXME do we still need padding?
  let [x2, y2, w2, h2] = util.fitToDst(context.canvas, image).map(Math.ceil)
  w2 += 3
  h2 += 3
  context.drawImage(image, 0, 0, w2, h2)
  saveDataURLtoFile(
    context.canvas.toDataURL({ type: 'image/jpeg', encoderOptions: 0.92 }),
    board.layers['shot-generator'].thumbnail
  )
  context.canvas = null
  context = null


  await saveThumbnailFile(index, { forceReadFromFiles: true })
  await updateThumbnailDisplayFromFile(index)

  await savePosterFrame(board, /*forceReadFromFiles:*/ true)

  if (index === currentBoard) {
    // FIXME known issue: onion skin does not reload to reflect the changed file
    //       see: https://github.com/wonderunit/storyboarder/issues/1185
    await updateSketchPaneBoard()
  }

  renderShotGeneratorPanel()
}
ipcRenderer.on('saveShot', async (event, { uid, data, images }) => {
  storeUndoStateForScene(true)
  await saveToBoardFromShotGenerator({ uid, data, images })
  storeUndoStateForScene()
  
  ipcRenderer.send('shot-generator:update', {
    board: boardData.boards.find(board => board.uid === uid)
  })
})
ipcRenderer.on('insertShot', async (event, { data, images, currentBoard }) => {
  let position = boardData.boards.map(board => board.uid).indexOf(currentBoard.uid);
  let index = await newBoard(position + 1)
  await gotoBoard(index)

  let uid = boardData.boards[index].uid

  storeUndoStateForScene(true)
  await saveToBoardFromShotGenerator({ uid, data, images })
  storeUndoStateForScene()

  ipcRenderer.send('shot-generator:update', {
    board: boardData.boards[index]
  })
})
ipcRenderer.on('storyboarder:get-boards', event => {
  ipcRenderer.send('shot-generator:get-boards', {
    boards: boardData.boards.map(board => ({
      uid: board.uid,
      shot: board.shot,
      thumbnail: boardModel.boardFilenameForThumbnail(board),
      hasSg: board.sg ? true : false
    }))
  })
})
ipcRenderer.on('storyboarder:get-board', (event, uid) => {
  ipcRenderer.send(
    'shot-generator:get-board',
    boardData.boards.find(board => board.uid === uid)
  )
})
ipcRenderer.on('storyboarder:get-storyboarder-file-data', (event, uid) => {
  ipcRenderer.send(
    'shot-generator:get-storyboarder-file-data',
    {
      storyboarderFilePath: boardFilename,
      boardData: {
        version: boardData.version,
        aspectRatio: boardData.aspectRatio
      }
    }
  )
})
ipcRenderer.on('storyboarder:get-state', event => {
  let board = boardData.boards[currentBoard]
  ipcRenderer.send(
    'shot-generator:get-state',
    {
      board
    }
  )
})

const logToView = opt => ipcRenderer.send('log', opt)

if (prefsModule.getPrefs().enableDiagnostics) {
  new DiagnosticsView()
}

if (isDev) {
  // HACK to support Cmd+R reloading
  setTimeout(() => {
    // … if no boardData present after timeout, we probably just Cmd+R reloaded
    if (!boardData) {
      // were we passed a filename in the `npm start` arguments?
      let filePath = process.env.npm_package_scripts_start
      filePath = filePath.replace(/"/g, '')
      filePath = filePath.replace('electron .', '')
      filePath = filePath.replace(/^\s/, '')
      if (filePath.length) {
        // try to load that file again
        load(null, [
          path.resolve(
            path.join(__dirname, '../../../' + filePath)
          )
        ])
      }
    }
  }, 1500)
}
