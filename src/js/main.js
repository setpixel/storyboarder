const {app, ipcMain, BrowserWindow, globalShortcut, dialog, powerSaveBlocker} = electron = require('electron')

const fs = require('fs-extra')
const path = require('path')
const isDev = require('electron-is-dev')
const trash = require('trash')
const chokidar = require('chokidar')
const os = require('os')

const prefModule = require('./prefs')
prefModule.init(path.join(app.getPath('userData'), 'pref.json'))


const configureStore = require('./shared/store/configureStore')
const observeStore = require('./shared/helpers/observeStore')
const actions = require('./shared/actions')
const defaultKeyMap = require('./shared/helpers/defaultKeyMap')

const analytics = require('./analytics')

const fountain = require('./vendor/fountain')
const fountainDataParser = require('./fountain-data-parser')
const fountainSceneIdUtil = require('./fountain-scene-id-util')

const importerFinalDraft = require('./importers/final-draft')
const xml2js = require('xml2js')

const MobileServer = require('./express-app/app')

const preferencesUI = require('./windows/preferences')()

const pkg = require('../../package.json')
const util = require('./utils/index')

const autoUpdater = require('./auto-updater')

//https://github.com/luiseduardobrito/sample-chat-electron


const store = configureStore({}, 'main')



let welcomeWindow
let newWindow

let mainWindow
let printWindow
let sketchWindow
let keyCommandWindow
let sketchPanePreviewWindow

let loadingStatusWindow

let welcomeInprogress
let stsWindow

let scriptWatcher

let powerSaveId = 0

let previousScript

let prefs = prefModule.getPrefs('main')

// state
let currentFile
let currentFileLastModified
let currentPath
let currentScriptDataObject // used to store data until 'createNew' ipc fires back

let toBeOpenedPath

let isLoadingProject

let appServer

// attempt to support older GPUs
app.commandLine.appendSwitch('ignore-gpu-blacklist')

// this only works on mac.
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (app.isReady()) {
    openFile(path)
  } else {
    toBeOpenedPath = path
  }
})

app.on('ready', async () => {
  analytics.init(prefs.enableAnalytics)

  const exporterFfmpeg = require('./exporters/ffmpeg')
  let ffmpegVersion = await exporterFfmpeg.checkVersion()
  console.log('ffmpeg version', ffmpegVersion)

  // try to load key map
  const keymapPath = path.join(app.getPath('userData'), 'keymap.json')
  // ensure keymap.json exists
  if (!fs.existsSync(keymapPath)) {
    console.log('Creating', keymapPath)
    fs.writeFileSync(keymapPath, JSON.stringify(defaultKeyMap, null, 2) + '\n')
  }
  // attempt to merge it in with defaults
  try {
    console.log('Reading', keymapPath)
    store.dispatch({
      type: 'SET_KEYMAP',
      payload: JSON.parse(fs.readFileSync(keymapPath, { encoding: 'utf8' }))
    })
  } catch (err) {
    console.error(err)
    dialog.showMessageBox({
      type: 'error',
      message: `Whoops! An error ocurred while trying to read keymap.json.
                Using default keymap instead.\n\n${err}`
    })
  }

  if (os.platform() === 'darwin') {
    if (!isDev && !app.isInApplicationsFolder()) {
      const choice = dialog.showMessageBox({
        type: 'question',
        title: 'Move to Applications folder?',
        message: 'Would you like to move Storyboarder to the Applications folder?',
        buttons: ['Move to Applications', 'Do Not Move'],
        defaultId: 1
      })
    
      const yes = (choice === 0)
      
      if (yes) {
        try {
          let didMove = app.moveToApplicationsFolder()
          if (!didMove) {
            dialog.showMessageBox(null, {
              type: 'error',
              message: 'Could not move to Applications folder'
            })
          }
        } catch (err) {
          dialog.showMessageBox(null, {
            type: 'error',
            message: err.message
          })
        }
      }
    }
  }

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

  // TODO why is loading via arg limited to dev mode only?
  // was an argument passed?
  if (isDev) {
    // via https://github.com/electron/electron/issues/4690#issuecomment-217435222
    const argv = process.defaultApp ? process.argv.slice(2) : process.argv

    if (argv[0]) {
      let filePath = path.resolve(argv[0])
      if (fs.existsSync(filePath)) {

        // wait 300 msecs for windows to load
        setTimeout(() => openFile(filePath), 300)

        // prevent welcomeWindow from popping up
        welcomeWindow.hide()
        welcomeWindow.removeAllListeners('ready-to-show')
        return

      } else {
        console.error('Could not load', filePath)
        dialog.showErrorBox(
          'Could not load requested file',
          `Error loading ${filePath}`
        )
      }
    }
  }
 
  // this only works on mac.
  if (toBeOpenedPath) {
    openFile(toBeOpenedPath)
    return
  }


  setInterval(()=>{ analytics.ping() }, 60*1000)
})

let openKeyCommandWindow = () => {
  if (keyCommandWindow) {
    keyCommandWindow.focus()
    return
  }

  keyCommandWindow = new BrowserWindow({
    width: 1158,
    height: 925,
    maximizable: false,
    center: true,
    show: false,
    resizable: false,
    frame: false,
    titleBarStyle: 'hiddenInset'
  })
  keyCommandWindow.loadURL(`file://${__dirname}/../keycommand-window.html`)
  keyCommandWindow.once('ready-to-show', () => {
    setTimeout(() => keyCommandWindow.show(), 250) // wait for DOM
  })
  keyCommandWindow.on('close', () => {
    keyCommandWindow = null
  })
}

app.on('activate', ()=> {
  if (!mainWindow && !welcomeWindow) openWelcomeWindow()
  
})

let openNewWindow = () => {
  // reset state
  currentFile = undefined
  currentFileLastModified = undefined
  currentPath = undefined
  currentScriptDataObject = undefined

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
    prefModule.set('recentDocuments', recentDocumentsCopy)
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

let openFile = filepath => {
  let filename = path.basename(filepath)
  let extname = path.extname(filepath)

  if (extname === '.storyboarder') {
    /// LOAD STORYBOARDER FILE
    addToRecentDocs(filepath, {
      boards: 2,
      time: 3000,
    })
    loadStoryboarderWindow(filepath)

  } else if (extname === '.fdx') {
    fs.readFile(filepath, 'utf-8', (err, data) => {
      if (err) {
        dialog.showMessageBox({
          type: 'error',
          message: 'Could not open Final Draft file.\n' + error.message,
        })
        return
      }
      let parser = new xml2js.Parser()
      parser.parseString(data, (err, fdxObj) => {
        if (err) {
          dialog.showMessageBox({
            type: 'error',
            message: 'Could not parse Final Draft XML.\n' + error.message,
          })
          return
        }

        currentFile = filepath
        currentPath = path.join(path.dirname(currentFile), 'storyboards')

        try {
          let [scriptData, locations, characters, metadata] = processFdxData(fdxObj)

          findOrCreateProjectFolder([
            scriptData,
            locations,  
            characters,
            metadata
          ])
        } catch (error) {
          console.error(error)
          dialog.showMessageBox({
            type: 'error',
            message: 'Could not parse Final Draft data.\n' + error.message
          })
        }
      })
    })

  } else if (extname == '.fountain') {
    currentFile = filepath
    currentPath = path.join(path.dirname(currentFile), 'storyboards')

    fs.readFile(filepath, 'utf-8', (err, data) => {
      if (err) {
        dialog.showMessageBox({
          type: 'error',
          message: 'Could not read Fountain script.\n' + err.message,
        })
        return
      }
      try {
        data = ensureFountainSceneIds(filepath, data)
        findOrCreateProjectFolder(
          processFountainData(data, true, false)
        )
      } catch (error) {
        console.error(error)
        dialog.showMessageBox({
          type: 'error',
          message: 'Could not parse Fountain script.\n' + error.message,
        })
      }
    })
  }
}

const findOrCreateProjectFolder = (scriptDataObject) => {
  // check for storyboard.settings file
  if (fs.existsSync(path.join(currentPath, 'storyboard.settings'))) {
    // project already exists
    let boardSettings = JSON.parse(fs.readFileSync(path.join(currentPath, 'storyboard.settings')))
    if (!boardSettings.lastScene) {
      boardSettings.lastScene = 0
    }

    switch (path.extname(currentFile)) {
      case '.fdx':
        // console.log('got existing .fdx project data')
        setWatchedScript()
        addToRecentDocs(currentFile, scriptDataObject[3])
        loadStoryboarderWindow(currentFile, scriptDataObject[0], scriptDataObject[1], scriptDataObject[2], boardSettings, currentPath)
        break
      case '.fountain':
        // console.log('got existing .fountain project data')
        setWatchedScript()
        addToRecentDocs(currentFile, scriptDataObject[3])
        loadStoryboarderWindow(currentFile, scriptDataObject[0], scriptDataObject[1], scriptDataObject[2], boardSettings, currentPath)
        break
    }

  } else {
    // create
    currentScriptDataObject = scriptDataObject
    newWindow.webContents.send('setTab', 1)
    newWindow.show()
    // wait for 'createNew' via ipc, which triggers createAndLoadProject
  }
}

let openDialogue = () => {
  dialog.showOpenDialog({
    title: "Open Script or Storyboarder",
    filters:[
      {
        name: 'Screenplay or Storyboarder',
        extensions: [
          'storyboarder',
          'fountain',
          'fdx'
        ]
      },
    ]}, filenames => {
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

const processFdxData = fdxObj => {
  try {
    ensureFdxSceneIds(fdxObj)
  } catch (err) {
    throw new Error('Could not add scene ids to Final Draft data.\n' + error.message)
    return
  }

  let scriptData = importerFinalDraft.importFdxData(fdxObj)

  let locations = importerFinalDraft.getScriptLocations(scriptData)
  let characters = importerFinalDraft.getScriptCharacters(scriptData)

  let metadata = {
    type: 'script',

    // TODO is this metadata needed?
    //
    // sceneBoardsCount: 0,
    // sceneCount: 0,
    // totalMovieTime: 0,

    title: path.basename(currentFile, path.extname(currentFile))
  }

  return [scriptData, locations, characters, metadata]
}

let processFountainData = (data, create, update) => {
  let scriptData = fountain.parse(data, true)
  let locations = fountainDataParser.getLocations(scriptData.tokens)
  let characters = fountainDataParser.getCharacters(scriptData.tokens)
  scriptData = fountainDataParser.parse(scriptData.tokens)
  let metadata = {type: 'script', sceneBoardsCount: 0, sceneCount: 0, totalMovieTime: 0}

  let boardsDirectoryFolders = fs.existsSync(currentPath)
    ? fs.readdirSync(currentPath).filter(file => fs.statSync(path.join(currentPath, file)).isDirectory())
    : []

  // fallback title in case one is not provided
  metadata.title = path.basename(currentFile, path.extname(currentFile))

  for (var node of scriptData) {
    switch (node.type) {
      case 'title':
        if (node.text) { metadata.title = node.text.replace(/<(?:.|\n)*?>/gm, '') }
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

  let scenesWithSceneNumbers = scriptData.reduce(
    (coll, node) =>
      (node.type === 'scene' && node.scene_number)
        ? coll + 1
        : coll
  , 0)
  if (scenesWithSceneNumbers === 0) throw new Error('Could not find any numbered scenes in this Fountain script.')

  switch (scriptData[scriptData.length-1].type) {
    case 'section':
      metadata.totalMovieTime = scriptData[scriptData.length-1].time + scriptData[scriptData.length-1].duration
      break
    case 'scene':
      let lastNode = scriptData[scriptData.length-1]['script'][scriptData[scriptData.length-1]['script'].length-1]
      metadata.totalMovieTime = lastNode.time + lastNode.duration
      break
  }

  // unused 
  // if (update) {
  //   mainWindow.webContents.send('updateScript', 1)//, diffScene)
  // }

  return [scriptData, locations, characters, metadata]
}

const onScriptFileChange = (eventType, filepath, stats) => {
  if (eventType === 'change') {

    // check last modified to determine if we should reload
    let lastModified = fs.statSync(currentFile).mtimeMs
    if (currentFileLastModified && (lastModified === currentFileLastModified)) {
      // file hasn't changed. cancel.
      return
    }
    currentFileLastModified = lastModified

    // load
    let data = fs.readFileSync(filepath, 'utf-8')

    if (path.extname(filepath) === '.fountain') {
      try {
        // write scene ids for any new scenes
        data = ensureFountainSceneIds(filepath, data)
        let [scriptData, locations, characters, metadata] = processFountainData(data, false, false)
        mainWindow.webContents.send('reloadScript', [scriptData, locations, characters])
      } catch (error) {
        dialog.showMessageBox({
          type: 'error',
          message: 'Could not reload script.\n' + error.message
        })
      }

    } else if (path.extname(filepath) === '.fdx') {
      let parser = new xml2js.Parser()
      parser.parseString(data, (err, fdxObj) => {
        if (err) {
          dialog.showMessageBox({
            type: 'error',
            message: 'Could not parse Final Draft XML.\n' + error.message,
          })
          return
        }

        try {
          ensureFdxSceneIds(fdxObj)
          let [scriptData, locations, characters, metadata] = processFdxData(fdxObj)
          mainWindow.webContents.send('reloadScript', [scriptData, locations, characters])
        } catch (error) {
          dialog.showMessageBox({
            type: 'error',
            message: 'Could not reload script.\n' + error.message
          })
        }
      })
    }
  }
}

const setWatchedScript = () => {
  if (scriptWatcher) { scriptWatcher.close() }

  scriptWatcher = chokidar.watch(currentFile, {
    disableGlobbing: true // treat file strings as literal file names
  })
  scriptWatcher.on('all', onScriptFileChange)
}

const ensureFdxSceneIds = fdxObj => {
  let added = importerFinalDraft.insertSceneIds(fdxObj)

  if (added.length) {
    let builder = new xml2js.Builder({
      xmldec: {
        version: '1.0',
        encoding: 'UTF-8',
        standalone: false
      }
    })
    let xml = builder.buildObject(fdxObj)
    fs.writeFileSync(currentFile, xml)

    dialog.showMessageBox({
      type: 'info',
      message: 'We added scene IDs to the Final Draft script',
      detail: "Scene IDs are what we use to make sure we put the storyboards in the right place. " + 
              "If you have your script open in an editor, you should reload it. " +
              "Also, you can change your script around as much as you want, "+
              "but please don't change the scene IDs.",
      buttons: ['OK']
    })
  }
}

const ensureFountainSceneIds = (filePath, data) => {
  let sceneIdScript = fountainSceneIdUtil.insertSceneIds(data)

  if (sceneIdScript[1]) {
    dialog.showMessageBox({
      type: 'info',
      message: 'We added scene IDs to your fountain script.',
      detail: "Scene IDs are what we use to make sure we put the storyboards in the right place. If you have your script open in an editor, you should reload it. Also, you can change your script around as much as you want, but please don't change the scene IDs.",
      buttons: ['OK']
    })

    fs.writeFileSync(filePath, sceneIdScript[0])
    data = sceneIdScript[0]
  }

  return data
}


// unused
// let getSceneDifference = (scriptA, scriptB) => {
//   let i = 0
//   for (var node of scriptB) {
//     if(!scriptA[i]) {
//       return i
//     }
//     if (JSON.stringify(node) !== JSON.stringify(scriptA[i])) {
//       return i
//     }
//     i++
//   }
//   return false
// }


////////////////////////////////////////////////////////////
// new functions
////////////////////////////////////////////////////////////

const createAndLoadScene = aspectRatio =>
  new Promise((resolve, reject) => {
    dialog.showSaveDialog({
      title: "New Storyboard",
      buttonLabel: "Create",
    },
    async filename => {
      if (filename) {
        console.log(filename)

        if (fs.existsSync(filename)) {
          if (fs.lstatSync(filename).isDirectory()) {
            console.log('\ttrash existing folder', filename)
            await trash(filename)
          } else {
            dialog.showMessageBox(null, {
              message: "Could not overwrite file " + path.basename(filename) + ". Only folders can be overwritten." 
            })
            return reject(null)
          }
        }

        fs.mkdirSync(filename)

        let boardName = path.basename(filename)
        let filePath = path.join(filename, boardName + '.storyboarder')

        let newBoardObject = {
          version: pkg.version,
          aspectRatio: aspectRatio,
          fps: prefModule.getPrefs().lastUsedFps || 24,
          defaultBoardTiming: prefs.defaultBoardTiming,
          boards: []
        }
  
        fs.writeFileSync(filePath, JSON.stringify(newBoardObject))
        fs.mkdirSync(path.join(filename, 'images'))
  
        addToRecentDocs(filePath, newBoardObject)
        loadStoryboarderWindow(filePath)
  
        analytics.event('Application', 'new', newBoardObject.aspectRatio)

        resolve()
      } else {
        reject()
      }
    })
  })

const createAndLoadProject = aspectRatio => {
  fs.ensureDirSync(currentPath)

  let boardSettings = {
    lastScene: 0,
    aspectRatio
  }
  fs.writeFileSync(path.join(currentPath, 'storyboard.settings'), JSON.stringify(boardSettings))

  setWatchedScript()
  addToRecentDocs(currentFile, currentScriptDataObject[3])
  loadStoryboarderWindow(currentFile, currentScriptDataObject[0], currentScriptDataObject[1], currentScriptDataObject[2], boardSettings, currentPath)
}

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
    titleBarStyle: 'hiddenInset',
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
  loadingStatusWindow.loadURL(`file://${__dirname}/../loading-status.html?name=${encodeURIComponent(projectName)}`)
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
      message: 'Your Storyboarder file is not saved. Are you sure you want to close the workspace?'
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

      // stop watching any fountain files
      if (scriptWatcher) { scriptWatcher.close() }

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

ipcMain.on('setTool', (e, arg) =>
  mainWindow.webContents.send('setTool', arg))

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

ipcMain.on('toggleTimeline', () =>
  mainWindow.webContents.send('toggleTimeline'))

//////////////////
// Welcome Window
//////////////////


ipcMain.on('openFile', (e, arg)=> {
  openFile(arg)
})

ipcMain.on('openDialogue', (e, arg) => {
  openDialogue()
})

ipcMain.on('importImagesDialogue', (e, arg)=> {
  importImagesDialogue()
  mainWindow.webContents.send('importNotification', arg)
})

ipcMain.on('createNew', (e, aspectRatio) => {
  newWindow.hide()

  let isProject = currentFile && (path.extname(currentFile) === '.fdx' || path.extname(currentFile) === '.fountain')
  if (isProject) {
    createAndLoadProject(aspectRatio)
  } else {
    createAndLoadScene(aspectRatio)
  }
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

ipcMain.on('stopAllSounds', event =>
  mainWindow.webContents.send('stopAllSounds'))

ipcMain.on('addAudioFile', event =>
  mainWindow.webContents.send('addAudioFile'))

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

ipcMain.on('exportVideo', (event, arg) => {
  mainWindow.webContents.send('exportVideo', arg)
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
ipcMain.on('exportWeb', (event, arg) => {
  mainWindow.webContents.send('exportWeb', arg)
})
ipcMain.on('exportZIP', (event, arg) => {
  mainWindow.webContents.send('exportZIP', arg)
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

ipcMain.on('saveAs', (event, arg) => {
  mainWindow.webContents.send('saveAs', arg)
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

  !loadingStatusWindow.isDestroyed() && loadingStatusWindow.hide()

  if (!mainWindow) return
  mainWindow.show()
  // only after the workspace is ready will it start getting future focus events
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('focus')

    // if we're on a script-based project ...
    let isProject = currentFile && (path.extname(currentFile) === '.fdx' || path.extname(currentFile) === '.fountain')
    if (isProject) {
      // force an onScriptFileChange call
      onScriptFileChange('change', currentFile)
    }
  })
})

ipcMain.on('exportPrintablePdf', (event, sourcePath, fileName) => {
  mainWindow.webContents.send('exportPrintablePdf', sourcePath, fileName)
})

ipcMain.on('toggleAudition', (event) => {
  mainWindow.webContents.send('toggleAudition')
})

// uploader > main-window
ipcMain.on('signInSuccess', (event, response) => {
  mainWindow.webContents.send('signInSuccess', response)
})

ipcMain.on('revealShotGenerator',
  event => mainWindow.webContents.send('revealShotGenerator'))
