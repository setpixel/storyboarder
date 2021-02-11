const { BrowserWindow } = require('electron')
const path = require('path')

let win

const show = async ({ parent }) => {
  if (win) {
    return
  }

  let [w, h] = parent.getContentSize()
  let height = Math.floor(h * 0.9)
  let width = Math.floor(height * (w / h))

  win = new BrowserWindow({
    parent,
    show: false,

    width,
    height,

    backgroundColor: '#333333',

    center: true,
    resizable: false,

    modal: true,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  })
  win.on('closed', () => { win = null })
  await win.loadFile(path.join(__dirname, 'index.html'))
  win.show()
}

module.exports = {
  show
}
