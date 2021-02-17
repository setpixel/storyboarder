import React from 'react'
import { connect } from 'react-redux'
import {formatters, NumberSlider, transforms, textFormatters} from '../NumberSlider'
import {
  getSelections,
  getSceneObjects,
  updateObject
} from '../../../shared/reducers/shot-generator'

const MultiSelectionInspector = connect(
  state => ({
    selectionsCount: getSelections(state).length,
    sceneObject: getSceneObjects(state)[getSelections(state)[0]]
  }), {
    updateObject
  }
)(({ selectionsCount, sceneObject, updateObject }) => {
  const setX = (x) => updateObject(sceneObject.id, {x})
  const setY = (y) => updateObject(sceneObject.id, {y})
  const setZ = (z) => updateObject(sceneObject.id, {z})
  return (
    <React.Fragment>
      <div className="column" style={{ flex: 1}}>
        <div style={{ padding: "24px 6px" }}>Selected {selectionsCount} items</div>

        <NumberSlider label="X" value={sceneObject.x} min={-30} max={30} onSetValue={setX} textFormatter={ textFormatters.imperialToMetric }/>
        <NumberSlider label="Y" value={sceneObject.y} min={-30} max={30} onSetValue={setY} textFormatter={ textFormatters.imperialToMetric }/>
        <NumberSlider label="Z" value={sceneObject.z} min={-30} max={30} onSetValue={setZ} textFormatter={ textFormatters.imperialToMetric }/>
      </div>
    </React.Fragment>
  )
})

export default MultiSelectionInspector
