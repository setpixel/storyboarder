// TODO better name than etags?
// TODO store in boardData instead, but exclude from JSON?
// TODO use mtime trick like we do for layers and posterframes?
// cache buster for thumbnails
let etags = {}
const setEtag = absoluteFilePath => { etags[absoluteFilePath] = Date.now() }
const getEtag = absoluteFilePath => etags[absoluteFilePath] || '0'

module.exports = {
    setEtag,
    getEtag
}