const os = require('os')
const path = require('path')
const dns = require('dns')

const express = require('express')
const app = express()
const http = require('http').Server(app)

const log = require('electron-log')

const portNumber = 1234

const { getSerializedState } = require('../shared/reducers/shot-generator')

class XRServer {
  constructor ({ store }) {
    app.use(express.json())

    app.use('/', express.static(
      path.join(__dirname, 'dist')
    ))

    app.use('/data/system', express.static(
      path.join(__dirname, '..', '..', 'data', 'shot-generator')
    ))

    app.use('/data/user', express.static(
      path.join(path.dirname(store.getState().meta.storyboarderFilePath), 'models')
    ))

    app.use('/data/snd', express.static(
      path.join(__dirname, 'public', 'snd')
    ))

    app.get('/', function(req, res) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    })

    app.get('/state.json', (req, res) => {
      const state = store.getState()
      const { aspectRatio } = state

      res.json({
        ...getSerializedState(state),

        aspectRatio
      })
    })

    app.post('/state.json', (req, res) => {
      let payload = req.body
      store.dispatch({ type: 'LOAD_SCENE', payload })
      res.status(200).send({ ok: true })
    })

    http.on('error', err => {
      that.emit('error', err)
    })

    http.listen(portNumber, function() {
      let desc = `XRServer running at`

      let hostname = os.hostname()

      dns.lookup(hostname, function (err, addr) {
        if (err) {
          // use IP address instead of .local
          let ip
          if (hostname.match(/\.local$/)) {
            ip = Object.values(os.networkInterfaces()).reduce(
              (r, list) =>
                r.concat(
                  list.reduce(
                    (rr, i) =>
                      rr.concat((i.family === "IPv4" && !i.internal && i.address) || []),
                    []
                  )
                ),
              []
            )
          }
          if (ip) {
            log.info(`${desc} http://${ip}:${portNumber}`)

          } else {
            log.info(`${desc} http://${hostname}:${portNumber}`)
          }
          return
        }

        log.info(`${desc} http://${addr}:${portNumber}`)
      })
    })
  }
}

module.exports = XRServer
