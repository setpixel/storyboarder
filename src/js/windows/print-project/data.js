const fs = require('fs-extra')
const path = require('path')

const last = arr => arr[arr.length - 1]

const getDirectories = filepath =>
  fs.readdirSync(filepath)
    .filter(file =>
      fs.statSync(path.join(filepath, file)).isDirectory())

const parse = {
  titlePage: script => script.find(({ type }) => type == 'title'),
  sceneTitleFromFilePath: storyboarderFilePath => {
    let parts = path.basename(
      storyboarderFilePath,
      path.extname(storyboarderFilePath)
    ).split('-')
    return parts.length > 1
      ? parts.slice(0, -1).join('-')
      : parts[0]
  }
}

const sceneFromCurrent = current => {
  return ({
    ...current,
    title: parse.sceneTitleFromFilePath(current.storyboarderFilePath)
  })
}

const scenesFromScriptData = ({ filepath, current, scriptData }) => {
  let directoriesBySceneId = 
    Object.fromEntries(
      getDirectories(path.join(path.dirname(filepath), 'storyboards'))
        .filter(dir => dir.match(/-backup$/) == null)
        .map(name => [last(name.split('-')), name])
    )

  return scriptData
    .filter(({ type }) => type == 'scene')
    .map(scene => {
      if (scene.scene_number == current.sceneNumber) {
        return sceneFromCurrent(current)
      } else {
        let dir = directoriesBySceneId[last(scene.scene_id.split('-'))]
        let storyboarderFilePath = path.join(path.dirname(filepath), 'storyboards', dir, `${dir}.storyboarder`)
        return {
          sceneId: scene.scene_id,
          sceneNumber: scene.scene_number,
          storyboarderFilePath,
          title: scene.slugline,
          data: JSON.parse(fs.readFileSync(storyboarderFilePath, 'utf-8'))
        }
      }
    })
}

const getProjectData = async ({ currentFilePath, projectData }) => {
  let {
    currentBoardData,
    currentScene,
    currentStoryboarderFilePath,
    scriptData
  } = projectData

  let current = sceneFromCurrent({
    sceneId: null,
    sceneNumber: currentScene + 1,
    storyboarderFilePath: currentStoryboarderFilePath,
    data: currentBoardData
  })

  return {
    root: path.dirname(scriptData ? currentFilePath : currentStoryboarderFilePath),
    script: scriptData,
    title: scriptData ? parse.titlePage(scriptData).text : null,
    scriptFilepath: scriptData ? currentFilePath : null,
    scenes: scriptData
      ? scenesFromScriptData({ filepath: currentFilePath, current, scriptData })
      : [sceneFromCurrent(current)]
  }
}

module.exports = {
  getProjectData
}
