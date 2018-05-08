/*
UNDO STACK

TODO:
  add music feedback emmisions

Inspired by:
http://redux.js.org/docs/recipes/ImplementingUndoHistory.html
https://github.com/omnidan/redux-undo/blob/master/src/reducer.js
https://github.com/TheSeamau5/elm-undo-redo/blob/master/src/UndoList.elm
*/

const EventEmitter = require('events').EventEmitter
module.exports = new EventEmitter()

const util = require('./utils/index')

class UndoList {
  constructor () {
    this.state = {
      past: [],
      present: null,
      future: []
    }
    this.maxLength = 25

    this.debugMode = false
  }

  lengthWithoutFuture () {
    return this.state.past.length + 1
  }

  getCanUndo () {
    console.log('can undo?', this.state.past.length > 0)
    return this.state.past.length > 0
  }

  getCanRedo () {
    console.log('can redo?', this.state.future.length > 0)
    return this.state.future.length > 0
  }

  undo () {
    const { past, present, future } = this.state

    if (past.length <= 0) return

    const newFuture = present !== null
      ? [
        present,
        ...future
      ] : future

    const newPresent = past[past.length - 1]

    // remove last element from past
    const newPast = past.slice(0, past.length - 1)

    this.state = {
      past: newPast,
      present: newPresent,
      future: newFuture
    }

    if (this.debugMode) this.print()
  }
  
  redo () {
    const { past, present, future } = this.state

    if (future.length <= 0) return

    const newPast = present !== null
      ? [
        ...past,
        present
      ] : past

    const newPresent = future[0]

    // remove element from future
    const newFuture = future.slice(1, future.length)

    this.state = {
      future: newFuture,
      present: newPresent,
      past: newPast
    }

    if (this.debugMode) this.print()
  }

  insert (value) {
    const { past, present, future } = this.state

    const historyOverflow = this.lengthWithoutFuture() >= this.maxLength

    const pastSliced = past.slice(historyOverflow ? 1 : 0)
    const newPast = present != null
      ? [
        ...pastSliced,
        present
      ] : pastSliced

    this.state = {
      past: newPast,
      present: value,
      future: []
    }

    if (this.debugMode) this.print()
  }

  print () {
    const { past, present, future } = this.state
    if (!this.debugEl) {
      this.debugEl = document.createElement('div')
      this.debugEl.style = `
        position: absolute;
        top: 0;
        right: 0;
        padding: 10px;
        font-family: monospace;
        font-size: 11px;
        width: 500px;
        background-color: black;
        color: white;
        white-space: pre;
        line-height: 15px;
      `
      document.body.appendChild(this.debugEl)
    }

    let clear = () =>
      this.debugEl.innerHTML = ''

    let trace = (...args) =>
      this.debugEl.innerHTML += '<div>' + args.join(' ') + '</div>'

    let boardIndexes = arr =>
      arr.map(b => parseInt(b.url.replace('board-', ''), 10)).join(', ')

    let stringOf = value =>
      util.isUndefined(value) ? 'n/a' : value

    let describe = state => {
      if (state.type == 'image') {
        let layersDesc = state.layers.map(layerData =>
          `index: ${layerData.index} id:${layerData.source.id}`)
        let desc = `
          scene: ${stringOf(state.sceneId)} 
          board: ${stringOf(state.boardIndex)} 
          layers: [ ${layersDesc.join(', ')} ]
        `
        return [state.type, desc.replace(/\s+/g, ' ')]
      } else if (state.type == 'scene') {
        return [state.type, boardIndexes(state.sceneData.boards)].join(' ')
      }
    }

    clear()
    let n = 0
    for (let state of past) {
      trace(' ', n++, describe(state))
    }

    trace('▸', n++, describe(this.state.present))

    for (let state of future) {
      trace(' ', n++, describe(state))
    }
  }
}

let undoList = new UndoList()

// determine if image state A is equal to state B
const imageStateContextsEqual = (a, b) => {
  if (
    a && b &&                                               // are both states present?

    a.type == 'image' &&                                    // are they both image states?
    b.type == 'image' &&

    a.sceneId == b.sceneId &&                               // are they for the same board on the same scene?
    a.boardIndex == b.boardIndex &&

    a.layers.length == b.layers.length                      // do they have the same number of layers?
  ) {
    // are the layers the same?
    for (let n = 0; n < a.layers.length; n++) {
      if (
        a.layers[n].index !== b.layers[n].index             // skip if their indices differ
      ) {
        return false
      }
    }

    return true
  } else {
    return false
  }
}

//
// addImageData(isBefore, state)
//
// isBefore:    true, if we're storing before an operation
//              false, if we're storing after an operation
//
// state:       {
//                type: 'image',
//                sceneId: n,
//                boardIndex, i,
//                layers: [         // NOTE for proper comparison, must be in the same order each time
//                  index,
//                  source          // reference to an HTMLCanvas to be stored
//                ]
//              }
//
const addImageData = (isBefore, newState) => {
  // is this a snapshot of the state BEFORE the operation?
  if (isBefore) {
    // prevent duplicates in undo history
    if (
      undoList.state.present && // don't skip (and always store before state) if we have no known snapshot
      imageStateContextsEqual(undoList.state.present, newState) // ... but also check we have just stored this same state
    ) {
      return
    }
  }

  undoList.insert(newState)
}

const sceneStateContextsEqual = (a, b) =>
  a && b &&
  a.type == 'scene' && b.type == 'scene' &&
  a.sceneId == b.sceneId

const addSceneData = (isBefore, state) => {
  const newState = {
    type: 'scene',
    sceneId: state.sceneId,
    sceneData: state.boardData
  }

  // are we being asked to take a before snapshot?
  if (isBefore) {
    // ... but is the most recent state the same as the inserting state?
    if (undoList.state.present && // always store before state if we have no known snapshot
        sceneStateContextsEqual(undoList.state.present, newState)) {
      return
    }
  }

  undoList.insert(newState)
}

const cloneState = originalState => {
  //
  // TODO do we still need this conversion from reference to value?
  //
  let newState = util.stringifyClone(originalState)

  // re-insert the references to source (HTMLCanvas)
  // if (originalState.type === 'image') {
  //   for (let n = 0; n < newState.layers.length; n++) {
  //     newState.layers[n].source = originalState.layers[n].source
  //   }
  // }

  return newState
}

const undo = () => {
  undoList.undo()
  if (undoList.state.present) {
    let state = cloneState(undoList.state.present)
    module.exports.emit('undo', state)
  }
}

const redo = () => {
  undoList.redo()
  if (undoList.state.present) {
    let state = cloneState(undoList.state.present)
    module.exports.emit('redo', state)
  }
}

module.exports.addImageData = addImageData
module.exports.addSceneData = addSceneData
module.exports.undo = undo
module.exports.redo = redo
module.exports.getCanUndo = () => undoList.getCanUndo()
module.exports.getCanRedo = () => undoList.getCanRedo()
