const getStream = require('get-stream')

const toPdfJs = async doc => {
  let result = await getStream.buffer(doc)
  return atob(Buffer.from(result).toString('base64'))
}

module.exports = toPdfJs
