const {app, ipcMain, BrowserWindow, globalShortcut, dialog, powerSaveBlocker} = electron = require('electron')

const fs = require('fs')
const path = require('path')
const isDev = require('electron-is-dev')
const trash = require('trash')

const prefModule = require('./prefs')

const analytics = require('./analytics')

const fountain = require('./vendor/fountain')
const fountainDataParser = require('./fountain-data-parser')
const fountainSceneIdUtil = require('./fountain-scene-id-util')

const MobileServer = require('./express-app/app')

const preferencesUI = require('./windows/preferences')()

const pkg = require('../../package.json')
const util = require('./utils/index.js')

const autoUpdater = require('./auto-updater')

//https://github.com/luiseduardobrito/sample-chat-electron

let welcomeWindow
let newWindow

let mainWindow
let printWindow
let sketchWindow
let keyCommandWindow

let loadingStatusWindow

let welcomeInprogress
let stsWindow

let statWatcher

let powerSaveId = 0

let previousScript

let prefs = prefModule.getPrefs('main')

let currentFile
let currentPath

let toBeOpenedPath

let onCreateNew
let isLoadingProject

let appServer

// this only works on mac.
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (app.isReady()) {
    openFile(path)
  } else {
    toBeOpenedPath = path
  }
})

app.on('ready', () => {
  analytics.init(prefs.enableAnalytics)

  appServer = new MobileServer()
  appServer.on('pointerEvent', (e)=> {
    console.log('pointerEvent')
  })
  appServer.on('image', (e) => {
    mainWindow.webContents.send('newBoard', 1)
    mainWindow.webContents.send('importImage', e.fileData)
  })
  appServer.on('worksheet', (e) => {
    mainWindow.webContents.send('importWorksheets', [e.fileData])
  })
  appServer.on('error', err => {
    if (err.errno === 'EADDRINUSE') {
      // dialog.showMessageBox(null, {
      //   type: 'error',
      //   message: 'Could not start the mobile web app server. The port was already in use. Is Storyboarder already open?'
      // })
    } else {
      dialog.showMessageBox(null, {
        type: 'error',
        message: err
      })
    }
  })

  // open the welcome window when the app loads up first
  openWelcomeWindow()
  // via https://github.com/electron/electron/issues/4690#issuecomment-217435222
  const argv = process.defaultApp ? process.argv.slice(2) : process.argv

  //was an argument passed?
  if (isDev && argv[0]) {
    let filePath = path.resolve(argv[0])
    if (fs.existsSync(filePath)) {
      openFile(filePath)

      // HACK prevent upcoming welcomeWindow.show
      welcomeWindow.once('show', () => welcomeWindow.hide())

      return

    } else {
      console.error('Could not load', filePath)
    }
  }

  // this only works on mac.
  if (toBeOpenedPath) {
    openFile(toBeOpenedPath)
    return
  }


  setInterval(()=>{ analytics.ping() }, 60*1000)
})

let openKeyCommandWindow = ()=> {
  keyCommandWindow = new BrowserWindow({width: 1158, height: 925, maximizable: false, center: true, show: false, resizable: false, frame: false, titleBarStyle: 'hidden-inset'})
  keyCommandWindow.loadURL(`file://${__dirname}/../keycommand-window.html`)
  keyCommandWindow.once('ready-to-show', () => {
    setTimeout(()=>{keyCommandWindow.show()},500)
  })
}

app.on('activate', ()=> {
  if (!mainWindow && !welcomeWindow) openWelcomeWindow()

})

let openNewWindow = () => {
  onCreateNew = createNewGivenAspectRatio

  if (!newWindow) {
    // TODO this code is never called currently, as the window is created w/ welcome
    newWindow = new BrowserWindow({width: 600, height: 580, show: false, center: true, parent: welcomeWindow, resizable: false, frame: false, modal: true})
    newWindow.loadURL(`file://${__dirname}/../new.html`)
    newWindow.once('ready-to-show', () => {
      newWindow.show()
    })
  } else {
    // ensure we clear the tabs
    newWindow.reload()
    setTimeout(() => {
      newWindow.show()
    }, 200)
  }
}

let openWelcomeWindow = () => {
  welcomeWindow = new BrowserWindow({width: 900, height: 600, center: true, show: false, resizable: false, frame: false})
  welcomeWindow.loadURL(`file://${__dirname}/../welcome.html`)

  newWindow = new BrowserWindow({width: 600, height: 580, show: false, parent: welcomeWindow, resizable: false, frame: false, modal: true})
  newWindow.loadURL(`file://${__dirname}/../new.html`)

  let recentDocumentsCopy
  if (prefs.recentDocuments) {
    let count = 0
    recentDocumentsCopy = prefs.recentDocuments
    for (var recentDocument of prefs.recentDocuments) {
      try {
        fs.accessSync(recentDocument.filename, fs.R_OK)
      } catch (e) {
        // It isn't accessible
        // console.warn('Recent file no longer exists: ', recentDocument.filename)
        recentDocumentsCopy.splice(count, 1)
      }
      count++
    }
    prefs.recentDocuments = recentDocumentsCopy
  }

  welcomeWindow.once('ready-to-show', () => {
    setTimeout(() => {
      welcomeWindow.show()
      if (!isDev) autoUpdater.init()
      analytics.screenView('welcome')
    }, 300)
  })

  welcomeWindow.once('close', () => {
    welcomeWindow = null
    if (!welcomeInprogress) {
      analytics.event('Application', 'quit')
      app.quit()
    } else {
      welcomeInprogress = false
    }
  })
}

let openFile = (file) => {
  let arr = file.split(path.sep)
  let filename = arr[arr.length-1]
  let filenameParts =filename.toLowerCase().split('.')
  let type = filenameParts[filenameParts.length-1]
  if (type == 'storyboarder') {
    /// LOAD STORYBOARDER FILE
    addToRecentDocs(file, {
      boards: 2,
      time: 3000,
    })
    loadStoryboarderWindow(file)
  } else if (type == 'fountain') {
    /// LOAD FOUNTAIN FILE
    fs.readFile(file, 'utf-8', (err,data)=>{
      sceneIdScript = fountainSceneIdUtil.insertSceneIds(data)
      if (sceneIdScript[1]) {
        dialog.showMessageBox({
          type: 'info',
          message: 'We added scene IDs to your fountain script.',
          detail: "Scene IDs are what we use to make sure we put the storyboards in the right place. If you have your script open in an editor, you should reload it. Also, you can change your script around as much as you want, but please don't change the scene IDs.",
          buttons: ['OK']
        })
        fs.writeFileSync(file, sceneIdScript[0])
        data = sceneIdScript[0]
      }
      // check for storyboards directory
      let storyboardsPath = file.split(path.sep)
      storyboardsPath.pop()
      storyboardsPath = path.join(storyboardsPath.join(path.sep), 'storyboards')

      // TODO can we wait until aspect ratio has been input before creating?
      //      because currently, if the user cancels after this, they get an empty folder on their filesystem
      if (!fs.existsSync(storyboardsPath)){
        fs.mkdirSync(storyboardsPath)
      }

      currentFile = file
      currentPath = storyboardsPath

      // check for storyboard.settings file
      if (!fs.existsSync(path.join(storyboardsPath, 'storyboard.settings'))){

        newWindow.webContents.send('setTab', 1)
        newWindow.show()
        onCreateNew = (aspectRatio) =>
          createNewFromExistingFile(
            aspectRatio,

            data,
            storyboardsPath,
            currentFile,
            currentPath
          )

      } else {
        let boardSettings = JSON.parse(fs.readFileSync(path.join(storyboardsPath, 'storyboard.settings')))
        if (!boardSettings.lastScene) { boardSettings.lastScene = 0 }
        //[scriptData, locations, characters, metadata]
        let processedData = processFountainData(data, true, false)
        addToRecentDocs(currentFile, processedData[3])
        loadStoryboarderWindow(currentFile, processedData[0], processedData[1], processedData[2], boardSettings, currentPath)
      }
    })
  }
}

let openDialogue = () => {
  dialog.showOpenDialog({title:"Open Script", filters:[
      {name: 'Screenplay or Storyboarder', extensions: ['fountain', 'storyboarder']},
    ]}, (filenames)=>{
      if (filenames) {
        openFile(filenames[0])
      }
  })
}

let importImagesDialogue = () => {
  dialog.showOpenDialog(
    {
      title:"Import Boards",
      filters:[
        {name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'psd']},
      ],
      properties: [
        "openFile",
        "openDirectory",
        "multiSelections"
      ]
    },

    (filepaths)=>{
      if (filepaths) {
        filepaths = filepaths.sort()
        let filepathsRecursive = []
        let handleDirectory = (dirPath) => {
          let innerFilenames = fs.readdirSync(dirPath)
          for(let innerFilename of innerFilenames) {
            var innerFilePath = path.join(dirPath, innerFilename)
            let stats = fs.statSync(innerFilePath)
            if(stats.isFile()) {
              filepathsRecursive.push(innerFilePath)
            } else if(stats.isDirectory()) {
              handleDirectory(innerFilePath)
            }
          }
        }
        for(let filepath of filepaths) {
          let stats = fs.statSync(filepath)
          if(stats.isFile()) {
            filepathsRecursive.push(filepath)
          } else if(stats.isDirectory()) {
            handleDirectory(filepath)
          }
        }

        mainWindow.webContents.send('insertNewBoardsWithFiles', filepathsRecursive)
      }
    }
  )
}

let importWorksheetDialogue = () => {
  dialog.showOpenDialog(
    {
      title:"Import Worksheet",
      filters:[
        {name: 'Images', extensions: ['png', 'jpg', 'jpeg']},
      ],
      properties: [
        "openFile",
      ]
    },

    (filepath)=>{
      if (filepath) {
        mainWindow.webContents.send('importWorksheets', filepath)
      }
    }
  )
}

let processFountainData = (data, create, update) => {
  let scriptData = fountain.parse(data, true)
  let locations = fountainDataParser.getLocations(scriptData.tokens)
  let characters = fountainDataParser.getCharacters(scriptData.tokens)
  scriptData = fountainDataParser.parse(scriptData.tokens)
  let metadata = {type: 'script', sceneBoardsCount: 0, sceneCount: 0, totalMovieTime: 0}

  let boardsDirectoryFolders = fs.readdirSync(currentPath).filter(function(file) {
    return fs.statSync(path.join(currentPath, file)).isDirectory();
  });

  for (var node of scriptData) {
    switch (node.type) {
      case 'title':
        metadata.title = node.text.replace(/<(?:.|\n)*?>/gm, '')
        break
      case 'scene':
        metadata.sceneCount++
        let id
        if (node.scene_id) {
          id = node.scene_id.split('-')
          if (id.length>1) {
            id = id[1]
          } else {
            id = id[0]
          }
        } else {
          id = 'G' + metadata.sceneCount
        }
        for (var directory in boardsDirectoryFolders) {
          if (directory.includes(id)) {
            metadata.sceneBoardsCount++
            // load board file and get stats and shit
            break
          }
        }
        break
    }
  }

  switch (scriptData[scriptData.length-1].type) {
    case 'section':
      metadata.totalMovieTime = scriptData[scriptData.length-1].time + scriptData[scriptData.length-1].duration
      break
    case 'scene':
      let lastNode = scriptData[scriptData.length-1]['script'][scriptData[scriptData.length-1]['script'].length-1]
      metadata.totalMovieTime = lastNode.time + lastNode.duration
      break
  }

  if (create) {
    fs.watchFile(currentFile, {persistent: false}, (e) => {
      console.log("TODO SHOULD LOAD FILE")
      //loadFile(false, true)
    })
  }

  if (update) {
    mainWindow.webContents.send('updateScript', 1)//, diffScene)
  }

  return [scriptData, locations, characters, metadata]
}

let getSceneDifference = (scriptA, scriptB) => {
  let i = 0
  for (var node of scriptB) {
    if(!scriptA[i]) {
      return i
    }
    if (JSON.stringify(node) !== JSON.stringify(scriptA[i])) {
      return i
    }
    i++
  }
  return false
}


////////////////////////////////////////////////////////////
// new functions
////////////////////////////////////////////////////////////

let createNewGivenAspectRatio = aspectRatio => {
  return new Promise((resolve, reject) => {
    dialog.showSaveDialog({
      title: "New storyboard",
      buttonLabel: "Create",
    },
    filename => {
      if (filename) {
        console.log(filename)

        let tasks = Promise.resolve()

        if (fs.existsSync(filename)) {
          if (fs.lstatSync(filename).isDirectory()) {
            console.log('\ttrash existing folder', filename)
            tasks = tasks.then(() => trash(filename)).catch(err => reject(err))
          } else {
            dialog.showMessageBox(null, {
              message: "Could not overwrite file " + path.basename(filename) + ". Only folders can be overwritten."
            })
            return reject(null)
          }
        }

        tasks = tasks.then(() => {
          fs.mkdirSync(filename)

          let boardName = path.basename(filename)
          let filePath = path.join(filename, boardName + '.storyboarder')

          let newBoardObject = {
            version: pkg.version,
            aspectRatio: aspectRatio,
            fps: 24,
            defaultBoardTiming: prefs.defaultBoardTiming,
            boards: []
          }

          fs.writeFileSync(filePath, JSON.stringify(newBoardObject))
          fs.mkdirSync(path.join(filename, 'images'))

          addToRecentDocs(filePath, newBoardObject)
          loadStoryboarderWindow(filePath)

          analytics.event('Application', 'new', newBoardObject.aspectRatio)
        }).catch(err => reject(err))

        tasks.then(resolve)
      } else {
        reject()
      }
    })
  })
}

let createNewFromExistingFile = (aspectRatio, data, storyboardsPath, currentFile, currentPath) =>
  new Promise((resolve, reject) => {
    let boardSettings = {
      lastScene: 0,
      aspectRatio
    }
    fs.writeFileSync(path.join(storyboardsPath, 'storyboard.settings'), JSON.stringify(boardSettings))
    //[scriptData, locations, characters, metadata]
    let processedData = processFountainData(data, true, false)

    addToRecentDocs(currentFile, processedData[3])
    loadStoryboarderWindow(currentFile, processedData[0], processedData[1], processedData[2], boardSettings, currentPath)

    resolve()
  })

let loadStoryboarderWindow = (filename, scriptData, locations, characters, boardSettings, currentPath) => {
  isLoadingProject = true

  if (welcomeWindow) {
    welcomeWindow.hide()
  }
  if (newWindow) {
    newWindow.hide()
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
  }

  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    acceptFirstMouse: true,
    backgroundColor: '#333333',

    width: Math.min(width, 2480),
    height: Math.min(height, 1350),

    title: path.basename(filename),

    minWidth: 1024,
    minHeight: 640,
    show: false,
    resizable: true,
    titleBarStyle: 'hidden-inset',
    webPreferences: {
      webgl: true,
      experimentalFeatures: true,
      experimentalCanvasFeatures: true,
      devTools: true,
      plugins: true
    }
  })

  let projectName = path.basename(filename, path.extname(filename))
  loadingStatusWindow = new BrowserWindow({
    width: 450,
    height: 150,
    backgroundColor: '#333333',
    show: false,
    frame: false,
    resizable: false
  })
  loadingStatusWindow.loadURL(`file://${__dirname}/../loading-status.html?name=${projectName}`)
  loadingStatusWindow.once('ready-to-show', () => {
    loadingStatusWindow.show()
  })


  // http://stackoverflow.com/a/39305399
  // https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers/onerror
  const onErrorInWindow = (event, message, source, lineno, colno, error) => {
    if (isDev) {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.webContents.openDevTools()
      }
    }
    dialog.showMessageBox({
      title: 'Error',
      type: 'error',
      message: message,
      detail: 'In file: ' + source + '#' + lineno + ':' + colno
    })
    console.error(message, source, lineno, colno)
    analytics.exception(message, source, lineno)
  }

  ipcMain.on('errorInWindow', onErrorInWindow)
  mainWindow.loadURL(`file://${__dirname}/../main-window.html`)
  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.send('load', [filename, scriptData, locations, characters, boardSettings, currentPath])
    isLoadingProject = false
    analytics.screenView('main')
  })

  if (isDev) {
    mainWindow.webContents.on('devtools-focused', event => { mainWindow.webContents.send('devtools-focused') })
    mainWindow.webContents.on('devtools-closed', event => { mainWindow.webContents.send('devtools-closed') })
  }

  // via https://github.com/electron/electron/blob/master/docs/api/web-contents.md#event-will-prevent-unload
  //     https://github.com/electron/electron/pull/9331
  //
  // if beforeunload is telling us to prevent unload ...
  mainWindow.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBox({
      type: 'question',
      buttons: ['Yes', 'No'],
      title: 'Confirm',
      message: 'Your Storyboarder file is not saved. Are you sure you want to quit?'
    })

    const leave = (choice === 0)

    if (leave) {
      // ignore the default behavior of preventing unload
      // ... which means we'll actually ... _allow_ unload :)
      event.preventDefault()
    }
  })

  mainWindow.once('closed', event => {
    if (welcomeWindow) {
      ipcMain.removeListener('errorInWindow', onErrorInWindow)
      welcomeWindow.webContents.send('updateRecentDocuments')
      // when old workspace is closed,
      //   show the welcome window
      // EXCEPT if we're currently loading a new workspace
      //        (to take old's place)
      if (!isLoadingProject) {
        welcomeWindow.show()
        analytics.screenView('welcome')
      }

      appServer.setCanImport(false)

      analytics.event('Application', 'close')
    }
  })
}


let addToRecentDocs = (filename, metadata) => {
  let prefs = prefModule.getPrefs('add to recent')

  let recentDocuments
  if (!prefs.recentDocuments) {
    recentDocuments = []
  } else {
    recentDocuments = prefs.recentDocuments
  }

  let currPos = 0

  for (var document of recentDocuments) {
    if (document.filename == filename) {
      recentDocuments.splice(currPos, 1)
      break
    }
    currPos++
  }

  let recentDocument = metadata

  if (!recentDocument.title) {
    let title = filename.split(path.sep)
    title = title[title.length-1]
    title = title.split('.')
    title.splice(-1,1)
    title = title.join('.')
    recentDocument.title = title
  }

  recentDocument.filename = filename
  recentDocument.time = Date.now()
  recentDocuments.unshift(recentDocument)
  // save
  prefModule.set('recentDocuments', recentDocuments)
}

////////////////////////////////////////////////////////////
// ipc passthrough
////////////////////////////////////////////////////////////

//////////////////
// Main Window
//////////////////

ipcMain.on('newBoard', (e, arg)=> {
  mainWindow.webContents.send('newBoard', arg)
})

ipcMain.on('deleteBoards', (e, arg)=> {
  mainWindow.webContents.send('deleteBoards', arg)
})

ipcMain.on('duplicateBoard', (e, arg)=> {
  mainWindow.webContents.send('duplicateBoard')
})

ipcMain.on('reorderBoardsLeft', (e, arg)=> {
  mainWindow.webContents.send('reorderBoardsLeft')
})

ipcMain.on('reorderBoardsRight', (e, arg)=> {
  mainWindow.webContents.send('reorderBoardsRight')
})

ipcMain.on('togglePlayback', (e, arg)=> {
  mainWindow.webContents.send('togglePlayback')
})

ipcMain.on('openInEditor', (e, arg)=> {
  mainWindow.webContents.send('openInEditor')
})

ipcMain.on('openInOraEditor', (e, arg)=> {
  mainWindow.webContents.send('openInOraEditor')
})

ipcMain.on('goPreviousBoard', (e, arg)=> {
  mainWindow.webContents.send('goPreviousBoard')
})

ipcMain.on('goNextBoard', (e, arg)=> {
  mainWindow.webContents.send('goNextBoard')
})

ipcMain.on('previousScene', (e, arg)=> {
  mainWindow.webContents.send('previousScene')
})

ipcMain.on('nextScene', (e, arg)=> {
  mainWindow.webContents.send('nextScene')
})

ipcMain.on('copy', (e, arg)=> {
  mainWindow.webContents.send('copy')
})

ipcMain.on('paste', (e, arg)=> {
  mainWindow.webContents.send('paste')
})

/// TOOLS

ipcMain.on('undo', (e, arg)=> {
  mainWindow.webContents.send('undo')
})

ipcMain.on('redo', (e, arg)=> {
  mainWindow.webContents.send('redo')
})

ipcMain.on('setTool', (e, arg)=> {
  mainWindow.webContents.send('setTool', arg)
})

ipcMain.on('useColor', (e, arg)=> {
  mainWindow.webContents.send('useColor', arg)
})

ipcMain.on('clear', (e, arg) => {
  mainWindow.webContents.send('clear', arg)
})

ipcMain.on('brushSize', (e, arg)=> {
  mainWindow.webContents.send('brushSize', arg)
})

ipcMain.on('flipBoard', (e, arg)=> {
  mainWindow.webContents.send('flipBoard', arg)
})

/// VIEW

ipcMain.on('cycleViewMode', (e, arg)=> {
  mainWindow.webContents.send('cycleViewMode', arg)
})

ipcMain.on('toggleCaptions', (e, arg)=> {
  mainWindow.webContents.send('toggleCaptions', arg)
})

//////////////////
// Welcome Window
//////////////////


ipcMain.on('openFile', (e, arg)=> {
  openFile(arg)
})

ipcMain.on('openDialogue', (e, arg)=> {
  openDialogue()
})

ipcMain.on('importImagesDialogue', (e, arg)=> {
  importImagesDialogue()
  mainWindow.webContents.send('importNotification', arg)
})

ipcMain.on('createNew', (e, ...args) => {
  newWindow.hide()
  onCreateNew(...args)
    .then(() => {
    })
    .catch(err => {
      if (err) {
        dialog.showMessageBox(null, { type: 'error', message: err.message })
      }
    })
})

ipcMain.on('openNewWindow', (e, arg)=> {
  openNewWindow()
})

ipcMain.on('preventSleep', ()=> {
  powerSaveId = powerSaveBlocker.start('prevent-display-sleep')
})

ipcMain.on('resumeSleep', ()=> {
  powerSaveBlocker.stop(powerSaveId)
})

/// menu pass through

ipcMain.on('goBeginning', (event, arg)=> {
  mainWindow.webContents.send('goBeginning')
})

ipcMain.on('goPreviousScene', (event, arg)=> {
  mainWindow.webContents.send('goPreviousScene')
})

ipcMain.on('goPrevious', (event, arg)=> {
  mainWindow.webContents.send('goPrevious')
})

ipcMain.on('goNext', (event, arg)=> {
  mainWindow.webContents.send('goNext')
})

ipcMain.on('goNextScene', (event, arg)=> {
  mainWindow.webContents.send('goNextScene')
})

ipcMain.on('toggleSpeaking', (event, arg)=> {
  mainWindow.webContents.send('toggleSpeaking')
})

ipcMain.on('playsfx', (event, arg)=> {
  if (welcomeWindow) {
    welcomeWindow.webContents.send('playsfx', arg)
  }
})

ipcMain.on('test', (event, arg)=> {
  console.log('test', arg)
})

ipcMain.on('textInputMode', (event, arg)=> {
  mainWindow.webContents.send('textInputMode', arg)
})

ipcMain.on('preferences', (event, arg) => {
  preferencesUI.show()
  analytics.screenView('preferences')
})

ipcMain.on('toggleGuide', (event, arg) => {
  mainWindow.webContents.send('toggleGuide', arg)
})

ipcMain.on('toggleNewShot', (event, arg) => {
  mainWindow.webContents.send('toggleNewShot', arg)
})

ipcMain.on('showTip', (event, arg) => {
  mainWindow.webContents.send('showTip', arg)
})

ipcMain.on('exportAnimatedGif', (event, arg) => {
  mainWindow.webContents.send('exportAnimatedGif', arg)
})

ipcMain.on('exportFcp', (event, arg) => {
  mainWindow.webContents.send('exportFcp', arg)
})

ipcMain.on('exportImages', (event, arg) => {
  mainWindow.webContents.send('exportImages', arg)
})

ipcMain.on('exportPDF', (event, arg) => {
  mainWindow.webContents.send('exportPDF', arg)
})

ipcMain.on('exportCleanup', (event, arg) => {
  mainWindow.webContents.send('exportCleanup', arg)
})

ipcMain.on('printWorksheet', (event, arg) => {
  //openPrintWindow()
  mainWindow.webContents.send('printWorksheet', arg)
})

ipcMain.on('importWorksheets', (event, arg) => {
  //openPrintWindow()
  importWorksheetDialogue()
  mainWindow.webContents.send('importNotification', arg)
})

ipcMain.on('save', (event, arg) => {
  mainWindow.webContents.send('save', arg)
})

ipcMain.on('prefs:change', (event, arg) => {
  mainWindow.webContents.send('prefs:change', arg)
})

ipcMain.on('showKeyCommands', (event, arg) => {
  openKeyCommandWindow()
  analytics.screenView('key commands')
})

ipcMain.on('analyticsScreen', (event, screenName) => {
  analytics.screenView(screenName)
})

ipcMain.on('analyticsEvent', (event, category, action, label, value) => {
  analytics.event(category, action, label, value)
})

ipcMain.on('analyticsTiming', (event, category, name, ms) => {
  analytics.timing(category, name, ms)
})

ipcMain.on('log', (event, opt) => {
  !loadingStatusWindow.isDestroyed() && loadingStatusWindow.webContents.send('log', opt)
})

ipcMain.on('workspaceReady', event => {
  appServer.setCanImport(true)

  mainWindow && mainWindow.show()
  !loadingStatusWindow.isDestroyed() && loadingStatusWindow.hide()
})

ipcMain.on('exportWorksheetPdf', (event, sourcePath) => {
  mainWindow.webContents.send('exportWorksheetPdf', sourcePath)
})
