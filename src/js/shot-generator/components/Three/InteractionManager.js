import { connect, batch } from 'react-redux'
import React, { useRef, useCallback, useLayoutEffect, useState, useMemo, useEffect } from 'react'
import { useThree } from 'react-three-fiber'
import * as THREE from 'three'
import { useDraggingManager } from '../../hooks/use-dragging-manager'
import '../../../shared/IK/utils/Object3dExtension'
import GPUPicker from '../../../xr/src/three/GPUPickers/GPUPicker'
import SGIkHelper from '../../../shared/IK/SGIkHelper'
import { 
    selectObject,
    selectObjectToggle,
    selectBone,
    selectAttachable,
    updateObjects,
    
    undoGroupStart,
    undoGroupEnd,
    updateObject,
  
    getSelections,
    getActiveCamera,
    deselectAttachable,
    getSceneObjects,
} from '../../../shared/reducers/shot-generator'
import {blockObject, unblockObject} from '../../../services/server/sockets';
import BonesHelper from '../../../xr/src/three/BonesHelper'
import throttle from 'lodash.throttle'
import CameraControlsComponent from './CameraControlsComponet'

const getIntersectionTarget = intersect => {
  // character
  if (intersect.object.userData.type === 'hitter' ) {
    return intersect.object.parent.object3D
  }

  //Transform control
  if(intersect.object.type === 'gizmo') {
    if(intersect.object.parent.parent.userData.type === "objectControl") {
      return intersect.object.parent.parent.parent
    }
    return intersect.object
  }

  if(intersect.object.userData.type === 'controlPoint' || intersect.object.userData.type === 'objectControl'
    || intersect.object.userData.type === 'poleTarget') {
    return intersect.object
  }

  if(intersect.object.type === 'SkinnedMesh') {
    return intersect.object.parent.parent
  }

  if(intersect.object.parent.userData.type === 'object' || intersect.object.userData.type === 'attachable'
    || intersect.object.parent.userData.type === 'image' || intersect.object.userData.type === 'light') {
    return intersect.object.parent
  }
}

const InteractionManager = connect(
    state => ({
        activeCamera: getActiveCamera(state),
    }),
    {
        selectObject,
        selectObjectToggle,
        selectBone,
        updateObjects,
        updateObject,
        selectAttachable,
        deselectAttachable,
        undoGroupStart,
        undoGroupEnd,
        withState: (fn) => (dispatch, getState) => fn(dispatch, getState())
    }
)(React.memo(({
    activeCamera,
    selectObject,
    selectObjectToggle,
    selectBone,
    updateObject,

    updateObjects,
    selectAttachable,
    deselectAttachable,

    undoGroupStart,
    undoGroupEnd,
    withState,
    renderData,
}) => {
    const { scene, gl, camera } = useThree()

    const activeGL = useMemo(() => renderData ? renderData.gl : gl, [renderData]) 
    const intersectables = useRef()
    const [lastDownId, setLastDownId] = useState()
    const [dragTarget, setDragTarget] = useState()
    const [pointerDownEvent, setOnPointDown] = useState()
    const [pointerUpEvent, setOnPointUp] = useState()
    const [isCameraControlsEnabled, enableCameraControls] = useState(true)
    const { prepareDrag, drag, updateStore, endDrag } = useDraggingManager(false)
    const gpuPickerInstance = useRef(null)
    const raycaster = useRef(new THREE.Raycaster())
    const mousePosition = useRef(new THREE.Vector2())

    const takeSceneObjects = useCallback(() => {
      let sceneObjects 
      withState((dispatch, state) => {
        sceneObjects = getSceneObjects(state)
      })
      return sceneObjects
    }, [])

    const takeSelections = useCallback(() => {
      let selection 
      withState((dispatch, state) => {
        selection = getSelections(state)
      })
      return selection
    }, [])


    useEffect(() => {
      SGIkHelper.getInstance().changeDomElement(activeGL.domElement)
      if(!gpuPickerInstance.current) return
      gpuPickerInstance.current.renderer = activeGL
    }, [activeGL])

    const getGPUPicker = useCallback(() => {
        if(gpuPickerInstance.current === null) {
          gpuPickerInstance.current = new GPUPicker(activeGL)
        }
        return gpuPickerInstance.current
    }, [])
    
    const filterIntersectables = () => {
        intersectables.current = scene.__interaction
        intersectables.current = intersectables.current.concat(scene.children[0].children.filter(o => 
            o.userData.type === 'controlTarget' ||
            o.userData.type === 'controlPoint' || 
            o.userData.type === 'objectControl' ||
            o.userData.type === 'group'))     
    }
    
    const mouse = event => {
        const rect = activeGL.domElement.getBoundingClientRect()
        return {
          x: ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1,
          y: - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1
        }
    }

    const getIntersects = (pointer) => {
        let x = pointer.x
        let y = pointer.y
        raycaster.current.setFromCamera({ x, y }, camera )
        //Check helpers intersection first
        let intersects = raycaster.current.intersectObject(SGIkHelper.getInstance())
        if(intersects.length > 0) {
          return intersects
        }
        x = mousePosition.current.x
        y = mousePosition.current.y
        raycaster.current.setFromCamera({ x, y }, camera )
        let gpuPicker = getGPUPicker()
        gpuPicker.setupScene((intersectables.current || []).filter(object => object.userData.type !== 'volume'))
        gpuPicker.controller.setPickingPosition(mousePosition.current.x, mousePosition.current.y)
        intersects = gpuPicker.pickWithCamera(camera, activeGL)
        return intersects
    }  

    useMemo(() => {
        if(dragTarget && dragTarget.target){
          let selections = takeSelections()
          let { target, x, y } = dragTarget
          enableCameraControls(false)
          prepareDrag( target, { x, y, useIcons:true, camera, scene, selections })
          undoGroupStart()
        }
    }, [dragTarget])

    const onPointerDown = event => {
       // event.preventDefault()
        filterIntersectables()
        let selections = takeSelections()
        // get the mouse coords
        const { x, y } = mouse(event)
        const rect = activeGL.domElement.getBoundingClientRect()
        mousePosition.current.set(event.clientX - rect.left, event.clientY - rect.top)
        let intersects = getIntersects({ x, y })
        // if no objects intersected
        if (intersects.length === 0) {
            if(dragTarget || (selections[0] !== activeCamera) ) {
                // cancel any active dragging
                endDrag()
                // clear the drag target
                setDragTarget(null)
    
                // don't do anything on the next pointerup
                setLastDownId(null)
    
                // select the active camera
                selectObject(activeCamera)
    
                // don't select any bone
                selectBone(null)
            }
            setOnPointDown(event)
           // cameraControlsView.current.onPointerDown(event)
        } else {
    
            let shouldDrag = false
            let target
            let isSelectedControlPoint = false
            let selectedObjectControl
            
            for (let intersect of intersects) {
                target = getIntersectionTarget(intersect)
                if (target && target.userData.type === 'character' && target.userData.locked) {
                return
              }
            }

            target = getIntersectionTarget(intersects[0])
            if(!target) return
            if(target.userData && target.userData.type === 'attachable') {
              selectAttachable({ id: target.userData.id, bindId: target.userData.bindedId })
              setDragTarget({ target, x, y})
              return 
            } else if(target.userData && (target.userData.type === 'controlPoint' || target.userData.type === 'poleTarget')) {
              let characterId = target.characterId
              SGIkHelper.getInstance().selectControlPoint(target.uuid, event)
              let characters = intersectables.current.filter(value => value.uuid === characterId)
              target = characters[0]
              isSelectedControlPoint = true
            } else if(target.userData && target.userData.type === 'objectControl') {
                let objectId = target.characterId
                let targetElement = target.object
                if(!targetElement) return
                if(!targetElement.userData.locked) target.select(event)
                if(targetElement.type === "Bone") {
                    let characters = intersectables.current.filter(value => value.uuid === objectId)
                    target = characters[0]
                    selectedObjectControl = targetElement
                } else if(targetElement.userData.type === "attachable") {
                 
                    let characters = intersectables.current.filter(value => value.uuid === objectId)
                    target = characters[0]
                    selectAttachable({id: targetElement.userData.id, bindId: targetElement.userData.bindedId})
                    selectedObjectControl = targetElement
                    setDragTarget({ target, x, y, isObjectControl: true })
                    return
                } else if(targetElement.userData.type === "group") {
                    setDragTarget({ target:null, x, y, isObjectControl: true })
                    return
                }
                else {
                  let objects = intersectables.current.filter(value => value.uuid === objectId)
                  target = objects[0]
                  selectedObjectControl = targetElement
                  setDragTarget({ target, x, y, isObjectControl: true })
                  return
              }
            } else if(target.type && target.type === 'gizmo') {
                let characterId = target.parent.parent.parent.characterId
                SGIkHelper.getInstance().selectControlPoint(target.parent.parent.parent.object.uuid, event)
                let characters = intersectables.current.filter(value => value.uuid === characterId)
                target = characters[0]
                isSelectedControlPoint = true;
            }
            deselectAttachable()
 
            // if there are 1 or more selections
            if (selections.length) {
              // and we're not in icon mode
                // if only one character is selected ...
                if ( target.userData.type === 'character' &&
                    selections.length === 1 &&
                    //  and its the one we pointerdown'd ...
                    selections[0] === target.userData.id
                  ) {
                    if (target.userData.locked || target.userData.blocked) {
                      unblockObject(target.userData.id)
                      selectObject(null)
                      selectBone(null)
                      setLastDownId(null)
                      setDragTarget(null)
                      undoGroupEnd()
                      return
                    }
                    // see if we pointerdown'd a bone ...
                   // let raycaster = new THREE.Raycaster()
                    if(!isSelectedControlPoint && selectedObjectControl) {
                      selectBone(selectedObjectControl.uuid)
                      // consider a bone selection the start of a drag
                      setDragTarget({ target, x, y, isObjectControl: true })
                      return
                    }
                
                    raycaster.current.setFromCamera({ x, y }, camera )
                    let hits = raycaster.current.intersectObject(BonesHelper.getInstance())
                    // select the bone
                    if (!isSelectedControlPoint && hits.length) {
                      selectObject(target.userData.id)
                      blockObject(target.userData.id)
                      setLastDownId(null)
                      
                      selectBone(hits[0].bone.uuid)
                      // consider a bone selection the start of a drag
                      setDragTarget({ target, x, y })
                      return
                    }
              }
            
              if (
                // additional click is on an existing selected object
                selections.includes(target.userData.id)
              ) {
                shouldDrag = true
                blockObject(target.userData.id)
              }
            }
              selectBone(null)
              setLastDownId(target.userData.id)
            if (shouldDrag) {

              setDragTarget({ target, x, y, isObjectControl: target.isRotated })
            }
            else {
              setOnPointDown(event)
            }
        }
    }

    const throttleUpdateDraggableObject = throttle(() => {  
      updateStore(updateObjects)
    }, 16, {trailing: true} )
    
    const onPointerMove = event => {
      event.preventDefault()
      const selections = takeSelections()

      const { x, y } = mouse(event)
      if (dragTarget && !dragTarget.isObjectControl) {
        if(dragTarget.target.userData.type === 'character') {
          let ikRig = SGIkHelper.getInstance().ragDoll;
          if(!ikRig || !ikRig.isEnabledIk && !ikRig.hipsMoving && !ikRig.hipsMouseDown) {
            drag({ x, y }, dragTarget.target, camera, selections, event.ctrlKey)
          }
        }
        else {
          drag({ x, y }, dragTarget.target, camera, selections, event.ctrlKey)
        }
      }
    }
    
    const onPointerUp = event => {
        event.preventDefault()
        const { x, y } = mouse(event)
        SGIkHelper.getInstance().deselectControlPoint(event)
        if (dragTarget && dragTarget.target) {
          endDrag(updateObjects)
          unblockObject(dragTarget.target.userData.id)
          if(dragTarget.target.userData.type === "character") {
            let attachables = scene.__interaction.filter(object => object.userData.bindedId === dragTarget.target.userData.id)
            withState((dispatch, state) => {
              batch(() => {
                for(let i = 0; i < attachables.length; i ++) {
                  let attachable = attachables[i]
                  attachable.parent.updateWorldMatrix(true, true)
                  let position = attachable.worldPosition()// new THREE.Vector3()
                  let quaternion = attachable.worldQuaternion()
                  let matrix = attachable.matrix.clone()
                  matrix.premultiply(attachable.parent.matrixWorld)
                  matrix.decompose(position, quaternion, new THREE.Vector3())
                  let rot = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
                  dispatch(updateObject(attachable.userData.id, 
                  { 
                      x: position.x, y: position.y, z: position.z,
                      rotation: { x: rot.x, y: rot.y, z: rot.z },
                  }))
                }
              })
            })
          }
          setDragTarget(null)
          undoGroupEnd()
        }
        enableCameraControls(true)
        setOnPointUp(event)
        const selections = takeSelections()
        const sceneObjects = takeSceneObjects()
      
        if (event.target === activeGL.domElement) {
            const rect = activeGL.domElement.getBoundingClientRect();
            mousePosition.current.set(event.clientX - rect.left, event.clientY - rect.top)
            let intersects = getIntersects({ x, y })
            if (intersects.length === 0) {
              setLastDownId(null)
            } else {
              // get the intersection target of the object
              // but ignore gizmo and objectControl intersections
              let target = (
                intersects[0].object.type === 'gizmo' ||
                intersects[0].object.userData.type === 'objectControl'
              )
              ? null
              : getIntersectionTarget(intersects[0])
              if (target && target.userData.id == lastDownId) {
                if (event.shiftKey) {
                  // if there is only one selection and it is the active camera
                  if (selections.length === 1 && selections[0] === activeCamera) {
                    // replace the selection with the object
                    selectObject(target.userData.id)
                  } else {
                    // toggle the object in the multi-selection
                    selectObjectToggle(target.userData.id)
                  }
                } else {
                  // if the pointerup'd target is not part of the multi-selection
                  if (!selections.includes(target.userData.id) && !target.userData.locked && !target.userData.blocked) {
                    // clear the multi-selection and select just the target
                    let object = sceneObjects[target.userData.id]
                    if (object && object.group) {
                      selectObject([object.group, ...sceneObjects[object.group].children])
                    } else {
                      selectObject(target.userData.id)
                    }
                  }
                }
                selectBone(null)
              }
            }
        }
    
        setLastDownId(null)
    }

    useLayoutEffect(() => {
      activeGL.domElement.addEventListener('pointerdown', onPointerDown)
      activeGL.domElement.addEventListener('pointermove', onPointerMove)
      activeGL.domElement.addEventListener('pointermove', throttleUpdateDraggableObject)
      window.addEventListener('pointerup', onPointerUp)
      return function cleanup () {
        activeGL.domElement.removeEventListener('pointerdown', onPointerDown)
        activeGL.domElement.removeEventListener('pointermove', onPointerMove)
        activeGL.domElement.removeEventListener('pointermove', throttleUpdateDraggableObject)
        window.removeEventListener('pointerup', onPointerUp)
      }
    }, [onPointerDown, onPointerUp, onPointerMove, activeGL])

    return <CameraControlsComponent 
              pointerDownEvent={ pointerDownEvent }
              pointerUpEvent={ pointerUpEvent }
              activeGL={ activeGL }
              isCameraControlsEnabled={ isCameraControlsEnabled }
              takeSceneObjects={ takeSceneObjects }
              activeCamera={ activeCamera }
              /> 
}))

export default InteractionManager
