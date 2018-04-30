/* global describe it */

// npx floss -p test/preferences.renderer.test.js

const assert = require('assert')

const toolbarReducer = require('../src/js/shared/reducers/toolbar')
const preferencesReducer = require('../src/js/shared/reducers/preferences')

describe('toolbar preferences (renderer)', () => {
  it('can load from prefs.json', () => {
    // load prefs json
    // merge in state from prefs data (if it exists) to toolbar state

    let toolbarState = toolbarReducer(undefined, { type: undefined })
    // has default captions state
    assert.equal(toolbarState.captions, false)

    const preferencesState = {
      toolbar: {
        tools: {
          pencil: {
            color: 0xff0000
          }
        },
        captions: true
      }
    }

    toolbarState = toolbarReducer(undefined, { type: 'TOOLBAR_MERGE_FROM_PREFERENCES', payload: preferencesState })

    // pencil color changed
    assert.equal(toolbarState.tools.pencil.color, 0xff0000)
    // pencil size same
    assert.equal(toolbarState.tools.pencil.size, 4)

    // toolbar eraser should have a default color
    assert.equal(toolbarState.tools.eraser.color, 0xffffff)

    // sets caption state from preferences
    assert.equal(toolbarState.captions, true)
  })

  it('can save to prefs.json', () => {
    // grab toolbar state
    // merge useful values into prefs state
    // save to a file

    // select the pencil
    let toolbarState = toolbarReducer(undefined, { type: 'TOOLBAR_TOOL_CHANGE', payload: 'pencil' })

    // the pencil is not red
    assert.notEqual(toolbarState.tools['pencil'].color, 0xff0000)

    // change its color to red
    toolbarState = toolbarReducer(toolbarState, { type: 'TOOLBAR_TOOL_SET', payload: { color: 0xff0000 } })

    toolbarState = toolbarReducer(toolbarState, { type: 'TOOLBAR_CAPTIONS_SET', payload: true })

    // merge into preferences
    // captions are included
    // guides and onion skin are ignored intentionally
    let preferencesState = preferencesReducer(undefined, {
      type: 'PREFERENCES_MERGE_FROM_TOOLBAR',
      payload: {
        ...toolbarState
      }
    })

    // preferences should now have a red pencil
    assert.equal(preferencesState.toolbar.tools['pencil'].color, 0xff0000)

    // preferences should now have captions enabled
    assert.equal(preferencesState.toolbar.captions, true)

    // TODO erase color doesn't matter. should we even bother storing it to prefs?

    // merge onto other prefs
    // save to a file
  })
})
