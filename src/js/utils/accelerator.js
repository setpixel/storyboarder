var os = require('os')

const IS_MAC = os.platform() === 'darwin'

const CODE_CMD_OR_CTRL = IS_MAC ? 'Command' : 'Control'
const CMD_OR_CTRL = IS_MAC ? 'Cmd' : 'Ctrl'

const MODIFIER_MAP = {
  'Command': '\u2318',
  'Cmd': '\u2318',
  'CommandOrControl': CODE_CMD_OR_CTRL,
  'CmdOrCtrl': CMD_OR_CTRL,
  'Super': '\u2318',
  'Control': '\u2303',
  'Ctrl': '\u2303',
  'Shift': '\u21e7',
  'Alt': IS_MAC ? 'Option' : 'Alt', // \u2325
  'Plus': '='
}

const KEY_MAP = {
  'Left': '◄',
  'Right': '►'
}

// see https://www.npmjs.com/package/electron-accelerator-formatter
const acceleratorAsHtml = (accelerator, options = { animated: true }) => {
  let splitOn
  if (accelerator.includes('|')) {
    splitOn = "|"
  } else {
    splitOn = "+"
  }
  accelerator = accelerator
    .split(splitOn)
    .map(function(k) {
      let m = MODIFIER_MAP[k]
      if (m) {
        return `<kbd class="modifier${ options.animated ? ' modifier-key-anim' : ''}">${m}</kbd>`
      } else {
        return `<kbd ${ options.animated ? 'class="action-key-anim"' : ''}>${KEY_MAP[k] || k}</kbd>`
      }
    })

  if (splitOn == "|") {
    accelerator = accelerator.join('OR')
  } else {
    accelerator = accelerator.join("+")
  }
  return accelerator
}

module.exports = {
  acceleratorAsHtml
}