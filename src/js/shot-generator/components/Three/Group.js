import * as THREE from 'three'

import React, { useRef, useEffect, useMemo } from 'react'
import { batch } from 'react-redux'
import { useThree } from 'react-three-fiber'
import { axis } from "../../../shared/IK/utils/TransformControls"
const isNan = (quaternion) => {
  return isNaN(quaternion.x) || isNaN(quaternion.y) || 
  isNaN(quaternion.z) || isNaN(quaternion.w) 
}
const Group = React.memo(({ id, type, ...props }) => {
  const ref = useRef()
  const { scene } = useThree()

  useEffect(() => {
    setPosition()
  }, [])

  const children = useMemo(() => {
    return scene.__interaction.filter((object) => props.children.includes(object.userData.id))
  }, [props.children])

  const addArrayToObject = (object, array) => {
    for(let i = 0; i < array.length; i++) {
      let child = array[i]
      object.attach(child)
    }
  } 

  const updateAllChildren = () => {
    props.withState((dispatch, state) => {
      batch(() => {
        let changes = {}
        for(let i = 0; i < children.length; i++) {
          let child = children[i]
          let state = {}
          let euler = new THREE.Euler()
          switch(child.userData.type) {
            case "character":
             let quaternion = child.worldQuaternion()
             if(isNan(quaternion)) continue
              euler.setFromQuaternion(child.worldQuaternion(), "YXZ")
              state.rotation = euler.y
              break;
              case "image":
              case "object":
              euler.setFromQuaternion(child.worldQuaternion(), "YXZ")
              state.rotation = { x : euler.x, y : euler.y, z : euler.z }
              break;
            case "light":
              euler.setFromQuaternion(child.worldQuaternion(), "YXZ")
              state = {
                rotation: euler.y,
                tilt: euler.x,
                roll: euler.z
              }
              break;
          }
          let position = child.worldPosition()
          state.x = position.x 
          state.y = position.z
          state.z = position.y
          changes[child.userData.id] = state

          if(child.userData.type === "character") {
            let attachables = scene.__interaction.filter(object => object.userData.bindedId === child.userData.id)
            for(let i = 0; i < attachables.length; i ++) {
                let attachable = attachables[i]
                attachable.parent.updateWorldMatrix(true, true)
                let position = attachable.worldPosition()// new THREE.Vector3()
                let quaternion = attachable.worldQuaternion()
                let matrix = attachable.matrix.clone()
                matrix.premultiply(attachable.parent.matrixWorld)
                matrix.decompose(position, quaternion, new THREE.Vector3())
                let rot = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
                changes[attachable.userData.id] = { 
                    x: position.x, y: position.y, z: position.z,
                    rotation: { x: rot.x, y: rot.y, z: rot.z },
                }
            }
          }
        }   
        dispatch(props.updateObjects(changes))
      })
    })
  }

  const getCenterPosition = () => {
    let center = new THREE.Vector3()
    for(let i = 0; i < children.length; i++) {
      let child = children[i]
      center.add(child.position)
    }
    center.divideScalar(children.length)
    return center
  }

  useEffect(() => {
    if (props.isSelected) {

      props.objectRotationControl.setUpdateCharacter((name, rotation) => {
        updateAllChildren()
      })
      ref.current.position.copy(getCenterPosition())
      ref.current.updateMatrixWorld(true)
      props.objectRotationControl.setCharacterId(ref.current.uuid)
      props.objectRotationControl.selectObject(ref.current, ref.current.uuid)
      props.objectRotationControl.customOnMouseDownAction = () => { addArrayToObject(ref.current, children) };
      props.objectRotationControl.customOnMouseUpAction = () => { addArrayToObject(scene.children[0], children) };
      props.objectRotationControl.control.setShownAxis(axis.Y_axis)
      
    } else {
      if(props.objectRotationControl && props.objectRotationControl.isSelected(ref.current)) {
        props.objectRotationControl.deselectObject()
      }
    }
  }, [props.isSelected])

  const setPosition = () => {
    ref.current.position.x = props.x || ref.current.position.x
    ref.current.position.y = props.z || ref.current.position.y
    ref.current.position.z = props.y || ref.current.position.z
  }

  useEffect(() => {
    if(!ref.current || !children.length ) return
    addArrayToObject(ref.current, children)
    setPosition()
    addArrayToObject(scene.children[0], children)
    updateAllChildren()
  }, [props.x, props.y, props.z])

  return <group
  ref={ ref }
  userData={{ 
    id: id,
    type: type,
    children: props.children
  }}
  />

})
 
export default Group
