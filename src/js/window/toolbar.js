const { remote } = require('electron')
const EventEmitter = require('events').EventEmitter
const Color = require('color-js')

const Detector = require('../vendor/Detector')

const prefsModule = remote.require('./../js/prefs')
const util = require('../utils/index')
const sfx = require('../wonderunit-sound')
const observeStore = require('../shared/helpers/observeStore')

// TODO why even have these constants if we don't use them consistently?
const BRUSH_PENCIL = 'pencil'
const BRUSH_LIGHT_PENCIL = 'light-pencil'
const BRUSH_PEN = 'pen'
const BRUSH_BRUSH = 'brush'
const BRUSH_NOTE_PEN = 'note-pen'
const BRUSH_ERASER = 'eraser'

const initialState = {
  transformMode: null,
  captions: false,

  brush: null,

  brushes: {
    [BRUSH_PENCIL]: {
      kind: BRUSH_PENCIL,
      size: 7,
      spacing: 0.25,
      flow: 0.4,
      hardness: 0.5,
      opacity: 0.4,
      color: Color('#121212'),
      palette: [
        Color('#373737'), Color('#223131'), Color('#121212')
      ]
    },
    [BRUSH_LIGHT_PENCIL]: {
      kind: BRUSH_LIGHT_PENCIL,
      size: 20,
      spacing: 0.12,
      flow: 0.4,
      hardness: 0.8,
      opacity: 0.3,
      color: Color('#90CBF9'),
      palette: [
        Color('#CFCFCF'), Color('#9FA8DA'), Color('#90CBF9')
      ]
    },
    [BRUSH_PEN]: {
      kind: BRUSH_PEN,
      size: 20,
      spacing: 0.02,
      flow: 1,
      hardness: 0.7,
      opacity: 0.9,
      color: Color('#000000'),
      palette: [
        Color('#373737'), Color('#223131'), Color('#000000')
      ]
    },
    [BRUSH_BRUSH]: {
      kind: BRUSH_BRUSH,
      size: 100,
      spacing: 0.03,
      flow: 0.7,
      hardness: 1,
      opacity: 0.2,
      color: Color('#9E9E9E'),
      palette: [
        Color('#4DABF5'), Color('#607D8B'), Color('#9E9E9E')
      ]
    },
    [BRUSH_NOTE_PEN]: {
      kind: BRUSH_NOTE_PEN,
      size: 10,
      color: '#f00',
      spacing: 0.02,
      flow: 0.9,
      hardness: 0.9,
      opacity: 0.8,
      color: Color('#F44336'),
      palette: [
        Color('#4CAF50'), Color('#FF9800'), Color('#F44336')
      ]
    },
    [BRUSH_ERASER]: {
      kind: BRUSH_ERASER,
      size: 30,

      spacing: 0.05,
      flow: 6.0,
      hardness: 0.9,
      opacity: 1.0,

      color: Color('#ffffff'),
      palette: [
        Color('#ffffff'), Color('#ffffff'), Color('#ffffff')
      ]
    }
  },

  grid: false,
  center: false,
  thirds: false,
  perspective: false,
  
  onion: false
}

class Toolbar extends EventEmitter {
  constructor (store, el) {
    super()

    this.store = store

    // TODO PREFS ARE JANK AS FUCK. NEED TO REDO THIS
    let prefState
    prefState = util.stringifyClone(prefsModule.getPrefs('toolbar'))

    if (prefState  && prefState.toolbarState) {
      for (var key in prefState.toolbarState.brushes) {
        let paletteValue = prefState.toolbarState.brushes[key].color
        let color = new Color({red: paletteValue.red, green: paletteValue.green, blue: paletteValue.blue, alpha: paletteValue.alpha})
        prefState.toolbarState.brushes[key].color = color
        let newPalette = []
        for (var i = 0; i < prefState.toolbarState.brushes[key].palette.length; i++) {
          paletteValue = prefState.toolbarState.brushes[key].palette[i]
          color = new Color({red: paletteValue.red, green: paletteValue.green, blue: paletteValue.blue, alpha: paletteValue.alpha})
          newPalette.push(color)
        }
        prefState.toolbarState.brushes[key].palette = newPalette
      }
      this.state = prefState.toolbarState
      this.state.grid   = false
      this.state.center = false
      this.state.thirds = false
      this.state.perspective = false
      this.state.onion = false
      //this.state.captions   = false
    } else {
      this.state = initialState
    }


    this.el = el
    this.swatchTimer = null
    this.swatchDelay = 2000

    this.onButtonDown = this.onButtonDown.bind(this)
    this.onButtonOver = this.onButtonOver.bind(this)
    this.onSwatchUp = this.onSwatchUp.bind(this)
    this.onSwatchDown = this.onSwatchDown.bind(this)
    this.onBrushSizePointerDown = this.onBrushSizePointerDown.bind(this)

    this.attachedCallback(this.el)

    // listen for changes to the toolbar state
    observeStore(this.store, state => state.toolbar, this.render.bind(this), true)
  }

  savePrefs () {
    prefsModule.set('toolbarState', this.state)
  }

  setState (newState) {
    this.state = Object.assign(this.state, newState)
    if (newState.brush) {
      // the brush changed
      this.emit('brush', this.state.brush, this.getBrushOptions())
      this.store.dispatch({ type: 'TOOLBAR_TOOL_CHANGE', payload: this.state.brush, meta: { scope: 'local' } })
    }
    this.render()
  }

  changeBrushSize (direction, fine = false) {
    let min = 1
    let max = 256
    let currSize = this.state.brushes[this.state.brush].size

    if (fine) {
      currSize += direction
    } else {
      if (currSize < 5) {
        currSize += direction
      } else {
        currSize *= direction > 0 ? 1.2 : 0.8
      }
    }

    if (currSize < min) currSize = min
    if (currSize > max) currSize = max

    this.state.brushes[this.state.brush].size = currSize

    this.emit('brush:size', this.getBrushOptions().size)
    this.render()
  }

  changeCurrentColor (color) {
    this.state.brushes[this.state.brush].color = color
    this.emit('brush:color', this.getBrushOptions().color)
    this.render()
  }

  changePaletteColor (brush, index, color) {
    // NOTE ignores passed brush and uses current brush,
    //      in case we changed since we invoked the color picker
    this.state.brushes[this.state.brush].palette[index] = color
    this.render()
  }

  attachedCallback () {
    const immediateButtons = [...this.el.querySelectorAll('.button:not([id^="toolbar-palette-color"])')]
    const swatchButtons = [...this.el.querySelectorAll('.button[id^="toolbar-palette-color"]')]
    const brushSizeButtons = [...this.el.querySelectorAll('.toolbar-brush-size-controls_inc, .toolbar-brush-size-controls_dec')]
    const overableControls = [].concat(
      immediateButtons,
      swatchButtons,
      brushSizeButtons
    )

    for (let brushSizeButtonEl of brushSizeButtons) {
      brushSizeButtonEl.addEventListener('pointerdown', this.onBrushSizePointerDown)
    }

    for (let buttonEl of immediateButtons) {
      buttonEl.addEventListener('pointerdown', this.onButtonDown)
    }

    for (let buttonEl of swatchButtons) {
      //buttonEl.addEventListener('pointerup', this.onSwatchUp)
      buttonEl.addEventListener('pointerdown', this.onSwatchDown)
    }

    for (let el of overableControls) {
      el.addEventListener('pointerenter', this.onButtonOver)
    }    
  }

  // TODO cleanup, remove listeners
  // detachedCallback () {}

  getEventTargetSelection (target) {
    // interpret brush tool icon div clicks
    if (target.classList.contains('icon')) {
      target = target.parentNode
    }

    return target.id.replace(/^toolbar-/, '')
  }

  cloneOptions (opt) {
    return {
      kind: opt.kind,
      size: opt.size,
      spacing: opt.spacing,
      flow: opt.flow,
      hardness: opt.hardness,
      opacity: opt.opacity,
      color: opt.color.clone(),
      palette: opt.palette.map(color => color.clone())
    }
  }

  getBrushOptions (brushName) {
    brushName = brushName || this.state.brush
    return this.cloneOptions(this.state.brushes[brushName])
  }

  onButtonDown (event) {
    let selection = this.getEventTargetSelection(event.target)

    const state = this.store.getState()

    switch (selection) {
      // brushes
      case 'light-pencil':
      case 'pencil':
      case 'pen':
      case 'brush':
      case 'note-pen':
      case 'eraser':
        if (state.toolbar.activeTool !== selection) {
          if (this.state.transformMode) this.emit('cancelTransform')
          this.store.dispatch({ type: 'TOOLBAR_TOOL_CHANGE', payload: selection, meta: { scope: 'local' } })
        }
        break

      case 'trash':
        this.emit('trash')
        break
      // case 'fill':
      //   this.emit('fill', this.state.brushes[this.state.brush].color)
      //   break

      case 'move':
        this.state.transformMode == 'move'
          ? this.emit('cancelTransform')
          : this.emit('move')
        break
      case 'scale':
        this.state.transformMode == 'scale'
          ? this.emit('cancelTransform')
          : this.emit('scale')
        break

      // undo/redo
      case 'undo':
        this.emit('undo')
        break
      case 'redo':
        this.emit('redo')
        break

      case 'current-color':
        if (this.state.brush == 'eraser') break
        this.emit('current-color-picker', this.state.brushes[this.state.brush].color)
        break

      case 'grid':
        this.setState({ grid: !this.state.grid })
        this.emit('grid', this.state.grid)
        break
      case 'center':
        this.setState({ center: !this.state.center })
        this.emit('center', this.state.center)
        break
      case 'thirds':
        this.setState({ thirds: !this.state.thirds })
        this.emit('thirds', this.state.thirds)
        break
      case 'perspective':
        this.setState({ perspective: !this.state.perspective })
        this.emit('perspective', this.state.perspective)
        break
      case 'onion':
        this.setState({ onion: !this.state.onion })
        this.emit('onion', this.state.onion)
        break
      case 'captions':
        this.toggleCaptions()
        break
      case 'open-in-editor':
        this.emit('open-in-editor')
        break
      case 'pomodoro-rest':
        sfx.playEffect('metal')
        this.emit('pomodoro-rest')
        break
      case 'pomodoro-running':
      case 'pomodoro-running-status':
        this.emit('pomodoro-running')
        break

      default:
        // console.log('toolbar selection', selection)
        break
    }
  }

  onSwatchDown (event) {
    if (this.state.brush == 'eraser') return
    clearTimeout(this.swatchTimer)
    this.swatchTimer = setTimeout(this.onSwatchColorPicker.bind(this, event.target), this.swatchDelay)
    if (this.swatchTimer) {
      // timer is still running so we never showed the Color Picker
      let selection = this.getEventTargetSelection(event.target)
      switch(selection) {
        case 'palette-colorA':
          this.emit('current-set-color', this.getCurrentPalette()[0])
          break
        case 'palette-colorB':
          this.emit('current-set-color', this.getCurrentPalette()[1])
          break
        case 'palette-colorC':
          this.emit('current-set-color', this.getCurrentPalette()[2])
          break
      }
    }
    document.addEventListener('pointerup', this.onSwatchUp)
  }
  
  onSwatchColorPicker (target) {
    clearTimeout(this.swatchTimer)
    this.swatchTimer = null

    let selection = this.getEventTargetSelection(target)

    let brush = this.state.brush
    let index = ['palette-colorA', 'palette-colorB', 'palette-colorC'].indexOf(selection)
    let color = this.getCurrentPalette()[index]

    switch(selection) {
      case 'palette-colorA':
      case 'palette-colorB':
      case 'palette-colorC':
        this.emit('palette-color-picker', color, target, brush, index)
        break
    }
  }

  onSwatchUp (event) {
    if (this.state.brush == 'eraser') return

    clearTimeout(this.swatchTimer)
  }

  getCurrentPalette () {
    return this.state.brushes[this.state.brush].palette
  }

  getState () {
    return this.state
  }

  render () {
    const state = this.store.getState()

    for (let brushEl of this.el.querySelectorAll('.button[data-group=brushes]')) {
      brushEl.classList.toggle('active', brushEl.id === `toolbar-${state.toolbar.activeTool}`)
    }

    let btnMove = this.el.querySelector('#toolbar-move')
    let btnScale = this.el.querySelector('#toolbar-scale')
    switch (this.state.transformMode) {
      case 'move':
        btnMove.classList.add('active')
        btnScale.classList.remove('active')
        break
      case 'scale':
        btnScale.classList.add('active')
        btnMove.classList.remove('active')
        break
      default:
        btnScale.classList.remove('active')
        btnMove.classList.remove('active')
        break
    }
    
    let btnCaptions = this.el.querySelector('#toolbar-captions')
    if (this.state.captions) {
      btnCaptions.classList.add('active')
    } else {
      btnCaptions.classList.remove('active')
    }

    let gridEl = this.el.querySelector('#toolbar-grid')
    let centerEl = this.el.querySelector('#toolbar-center')
    let thirdsEl = this.el.querySelector('#toolbar-thirds')
    let perspectiveEl = this.el.querySelector('#toolbar-perspective')
    gridEl.classList.toggle('active', this.state.grid)
    centerEl.classList.toggle('active', this.state.center)
    thirdsEl.classList.toggle('active', this.state.thirds)
    perspectiveEl.classList.toggle('active', this.state.perspective)

    let onionEl = this.el.querySelector('#toolbar-onion')
    onionEl.classList.toggle('active', this.state.onion)

    if (this.state.brushes[this.state.brush].color) {
      this.el.querySelector('#toolbar-current-color .icon').style.backgroundColor = this.state.brushes[this.state.brush].color.toCSS()
    }

    const palette = this.getCurrentPalette()

    if (palette) {
      const paletteIcons = ['A', 'B', 'C'].map(letter => this.el.querySelector(`#toolbar-palette-color${letter} .icon`))
      paletteIcons[0].style.backgroundColor = palette[0].toCSS()
      paletteIcons[1].style.backgroundColor = palette[1].toCSS()
      paletteIcons[2].style.backgroundColor = palette[2].toCSS()
    }

    const brushSizeEl = this.el.querySelector('.toolbar-brush-size-controls_val')
    const brushSizeValue = this.getBrushOptions().size
    brushSizeEl.innerHTML = Math.round(brushSizeValue)

    // prevent perspective guide when WebGL is not available
    if (!Detector.webgl) {
      perspectiveEl.style.display = 'none'
    }
  }
  
  onBrushSizePointerDown (event) {
    let direction = parseInt(event.target.dataset.direction)
    this.changeBrushSize(direction, true)
  }

  toggleCaptions () {
    this.setState({ captions: !this.state.captions })
    this.emit('captions')
  }
  
  onButtonOver (event) {
    // console.log('onButtonOver', event)
    sfx.rollover()
  }

  startPomodoroTimer(data) {
    let elRest = document.querySelector('#toolbar-pomodoro-rest')
    elRest.style.display = 'none'
    let elRunning = document.querySelector('#toolbar-pomodoro-running')
    elRunning.style.display = 'flex'
    let elRunningStatus = document.querySelector('#toolbar-pomodoro-running-status')
    elRunningStatus.innerHTML = data.remainingFriendly
  }

  updatePomodoroTimer(data={remaining:0}) {
    let elRest = document.querySelector('#toolbar-pomodoro-rest')
    let elRunning = document.querySelector('#toolbar-pomodoro-running')
    let elRunningStatus = document.querySelector('#toolbar-pomodoro-running-status')
    switch(data.state) {
      case "running":
        elRunningStatus.innerHTML = data.remainingFriendly
        break
      case "completed":
        elRest.style.display = 'flex'
        elRunning.style.display = 'none'
        break
      case "rest":
        elRest.style.display = 'flex'
        elRunning.style.display = 'none'
    }
  }
}

module.exports = Toolbar
