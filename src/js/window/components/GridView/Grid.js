// NOTE(): this is a clone of shot generator grid, with only difference that this is non jsx; 
// the Storyboarder window doesn't support jsx yet. When main-window is refactored to react we should remove this file

const h = require('../../../utils/h')

// and just use the SG's one
const {useMemo, useEffect, useRef, useCallback, useState} = React =  require('react')
const throttle = require('lodash.throttle')

const getIndices = (container, itemHeight, numCols) => {
  if (!container) {
    return 0
  }

  //const first = Math.floor(container.scrollTop / itemHeight) * numCols
  return Math.round((container.scrollTop + container.parentNode.clientHeight) / itemHeight) * numCols
}

const getPlaceholder = (elementStyle, i, k, isLoading = false) => (
  ['div',
    {
    key:`grid-element-placeholder-${i + k}`,
    style:elementStyle,
    className:'thumbnail-container',
    },
    {/*{isLoading && <div className="spinner"/>}*/}
  ]   
)

const getComponent = (Component, itemData, elements, elementStyle, i, k) => (
  [Component, {
    key:`grid-element-${i + k}`,
    style:elementStyle,
    index:i+k,
    data:elements[i + k],
    ...itemData
    }
  ]
)

const Grid = React.memo(({
   Component,
   elements,

   itemData,

   itemHeight = '100%',
   itemWidth = '100%',
   defaultElementWidth 
}) => {
  const elementStyle = {
    height: itemHeight,
    width: itemWidth
  }
  const [numCols, setNumCols] = useState(2)
  const containerRef = useRef(null)
  const [currentIndex, setCurrentIndex] = useState(getIndices())
  const resizeGrid = (e) => {
    // NOTE(): Grid takes 70% of the space? 
    let gridSpace =  window.innerWidth * 0.70
    let columnsNumber = Math.round(gridSpace / defaultElementWidth)
    columnsNumber = columnsNumber < 2 ? 2 : columnsNumber
    setNumCols(columnsNumber)
  }

  useEffect(() => {
    resizeGrid()
    window.addEventListener('resize', resizeGrid);
    return () => {
      window.removeEventListener('resize', resizeGrid);
    }
  }, [])

  const onParentScroll = useCallback(throttle((e) => {
    const index = getIndices(e.target, itemHeight, numCols)
    if (index > currentIndex) {
      setCurrentIndex(index)
    }
  }, 500), [currentIndex])

  useEffect(() => {
    if(!containerRef.current) return
    containerRef.current.parentNode.addEventListener('scroll', onParentScroll)
    const index = getIndices(containerRef.current, itemHeight, numCols)
    if (index > currentIndex) {
      setCurrentIndex(index)
    }

    return () => {
      if (containerRef.current) containerRef.current.parentNode.removeEventListener('scroll', onParentScroll)
    }
  }, [containerRef.current, currentIndex])

  const components = useMemo(() => {
    const result = []

    for (let i = 0; i < elements.length; i += numCols) {
      const row = []

      for (let k = 0; k < numCols; k++) {
        const index = i + k
        if (elements[index]) {
          row.push(getComponent(Component, itemData, elements, elementStyle, i, k))

        } else {
          row.push(getPlaceholder(elementStyle, i, k))
        }
      }

      result.push(
        ['div', { className:"grid-row", key:`row-${i}`}, row]
      )
    }

    return result
  }, [elements.length, itemData, currentIndex, numCols])

  return h(
    ['div', { ref:containerRef },
      components
    ]
  )
})
module.exports = Grid
