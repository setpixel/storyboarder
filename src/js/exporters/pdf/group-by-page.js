const sum = (accumulator, value) => accumulator + value

const groupByPage = (scenes, boardsPerPage) => {
  let totalBoards = scenes.map(scene => scene.data.boards.length).reduce(sum)

  let pages = []
  let index = 0
  let currScene = 0
  let currBoard = 0
  let boardsAdded = 0
  while (boardsAdded < totalBoards) {
    let scene = scenes[currScene]
    let start = currBoard
    let end = Math.min(currBoard + boardsPerPage, scene.data.boards.length)
    let boards = scene.data.boards.slice(start, end)
    pages.push({ index, scene, boards })
    currBoard = end
    if (currBoard == scene.data.boards.length) {
      currBoard = 0
      currScene++
    }
    boardsAdded += boards.length
    index++
  }
  return pages
}

module.exports = groupByPage
