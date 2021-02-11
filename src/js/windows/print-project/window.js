const { ipcRenderer } = require('electron')
const { interpret } = require('xstate')
const React = require('react')
const ReactDOM = require('react-dom')

const { getProjectData } = require('./data')
const { machine: printProjectMachine } = require('./machine')
const { generateToCanvas, exportToFile } = require('./services')
const { PrintApp } = require('./components')

const getData = () => ipcRenderer.invoke('exportPDF:getData')




const start = async () => {
  let project
  let canvas

  project = await getProjectData(await getData())

  canvas = document.createElement('canvas')
  document.querySelector('.output .inner').appendChild(canvas)

  const service = interpret(
    printProjectMachine
      .withConfig({
        services: {
          generateToCanvas,
          exportToFile 
        }
      })
      .withContext({
        ...printProjectMachine.context,
        project,
        canvas
      })
  )
  .onTransition((state, event) => console.log(JSON.stringify(event) + ' ➤ ' + JSON.stringify(state.value)))
  .onDone(() => window.close())
  .start()

  ReactDOM.render(
    React.createElement(PrintApp, { service }),
    document.querySelector('.input')
  )

  document.addEventListener('keydown', event => {
    switch (event.key) {
      case 'Escape':
        service.send('CLOSE')
        break
    }
  })
}
start()
