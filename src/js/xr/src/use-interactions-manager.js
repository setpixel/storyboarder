const { useThree, useFrame } = require('react-three-fiber')
const { useMemo, useRef, useEffect, useCallback, useState } = React = require('react')
const { useSelector, useDispatch } = require('react-redux')
const useReduxStore = require('react-redux').useStore

const { create } = require('zustand')
const { produce } = require('immer')

const { ActionCreators } = require('redux-undo')

const useIsXrPresenting = require('./hooks/use-is-xr-presenting')

const { log } = require('./components/Log')
const Mirror = require("./three/Mirror")
const {
  getControllerRaycaster,
  getControllerIntersections
} = require('./helpers/get-controller-intersections')
const findMatchingAncestor = require('./helpers/find-matching-ancestor')
const rotatePoint = require('./helpers/rotate-point')
const teleportParent = require('./helpers/teleport-parent')

// via https://github.com/immersive-web/webxr-input-profiles/blob/8a7807f/packages/registry/profiles/oculus/oculus-touch-v2.json
const profile = require('./helpers/vr-gamepads/oculus-touch-v2.json')
const { addGamepad, removeGamepad } = require('./helpers/vr-gamepads')

const applyDeviceQuaternion = require('../../shot-generator/utils/apply-device-quaternion').default

const BonesHelper = require('./three/BonesHelper')
const GPUPicker = require('./three/GPUPickers/GPUPicker')
const IKHelper = require('../../shared/IK/IkHelper')

const { useMachine } = require('@xstate/react')
const interactionMachine = require('./machines/interactionMachine')
const {dropObject, dropCharacter } = require('../../utils/dropToObjects')

require('./three/GPUPickers/utils/Object3dExtension')

const {
  // selectors
  getSelections,
  getSelectedBone,
  getSceneObjects,

  // action creators
  selectObject,
  selectAttachable,
  updateObject,
  updateObjects,
  updateCharacterSkeleton,
  updateCharacterIkSkeleton,
  updateCharacterPoleTargets,
  selectBone
} = require('../../shared/reducers/shot-generator')

const WORLD_SCALE_LARGE = 1
const WORLD_SCALE_SMALL = 0.1

const getRotationMemento = (controller, object) => {
  let controllerRot = new THREE.Matrix4().extractRotation(controller.matrixWorld)
  let startingDeviceRotation = new THREE.Quaternion().setFromRotationMatrix(controllerRot)
  let startingDeviceOffset = new THREE.Quaternion()
    .clone()
    .inverse()
    .multiply(startingDeviceRotation)
    .normalize()
    .inverse()

  let startingObjectQuaternion = object.quaternion.clone()
  let startingObjectOffset = new THREE.Quaternion()
    .clone()
    .inverse()
    .multiply(startingObjectQuaternion)

  return {
    startingDeviceOffset,
    startingObjectOffset,
    startingObjectQuaternion
  }
}

const getSelectOffset = (controller, object, distance, point) => {
  let cursor = controller.getObjectByName('cursor')
  cursor.position.z = -distance
  const pos = object.getWorldPosition(new THREE.Vector3())
  const offset = new THREE.Vector3().subVectors(point, pos)
  return offset
}

const moveObjectZ = (object, event, worldScale) => {
  if (Math.abs(event.axes[1]) < Math.abs(event.axes[0])) return

  const amount = event.axes[1] * 0.08

  if (Math.abs(amount) > 0.01) {
    const worldScaleMult = worldScale === 1 ? 1 : worldScale * 2

    object.position.add(new THREE.Vector3(0, 0, amount * worldScaleMult))
    object.position.z = Math.min(object.position.z, -0.5 * worldScaleMult)
  }
}

const rotateObjectY = (object, event) => {
  if (Math.abs(event.axes[0]) < Math.abs(event.axes[1])) return

  const amount = event.axes[0] * 0.07

  if (Math.abs(amount) > 0.01) {
    object.rotateY(amount)
  }
}

const snapObjectRotation = (object) => {
  // setup for rotation
  object.userData.order = object.rotation.order
  object.rotation.reorder('YXZ')

  // snap rotation y by 22.5°
  const sign = Math.sign(object.rotation.y)
  let degreeY = THREE.Math.radToDeg(Math.abs(object.rotation.y)) / 22.5
  degreeY = THREE.Math.degToRad(Math.round(degreeY) * 22.5) * sign
  // snap rotation z to 180°
  let degreeZ = THREE.Math.radToDeg(Math.abs(object.rotation.z)) / 180
  degreeZ = THREE.Math.degToRad(Math.round(degreeZ) * 180)

  let euler = new THREE.Euler(0, degreeY, 0)
  euler.reorder('YXZ')

  // update rotation
  object.rotation.copy(euler)
  object.rotation.order = object.userData.order
  object.updateMatrix()
  object.updateMatrixWorld()
}

const teleportState = ({ teleportPos, teleportRot }, camera, x, y, z, r) => {
  // create virtual parent and child
  let parent = new THREE.Object3D()
  parent.position.set(teleportPos.x, teleportPos.y, teleportPos.z)
  parent.rotation.set(teleportRot.x, teleportRot.y, teleportRot.z)

  let child = new THREE.Object3D()
  child.position.copy(camera.position)
  child.rotation.copy(camera.rotation)
  parent.add(child)
  parent.updateMatrixWorld()

  // teleport the virtual parent
  teleportParent(parent, child, x, y, z, r)

  // update state from new position of virtual parent
  teleportPos.x = parent.position.x
  teleportPos.y = parent.position.y
  teleportPos.z = parent.position.z

  teleportRot.x = parent.rotation.x
  teleportRot.y = parent.rotation.y
  teleportRot.z = parent.rotation.z
}

const getImageData = image => {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)

  return context.getImageData(0, 0, image.width, image.height)
}

const getPixel = (image, x, y) => {
  const imageData = getImageData(image)

  let position = (x + imageData.width * y) * 4,
    data = imageData.data
  return { r: data[position], g: data[position + 1], b: data[position + 2], a: data[position + 3] }
}

const [useStore, useStoreApi] = create((set, get) => ({
  // values
  teleportPos: { x: 0, y: 0, z: 0 },
  teleportRot: { x: 0, y: 0, z: 0 },

  worldScale: WORLD_SCALE_LARGE,
  standingMemento: null,

  didMoveCamera: null,
  didRotateCamera: null,

  teleportMaxDist: 20,
  teleportTargetPos: [0, 0, 0],
  teleportTargetValid: false,

  boneRotationMemento: {},

  // actions
  setDidMoveCamera: value => set(produce(state => { state.didMoveCamera = value })),
  setDidRotateCamera: value => set(produce(state => { state.didRotateCamera = value })),

  moveCameraByDistance: (xrCamera, sceneCamera, distance) => set(produce(state => {
    let center = new THREE.Vector3()
    sceneCamera.getWorldPosition(center)

    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    xrCamera.matrixWorld.decompose(position, rotation, scale)
    
    const direction = new THREE.Vector3(0.0, 0.0, 1.0).applyQuaternion(rotation).setComponent(1, 0.0).setLength(distance)
    center.add(direction)
    
    teleportState(state, sceneCamera, center.x, null, center.z, null)
  })),

  rotateCameraByRadians: (camera, radians) => set(produce(state => {
    let center = new THREE.Vector3()
    camera.getWorldPosition(center)
    let gr = camera.rotation.y + state.teleportRot.y

    teleportState(state, camera, null, null, null, gr + radians)
  })),

  teleport: (camera, x, y, z, r) => set(produce(state => {
    teleportState(state, camera, x, y, z, r)
  })),


  setMiniMode: (value, camera) => set(produce(state => {
    if (value) {
      // switch to mini mode
      state.worldScale = WORLD_SCALE_SMALL

      // alter the camera position
      let offsetVector = new THREE.Vector3(0, 0, 0.5)
      offsetVector.applyMatrix4(new THREE.Matrix4().extractRotation(camera.matrixWorld))
      offsetVector = offsetVector.multiply(new THREE.Vector3(1, 0, 1))
      
      let positionVector = new THREE.Vector3()
      camera.getWorldPosition(positionVector)

      teleportState(state, camera,
        (state.teleportPos.x + camera.position.x) * state.worldScale + offsetVector.x,
        0,
        (state.teleportPos.z + camera.position.z) * state.worldScale + offsetVector.z
      )
    } else {
      // set the world scale
      state.worldScale = WORLD_SCALE_LARGE
    }
  })),

  // remember where we were standing
  saveStandingMemento: camera => set(state => {
    let v = new THREE.Vector3()
    camera.getWorldPosition(v)

    return {
      ...state,

      standingMemento: {
        position: {
          x: v.x,
          y: 0,
          z: v.z
        }
      }
    }
  }),

  // return to where we were standing
  restoreStandingMemento: camera => set(state => produce(state, draft => {
    if (state.standingMemento) {
      let { x, z } = state.standingMemento.position

      teleportState(draft, camera, x, 0, z, null)
    }
  })),

  // clear the memento
  clearStandingMemento: () => set(state => ({ ...state,
    standingMemento: null
  })),

  set: fn => set(produce(fn))
}))

const getControllerByName = (controllers, name) => {
  for (let controller of controllers) {
    if (controller.userData.inputSource.handedness === name) {
      return controller
    }
  }
}
const getExcludeList = parent => {
  let list = []
  parent.traverse(child => {
    if (child.userData.preventInteraction) {
      list.push(child)
    }
  })
  return list
}

const useInteractionsManager = ({
  groundRef,
  rootRef,
  uiService,
  playSound,
  stopSound,
  realCamera,
  SGConnection
}) => {
  const { gl, camera, scene } = useThree()

  const selections = useSelector(getSelections)
  const lastAction = useSelector(state => state.lastAction.type)
  const isDeselected = useCallback(() => lastAction === 'DESELECT_OBJECT', [lastAction])
  
  const sceneObjects = useSelector(getSceneObjects)

  const canUndo = useSelector(state => state.undoable.past.length > 0)
  const canRedo = useSelector(state => state.undoable.future.length > 0)
  const attachableParent = useRef(null)
  const targetObject = useRef(null)

  const gpuPicker = useRef(null)
  const getGpuPicker = () => {
    if (gpuPicker.current === null) {
      gpuPicker.current = new GPUPicker(gl)
    }
    return gpuPicker.current
  }

  const ikHelper = useRef(null)
  const getIkHelper = () => {
    if(ikHelper.current === null) {
      ikHelper.current = IKHelper.getInstance()
      const updateCharacterSkeleton = (name, rotation) => { dispatch(updateCharacterSkeleton({
        id: ikHelper.current.intializedSkinnedMesh.parent.parent.userData.id,
        name : name,
        rotation:
        {
          x : rotation.x,
          y : rotation.y,
          z : rotation.z,
        }
      } ))}

      const updateSkeleton = (skeleton) => { dispatch(updateCharacterIkSkeleton({
        id: ikHelper.current.intializedSkinnedMesh.parent.parent.userData.id,
        skeleton: skeleton
      } ))}

      const updateCharacterPos = ({ x, y, z}) => dispatch(updateObject(
        ikHelper.current.intializedSkinnedMesh.parent.parent.userData.id,
        { x, y: z, z: y }
      ))

      const updatePoleTarget = (poleTargets) => dispatch(updateCharacterPoleTargets({
          id: ikHelper.current.intializedSkinnedMesh.parent.parent.userData.id,
          poleTargets: poleTargets
        }
      ))

      const updateAllObjects = (objectsToUpdate) => dispatch(updateObjects(objectsToUpdate))

      ikHelper.current.setUpdate(
        updateCharacterSkeleton,
        updateSkeleton,
        updateCharacterPos,
        updatePoleTarget,
        updateAllObjects
      )
    }
    return ikHelper.current
  }

  useEffect(() => {
    // create a temporary mesh object to initialize the GPUPicker
    let gpuPicker = getGpuPicker()
    let geometry = new THREE.BoxBufferGeometry(2, 2, 2)
    let material = new THREE.MeshBasicMaterial()
    let mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(camera.worldPosition())
    mesh.position.z -= 1
    scene.add(mesh)
    let interactions = scene.__interaction.concat([mesh])
    gpuPicker.setupScene(interactions, getExcludeList(scene))
    let gpuCamera = gpuPicker.camera
    gpuCamera.fov = 360
    gpuCamera.updateProjectionMatrix()
    gpuPicker.pick(camera.worldPosition(), camera.worldQuaternion())
    scene.remove(mesh)
    gpuCamera.fov = 1
    gpuCamera.updateProjectionMatrix()
  }, [])

  // values
  const didMoveCamera = useStore(state => state.didMoveCamera)
  const didRotateCamera = useStore(state => state.didRotateCamera)
  const teleportTargetValid = useStore(state => state.teleportTargetValid)
  const teleportMaxDist = useStore(state => state.teleportMaxDist)

  // actions
  const setDidMoveCamera = useStore(state => state.setDidMoveCamera)
  const setDidRotateCamera = useStore(state => state.setDidRotateCamera)
  const moveCameraByDistance = useStore(state => state.moveCameraByDistance)
  const rotateCameraByRadians = useStore(state => state.rotateCameraByRadians)
  const teleport = useStore(state => state.teleport)
  const setMiniMode = useStore(state => state.setMiniMode)
  const saveStandingMemento = useStore(state => state.saveStandingMemento)
  const restoreStandingMemento = useStore(state => state.restoreStandingMemento)
  const clearStandingMemento = useStore(state => state.clearStandingMemento)
  const set = useStore(state => state.set)

  const store = useReduxStore()
  const dispatch = useDispatch()

  const commit = (id, object) => {
    const euler = new THREE.Euler().setFromQuaternion(object.quaternion, 'YXZ')

    if (object.userData.type == 'light' || object.userData.type == 'virtual-camera') {
      dispatch(updateObject(id, {
        x: object.position.x,
        y: object.position.z,
        z: object.position.y,
        rotation: euler.y,
        roll: euler.z,
        tilt: euler.x
      }))
    } else if (object.userData.type === 'attachable') {
      let position = object.worldPosition()// new THREE.Vector3()
      let quaternion = object.worldQuaternion()
      let scale = new THREE.Vector3()
      let matrix = object.matrix.clone()
      matrix.premultiply(object.parent.matrixWorld)
      matrix.decompose(position, quaternion, scale)
      let rot = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
      dispatch(updateObject(id, {
        x: position.x,
        y: position.y,
        z: position.z,
        rotation: {x: rot.x, y: rot.y, z: rot.z}
      }))
    } else {
      let rotation = object.userData.type === 'character'
        ? euler.y
        : { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z }
      dispatch(updateObject(id, {
        x: object.position.x,
        y: object.position.z,
        z: object.position.y,
        rotation
      }))
    }
  }

  const onTriggerStart = event => {
    const controller = event.target
    let intersection = null

    let uis = scene.__interaction.filter(o => o.userData.type === 'ui' && o.name !== 'gui-boards')
    let intersections = getControllerIntersections(controller, uis)
    intersection = intersections.length && intersections[0]
    if (intersection) {
      const color = getPixel(
        intersection.object.material.map.image,
        parseInt(intersection.uv.x * intersection.object.material.map.image.width),
        parseInt(intersection.uv.y * intersection.object.material.map.image.height)
      )

      if (color.a !== 0) {
        let u = intersection.uv.x
        let v = intersection.uv.y
        uiService.send({
          type: 'TRIGGER_START',
          controller: event.target,
          intersection: {
            id: intersection.object.userData.id,
            type: 'ui',

            object: intersection.object,
            distance: intersection.distance,
            point: intersection.point,
            uv: new THREE.Vector2(u, v)
          }
        })
        return
      }
    }

    let boardUi = scene.__interaction.filter(o => o.name === 'gui-boards')
    intersections = getControllerIntersections(controller, boardUi)
    intersection = intersections.length && intersections[0]
    if (intersection) {
      const color = getPixel(
        intersection.object.material.map.image,
        parseInt(intersection.uv.x * intersection.object.material.map.image.width),
        parseInt(intersection.uv.y * intersection.object.material.map.image.height)
      )

      if (color.a !== 0) {
        // UV offset for Boards UI
        let u = intersection.uv.x + 1
        let v = intersection.uv.y
        uiService.send({
          type: 'TRIGGER_START',
          controller: event.target,
          intersection: {
            id: intersection.object.userData.id,
            type: 'ui',

            object: intersection.object,
            distance: intersection.distance,
            point: intersection.point,
            uv: new THREE.Vector2(u, v)
          }
        })
        return
      }
    }

    // if the BonesHelper instance is in the scene ...
    if ( BonesHelper.getInstance().isSelected ) {
      // ... check bones helper bone intersections

      let intersects = []
      BonesHelper.getInstance().raycast(getControllerRaycaster(controller), intersects)
      intersection = intersects.find(h => h.bone)

      if (intersection) {
        interactionService.send({
          type: 'TRIGGER_START',
          controller: event.target,
          intersection: {
            id: intersection.object.userData.id,
            type: 'bone',

            object: intersection.object,
            distance: intersection.distance,
            point: intersection.point,

            bone: intersection.bone
          }
        })
        return
      }

      intersection = getControllerIntersections(controller, [IKHelper.getInstance()]).find(h => h.isControlTarget)
      if (intersection) {
        interactionService.send({
          type: 'TRIGGER_START',
          controller: event.target,
          intersection: {
            id: intersection.object.uuid,
            type: 'controlPoint',
            object: intersection.object,
            distance: intersection.distance,
            point: intersection.point,
            controlPoint: intersection.object
          }
        })
        return
      }
    }

    let match = null

    // include all interactables (Model Object, Character, Virtual Camera, etc)
    let list = scene.__interaction.filter(o => o.userData.type !== 'ui')
    // setup the GPU picker
    getGpuPicker().setupScene(list, getExcludeList(scene))

    // gather all hits to tracked scene object3ds
    let hits = getGpuPicker().pick(controller.worldPosition(), controller.worldQuaternion())
    // if one intersects
    if (hits.length) {
      // grab the first intersection
      let child = hits[0].object
      // find either the child or one of its parents on the list of interaction-ables
      if(child.userData.type === 'attachable') {
        match = child.parent
      } else {
        match = findMatchingAncestor(child, list)
      }
      if (match) {
        intersection = hits[0]
      }
    }

    let targetObj = match ? sceneObjects[match.userData.id] : null
    if (match && !targetObj.locked && !targetObj.blocked) {
      // console.log('found sceneObject:', sceneObjects[match.userData.id])
      // console.log('intersection', intersection)
      // log(`select ${sceneObjects[match.userData.id].name || sceneObjects[match.userData.id].displayName}`)
      log(`trigger start on: ${match.userData.id.slice(0, 7)}`)

      interactionService.send({
        type: 'TRIGGER_START',
        controller: event.target,
        intersection: {
          id: match.userData.id,
          type: match.userData.type,
          object: match,
          distance: intersection.distance,
          point: intersection.point
        }
      })
    } else {
      // console.log('clearing selection')
      log(`trigger start on: none`)
      interactionService.send({ type: 'TRIGGER_START', controller: event.target })
    }
  }

  const onTriggerEnd = event => {
    const controller = event.target

    let intersection = null

    let uis = scene.__interaction.filter(o => o.userData.type == 'ui')
    let intersections = getControllerIntersections(controller, uis)
    intersection = intersections.length && intersections[0]
    if (intersection) {
      let offset = intersection.object.userData.id === 'boards' ? 1 : 0
      let u = intersection.uv.x + offset
      let v = intersection.uv.y
      uiService.send({
        type: 'TRIGGER_END',
        controller: event.target,
        intersection: {
          id: intersection.object.userData.id,
          type: 'ui',

          object: intersection.object,
          distance: intersection.distance,
          point: intersection.point,
          uv: new THREE.Vector2(u, v)
        }
      })
    } else {
      uiService.send({
        type: 'TRIGGER_END',
        controller: event.target
      })
    }

    interactionService.send({ type: 'TRIGGER_END', controller: event.target })
  }

  const onGripDown = event => {
    const controller = event.target
    if (BonesHelper.getInstance().isSelected) {

      let intersects = []
      BonesHelper.getInstance().raycast(getControllerRaycaster(controller), intersects)
      intersection = intersects.find(h => h.bone)

      if (intersection) {
        interactionService.send({
          type: 'GRIP_DOWN',
          controller: event.target,

          intersection: intersection ? { ...intersection, type: 'bone' } : undefined
        })
        return
      }
    }

    let match = null

    // include all interactables (Model Object, Character, etc)
    let list = scene.__interaction

    // checks if any object is being actively dragged
    // if so, there's no reason to pick any other object except for dragged one
    if (
      interactionService.state.context.draggingController &&
      interactionService.state.context.selection
    ) {
      list = list.filter(object => object.uuid === interactionService.state.context.selection)
    }
    // setup the GPU picker

    getGpuPicker().setupScene(list, getExcludeList(scene))

    // gather all hits to tracked scene object3ds
    let hits = getGpuPicker().pick(controller.worldPosition(), controller.worldQuaternion())
    // if one intersects
    if (hits.length) {
      // grab the first intersection
      let child = hits[0].object
      // find either the child or one of its parents on the list of interaction-ables
      match = findMatchingAncestor(child, list)
      if (match) {
        intersection = hits[0]
      }
    }

    if (match) {
      // Simple test to check how drop works
      interactionService.send({
        type: 'GRIP_DOWN',
        controller: event.target,

        intersection: {
          id: match.userData.id,
          type: match.userData.type,
          object: match,
          distance: intersection.distance,
          point: intersection.point
        }
      })
    } else {
      interactionService.send({
        type: 'GRIP_DOWN',
        controller: event.target,

        intersection: undefined
      })
    }
  }

  const onGripUp = event => {
    interactionService.send({ type: 'GRIP_UP', controller: event.target })
  }

  const onAxesChanged = event => {
    interactionService.send({ type: 'AXES_CHANGED', controller: event.target, axes: event.axes })
  }

  const onAxesStop = event => {
    interactionService.send({ type: 'AXES_CHANGED', controller: event.target, axes: [0, 0] })
  }

  const onPressEndA = event => {
    // to relay through state machine instead:
    // interactionService.send({ type: 'PRESS_END_A', controller: event.target })
    if (canUndo && interactionService.state.value !== "character_posing") {
      dispatch(ActionCreators.undo())
      playSound('undo')
    }
  }

  const onPressEndB = event => {
    // to relay through state machine instead:
    // interactionService.send({ type: 'PRESS_END_B', controller: event.target })

    if (canRedo && interactionService.state.value !== "character_posing") {
      dispatch(ActionCreators.redo())
      playSound('redo')
    }
  }

  const onPressEndX = event => {
    // relay through state machine
    interactionService.send({ type: 'PRESS_END_X', controller: event.target })
  }

  const onPressStartThumbstick = event => {
    let rightController = getControllerByName(controllers, 'right')
    let worldScale = useStoreApi.getState().worldScale
    let hmd = camera.parent
    let elevationDisplacement = 0.5
    // Value of -2.6 is used since the XR camera is already 1.6 mtrs above the ground by default.
    let minHeight = -2.6

    if (event.target.uuid === rightController.uuid) {
      hmd.position.y += elevationDisplacement
    } else {
      // This makes sure that the camera moves upto 1mtr below the surface
      if (hmd.position.y > minHeight) {
        hmd.position.y -= elevationDisplacement
        // Clamp the value to 2.6mtrs below the ground in case the y values becomes lesser.
        if (hmd.position.y < minHeight) {
          hmd.position.y = minHeight
        }
      }
    }

    teleport(
      camera,
      (hmd.position.x + camera.position.x) * worldScale,
      hmd.position.y * worldScale,
      (hmd.position.z + camera.position.z) * worldScale
    )
  }

  const thumbStickSensitivity = 0.25
  const onMoveCamera = event => {
    if (didMoveCamera != null) {
      if (event.axes[1] === 0) {
        setDidMoveCamera(null)
      }
    } else {
      if (Math.abs(event.axes[1]) < Math.abs(event.axes[0])) return

      let distance
      let value = event.axes[1]

      // backward
      if (value > thumbStickSensitivity) {
        distance = +0.5
      }

      // forward
      if (value < -thumbStickSensitivity) {
        distance = -0.5
      }

      if (distance != null && gl.xr.getSession()) {
        setDidMoveCamera(distance)
        
        moveCameraByDistance(realCamera, camera, distance)
        playSound('teleport-move')
      }
    }
  }

  const onRotateCamera = event => {
    if (didRotateCamera != null) {
      if (event.axes[0] === 0) {
        setDidRotateCamera(null)
      }
    } else {
      if (Math.abs(event.axes[0]) < Math.abs(event.axes[1])) return

      // right
      if (event.axes[0] > thumbStickSensitivity) {
        setDidRotateCamera(-45)
        playSound('teleport-rotate')
        rotateCameraByRadians(camera, THREE.Math.degToRad(-45))
      }

      // left
      if (event.axes[0] < -thumbStickSensitivity) {
        setDidRotateCamera(45)
        playSound('teleport-rotate')
        rotateCameraByRadians(camera, THREE.Math.degToRad(45))
      }
    }
  }

  const [controllers, setControllers] = useState(
    [ gl.xr.getController(0), gl.xr.getController(1) ]
  )
  const isXrPresenting = useIsXrPresenting()

  const onTriggerStartRef = useRef()
  const onTriggerEndRef = useRef()
  const onGripDownRef = useRef()
  const onGripUpRef = useRef()
  const onPressEndARef = useRef()
  const onPressEndBRef = useRef()
  const onPressEndXRef = useRef()
  const onPressStartThumbstickRef = useRef()
  const onAxesChangedRef = useRef()
  const onAxesStopRef = useRef()

  onTriggerStartRef.current = onTriggerStart
  onTriggerEndRef.current = onTriggerEnd
  onGripDownRef.current = onGripDown
  onGripUpRef.current = onGripUp
  onPressEndARef.current = onPressEndA
  onPressEndBRef.current = onPressEndB
  onPressEndXRef.current = onPressEndX
  onPressStartThumbstickRef.current = onPressStartThumbstick
  onAxesChangedRef.current = onAxesChanged
  onAxesStopRef.current = onAxesStop

  useEffect(() => {
    setControllers([ gl.xr.getController(0), gl.xr.getController(1) ])

    // via by https://github.com/mrdoob/three.js/pull/18197
    let connected = event => {
      addGamepad(
        event.target,
        event.data,
        [...gl.xr.getSession().inputSources].indexOf(event.data),
        {
          layout: profile.layouts[event.data.handedness]
        }
      )

      // force update
      setControllers([ gl.xr.getController(0), gl.xr.getController(1) ])
    }
    let disconnected = event => {
      removeGamepad(event.target)

      // force update
      setControllers([ gl.xr.getController(0), gl.xr.getController(1) ])
    }

    // bind
    const _triggerStart = event => onTriggerStartRef.current(event)
    const _triggerEnd = event => onTriggerEndRef.current(event)
    const _gripDown = event => onGripDownRef.current(event)
    const _gripUp = event => onGripUpRef.current(event)
    const _pressEndA = event => onPressEndARef.current(event)
    const _pressEndB = event => onPressEndBRef.current(event)
    const _pressEndX = event => onPressEndXRef.current(event)
    const _pressStartThumbstick = event => onPressStartThumbstickRef.current(event)
    const _axesChanged = event => onAxesChangedRef.current(event)
    const _axesStop = event => onAxesStopRef.current(event)

    for (let controller of controllers) {
      // via three/src/renderers/webxr/WebXRManager.js
      controller.addEventListener('connected', connected)
      controller.addEventListener('disconnected', disconnected)

      // via https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs#Actions
      console.log('setting selectstart to', onTriggerStartRef.current)

      controller.addEventListener('selectstart', _triggerStart)
      controller.addEventListener('select', _triggerEnd)
      controller.addEventListener('squeezestart', _gripDown)
      controller.addEventListener('squeeze', _gripUp)

      // left
      controller.addEventListener('button/a-button/stop', _pressEndA)
      controller.addEventListener('button/b-button/stop', _pressEndB)
      // right
      controller.addEventListener('button/x-button/stop', _pressEndX)
      // both
      controller.addEventListener('button/xr-standard-thumbstick/start', _pressStartThumbstick)
      controller.addEventListener('axes/0/change', _axesChanged)
      controller.addEventListener('axes/0/stop', _axesStop)
    }
    return () => {
      for (let controller of controllers) {
        controller.removeEventListener('connected', connected)
        controller.removeEventListener('disconnected', disconnected)

        controller.removeEventListener('selectstart', _triggerStart)
        controller.removeEventListener('select', _triggerEnd)
        controller.removeEventListener('squeezestart', _gripDown)
        controller.removeEventListener('squeeze', _gripUp)
        controller.removeEventListener('button/a-button/stop', _pressEndA)
        controller.removeEventListener('button/b-button/stop', _pressEndB)
        controller.removeEventListener('button/x-button/stop', _pressEndX)
        controller.removeEventListener('button/xr-standard-thumbstick/start', _pressStartThumbstick)
        controller.removeEventListener('axes/0/change', _axesChanged)
        controller.removeEventListener('axes/0/stop', _axesStop)
      }
    }
  }, [isXrPresenting])

  // poll controllers every frame
  useFrame(() => {
    if (gl.xr.getSession()) {
      for (let i = 0; i < 2; i++) {
        let controller = gl.xr.getController(i)
        let { inputSource } = controller.userData
        if (inputSource) {
          let { gamepad } = inputSource
          controller.userData.gamepadSource.emitter(gamepad)
        }
      }
    }
  })



  const reusableVector = useRef()
  const getReusableVector = () => {
    if (!reusableVector.current) {
      reusableVector.current = new THREE.Vector3()
    }
    return reusableVector.current
  }

  const poseTicking = () => {
    if(interactionService.state.value !== "character_posing") return
    playSound('posing')
    setTimeout(() => poseTicking(), 1000)
  }

  // TODO could model these as ... activities? exec:'render' actions?
  useFrame(({camera}) => {
    // don't wait for a React update
    // read values directly from stores
    let selections = getSelections(store.getState())
    let selectedId = selections.length ? selections[0] : null

    let mode = interactionService.state.value
    let context = interactionService.state.context

    // highlight hovered bone
    if (mode === 'selected') {
      let match
      for (let i = 0, n = controllers.length; i < n; i++) {
        let controller = controllers[i]

        let intersects = []
        BonesHelper.getInstance().raycast(getControllerRaycaster(controller), intersects)
        let intersection = intersects.find(h => h.bone)

        if (intersection) {
          match = intersection
          if (BonesHelper.getInstance().selectedBone !== intersection.bone) {
            playSound('bone-hover')
            BonesHelper.getInstance().selectBone(intersection.bone)
          }
        }
      }
      if (!match) {
        BonesHelper.getInstance().resetSelection()
      }
    }

    if (mode === 'drag_teleport') {
      let controller = gl.xr.getController(context.teleportDragController)

      let hits = getControllerIntersections(controller, [groundRef.current])
      if (hits.length) {
        let hit = hits[0]
        if (hit.distance < teleportMaxDist) {
          let worldScale = useStoreApi.getState().worldScale

          let teleportTargetPos = hit.point.multiplyScalar(1 / worldScale).toArray()

          set(state => ({ ...state, teleportTargetPos, teleportTargetValid: true }))
        } else {
          set(state => ({ ...state, teleportTargetValid: false }))
        }
      }
    }

    if (mode === 'drag_object') {
      let controller = gl.xr.getController(context.draggingController)
      let object3d = scene.__interaction.find(o => o.userData.id === context.selection)

      let shouldMoveWithCursor = (object3d.userData.type == 'character') || object3d.userData.staticRotation
      if (shouldMoveWithCursor) {

        // update position via cursor
        const cursor = controller.getObjectByName('cursor')
        let wp = cursor.getWorldPosition(getReusableVector())
        if (controller.userData.selectOffset && object3d.userData.type == 'character') {
          wp.sub(controller.userData.selectOffset)
          object3d.applyMatrix(object3d.parent.matrixWorld)
          object3d.position.copy(wp)
          object3d.updateMatrixWorld()
          object3d.applyMatrix(object3d.parent.getInverseMatrixWorld())
        }

        if (object3d.userData.staticRotation) {
          let quaternion = object3d.parent.worldQuaternion().inverse()
          let rotation = quaternion.multiply(object3d.userData.staticRotation)
          object3d.quaternion.copy(rotation)
        }
        object3d.updateMatrixWorld()

        //object3d.updateMatrix()
      }
    }

    if (mode === 'rotate_bone') {
      let controller = gl.xr.getController(context.draggingController)
      let selectedBone = getSelectedBone(store.getState())

      // find the bone
      let bone = scene.getObjectByProperty('uuid', selectedBone)

      let {
        startingDeviceOffset,
        startingObjectOffset,
        startingObjectQuaternion
      } = useStoreApi.getState().boneRotationMemento

      let currControllerRot = new THREE.Matrix4().extractRotation(controller.matrixWorld)
      let deviceQuaternion = new THREE.Quaternion().setFromRotationMatrix(currControllerRot)

      let objectQuaternion = applyDeviceQuaternion({
        parent: bone.parent,

        startingDeviceOffset,
        startingObjectOffset,
        startingObjectQuaternion,

        deviceQuaternion,

        camera,
        useCameraOffset: true
      })

      bone.quaternion.copy(objectQuaternion.normalize())
    }
  }, false, [set, controllers])

  // update ui every frame
  useFrame(() => {
    if (uiService.state.value.input === 'dragging') {
      let controller = uiService.state.context.draggingController

      let uis = scene.__interaction.filter(o => o.userData.type === 'ui')
      let intersections = getControllerIntersections(controller, uis)
      let intersection = intersections.length && intersections[0]

      if (intersection) {
        let u = intersection.uv.x
        let v = intersection.uv.y
        uiService.send({
          type: 'CONTROLLER_INTERSECTION',
          controller,
          intersection
        })
      }
    }
  }, false, [uiService.state.value.input])

  useMemo(() => {
    // TODO why is this memo called multiple times?
  }, [])

  const [interactionServiceCurrent, interactionServiceSend, interactionService] = useMachine(
    interactionMachine,
    {
      actions: {
        onDragTeleportStart: (context, event) => {
          log('-- onDragTeleportStart')
          // the target position value will be old until the next gl render
          // so consider teleportTargetValid to be false, to hide the mesh, until then
          set(state => ({ ...state, teleportTargetValid: false }))
        },
        onDragTeleportEnd: (context, event) => {
          log('-- onDragTeleportEnd')
          set(state => ({ ...state, teleportTargetValid: false }))
        },
        onTeleport: (context, event) => {
          log('-- teleport')
          if (teleportTargetValid) {
            let pos = useStoreApi.getState().teleportTargetPos

            // world scale is always reset to large
            setMiniMode(false, camera)

            // reposition
            teleport(camera, pos[0], 0, pos[2], null)

            // clear any prior memento
            clearStandingMemento()

            playSound('teleport')
          }
        },
        onPosingCharacterEntry: (context, event) => {
          let ikHelper = getIkHelper()
          if(!ikHelper.isSelected())
          {
            interactionService.send({ type: 'STOP_POSING', controller: event.target})
            return
          }
          // Disables ikHelper update and disable ik
          // in order to prevent ik updates
          ikHelper.updateStarted = true
          ikHelper.ragDoll.isEnabledIk = false

          let headControlPoint = ikHelper.getControlPointByName("Head")
          let leftArmControlPoint = ikHelper.getControlPointByName("LeftHand")
          let rightArmControlPoint = ikHelper.getControlPointByName("RightHand")

          let headBone = ikHelper.ragDoll.chainObjects['Head'].lastBone
          let leftHandBone = ikHelper.ragDoll.chainObjects['LeftHand'].lastBone
          let rightHandBone = ikHelper.ragDoll.chainObjects['RightHand'].lastBone

          let leftController = getControllerByName(controllers, "left")
          let rightController = getControllerByName(controllers, "right")

          // Calculates relative angle between hmdElement(controllers and cameras) and originalBones
          // And Applies transforms hmdElement rotation to originalBones rotation
          const relativeAngle = (hmdElement, originalBone, staticRotation, parent) => {
            let orignalMesh = ikHelper.ragDoll.originalMesh
            let boneInOriginalMesh = orignalMesh.skeleton.bones.find(object => object.name === originalBone.name)

            let parentQuat = boneInOriginalMesh.parent.worldQuaternion().inverse()
            // Applies parent invese rotation to extract bone from it's parent rotation
            boneInOriginalMesh.quaternion.copy(parentQuat)
            // Applies static rotation to bone
            boneInOriginalMesh.quaternion.multiply(staticRotation)
            boneInOriginalMesh.updateMatrixWorld(true)

            // Sets up default (looking forward) camera's parent rotation
            // Serves as a static rotation of camera's parent
            if (parent) {
              parent.rotation.x = Math.PI
              parent.rotation.y = 0
              parent.rotation.z = Math.PI
            }
            
            // Calculates delta aka relative angle
            let delta = new THREE.Quaternion()
            
            if (parent) {
              delta.multiply(parent.worldQuaternion().conjugate())
            }
            
            delta.multiply(boneInOriginalMesh.worldQuaternion())

            // Applies delta to transform hmdElement rotation to bone space
            let controllerWorldQuaternion = hmdElement.worldQuaternion()
            controllerWorldQuaternion.multiply(delta)
            let transformMatrix = new THREE.Matrix4()
            transformMatrix.multiply(boneInOriginalMesh.matrix)
            transformMatrix.multiply(boneInOriginalMesh.matrixWorld.inverse())
            controllerWorldQuaternion.applyMatrix4(transformMatrix)
            boneInOriginalMesh.quaternion.copy(controllerWorldQuaternion)
            boneInOriginalMesh.updateMatrix()
            boneInOriginalMesh.updateWorldMatrix(false, true)
          }

          // Atttaches control point to HMDElement(controllers and camera)
          // and sets it's position to (0, 0, 0) in order to put control point in the center of hmd element
          const attachControlPointToHmdElement = (hmdElement, controlPoint) => {
            hmdElement.attach(controlPoint)
            controlPoint.updateMatrixWorld(true)
            controlPoint.position.set(0, 0, 0)
            controlPoint.updateMatrixWorld(true)
          }

          // world scale is always reset to large
          setMiniMode(false, camera)

          // Taking world position of control point
          let worldPosition = headControlPoint.worldPosition()

          // Taking world quaternion of head bone
          camera.parent.userData.prevPosition = useStoreApi.getState().teleportPos
          camera.parent.userData.prevRotation = useStoreApi.getState().teleportRot

          // Setting teleport position and apply rotation influence by 180 degree to translate it to hmd
          teleport(realCamera, worldPosition.x, worldPosition.y - realCamera.position.y, worldPosition.z, ikHelper.ragDoll.originalObject.rotation.y + THREE.Math.degToRad(180))

          let eulerRot = new THREE.Euler(0, 0, 0)
          let staticLimbRotation = new THREE.Quaternion().setFromEuler(eulerRot)
          staticLimbRotation.setFromEuler(eulerRot)
          
          relativeAngle(realCamera, headBone, staticLimbRotation, realCamera.parent)

          eulerRot = new THREE.Euler(0, 0 ,0)
          eulerRot.x = THREE.Math.degToRad(90)
          eulerRot.y = THREE.Math.degToRad(90)
          staticLimbRotation.setFromEuler(eulerRot)
          relativeAngle(rightController, rightHandBone, staticLimbRotation, rightController.parent)

          eulerRot.y = THREE.Math.degToRad(-90)
          staticLimbRotation.setFromEuler(eulerRot)
          relativeAngle(leftController, leftHandBone, staticLimbRotation, leftController.parent)

          ikHelper.ragDoll.update()
          let leftArmPoleTarget = ikHelper.ragDoll.chainObjects["LeftHand"].poleConstraint.poleTarget
          let rightArmPoleTarget = ikHelper.ragDoll.chainObjects["RightHand"].poleConstraint.poleTarget
          let neckBone = ikHelper.ragDoll.originalMesh.skeleton.bones.find(object => object.name === "Hips").worldPosition()
          if(!leftArmPoleTarget.mesh.userData.isInitialized)
          leftArmPoleTarget.mesh.position.y = neckBone.y
          if(!rightArmPoleTarget.mesh.userData.isInitialized)
          rightArmPoleTarget.mesh.position.y = neckBone.y
          realCamera.updateMatrixWorld(true, true)

          attachControlPointToHmdElement(realCamera, headControlPoint)
          attachControlPointToHmdElement(rightController, rightArmControlPoint)
          attachControlPointToHmdElement(leftController, leftArmControlPoint)   
          headControlPoint.updateMatrixWorld()
          const mirror = new Mirror(gl, scene, 40, camera.aspect, {width: 1.0, height: 2.0} )
          ikHelper.ragDoll.originalObject.add(mirror)
          mirror.position.z += 2
          setTimeout(() => { interactionService.send({ type: 'STOP_POSING', controller: event.target}) }, 5000)
          setTimeout(() => { poseTicking() }, 1000)
          clearStandingMemento()
          ikHelper.updateStarted = false
          ikHelper.ragDoll.isEnabledIk = true
          uiService.send({ type: 'HIDE' })
        },
        onPosingCharacterExit: (context, event) => {
          let ikHelper = getIkHelper()
          ikHelper.ragDoll.isEnabledIk = false
          if(!ikHelper.isSelected())
          {
            return
          }
          ikHelper.selectedControlPoint = null
          let headControlPoint = ikHelper.getControlPointByName("Head")
          let leftArmControlPoint = ikHelper.getControlPointByName("LeftHand")
          let rightArmControlPoint = ikHelper.getControlPointByName("RightHand")
          let mirror = scene.getObjectByName("Mirror")
          scene.remove(mirror)
          ikHelper.ragDoll.updateReact()
          ikHelper.controlPoints.attach(headControlPoint)
          ikHelper.controlPoints.attach(leftArmControlPoint)
          ikHelper.controlPoints.attach(rightArmControlPoint)
          leftArmControlPoint.updateWorldMatrix(true, true)
          useStoreApi.setState({teleportPos : {x, y, z} = camera.parent.userData.prevPosition} )
          useStoreApi.setState({teleportRot : {x, y, z} = camera.parent.userData.prevRotation} )
          playSound('endPosing')
          uiService.send({ type: 'SHOW' })
        },
        onDropLowest: (context, event) => {
          let object = scene.__interaction.find(o => o.userData.id === context.selection)
          let placesForDrop = scene.__interaction.concat([groundRef.current])

          if (object.userData.type === 'character') {
            let positionDifference = object.worldPosition().clone()
            dropCharacter(object, placesForDrop)
            positionDifference.sub(object.worldPosition())

            // if a controller is dragging the character ...
            if (context.draggingController != null) {
              // ... find out which controller it is
              let controller = gl.xr.getController(context.draggingController)
              // ... and add the difference to that controller's selectOffset
              controller.userData.selectOffset.add(positionDifference)
            }
          } else {
            dropObject(object, placesForDrop)
          }

          // if we're in `selected` mode, we can commit the change immediately
          if (interactionService.state.value === 'selected') {
            commit(context.selection, object)
          }

          playSound('drop')
        },
        onSelected: (context, event) => {
          let controller = event.controller
          let { object, distance, point } = event.intersection
          if (object.userData.blocked || object.userData.locked) {
            return
          }

          log('-- onSelected')
          // selectOffset is used for Character
          controller.userData.selectOffset = getSelectOffset(controller, object, distance, point)
          if(object.userData.type === "attachable") {
            dispatch(selectAttachable({id: context.selection, bindId: object.userData.attachToId}))
          } else {
            dispatch(selectObject(context.selection))
          }

          playSound('select')
        },

        onSelectNone: (context, event) => {
          let controller = event.controller
          log('-- onSelectNone', controller)

          if (controller) controller.userData.selectOffset = null
          dispatch(selectObject(null))
          BonesHelper.getInstance().resetSelection()
        },

        onDragControlPointEntry: (context, event) =>
        {
          let controller = gl.xr.getController(context.draggingController)
          let object = event.intersection.object
          getIkHelper().selectControlPoint(object.name)
          controller.attach(object)
        },
        moveAndRotateControlPoint: (context, event) =>
        {
          let selectedControlTarget = getIkHelper().selectedControlPoint
          let { worldScale } = useStoreApi.getState()
          moveObjectZ(selectedControlTarget, event, worldScale)
        },
        onDragControlPointExit: (context, event) =>
        {
          getIkHelper().deselectControlPoint()
        },

        onDragObjectEntry: (context, event) => {
          let controller = gl.xr.getController(context.draggingController)
          let object = event.intersection.object

          if (object.userData.locked || object.userData.blocked) {
            return
          }

          if (object.userData.type !== 'character') {
            if(object.userData.type === "attachable")
            {
              attachableParent.current = object.parent
            }
            
            targetObject.current = {
              object,
              startData: {
                pos: object.position.clone(),
                rot: object.rotation.clone()
              }
            }
            
            controller.attach(object)
            object.updateMatrixWorld(true)
            SGConnection.blockObject(context.selection)
          }

          playSound('beam', object)

          uiService.send({ type: 'LOCK' })
        },
        
        onSelectionClear: (context, event) => {
          if (targetObject.current && targetObject.current.object.userData.type !== 'character' && targetObject.current.startData) {
            targetObject.current.object.position.copy(targetObject.current.startData.pos)
            targetObject.current.object.rotation.copy(targetObject.current.startData.rot)

            targetObject.current.object.updateMatrixWorld(true)
          }

          targetObject.current = null
        },
        
        onDragObjectExit: (context, event) => {
          let controller = gl.xr.getController(context.draggingController)
          let object = scene.__interaction.find(o => o.userData.id === context.selection)

          let root = rootRef.current
          if (object && object.parent !== root) {
            if(object.userData.type !== "attachable"){
              root.attach(object)
            }
            else {
              attachableParent.current.attach(object)
            }
            object.updateWorldMatrix(true, true)
          }

          stopSound('beam', object)

          if (SGConnection.unblockObject && context.selection) {
            SGConnection.unblockObject(context.selection)
          }
          
          commit(context.selection, object)
          if (object.userData.type === 'character') {
            let mapAttachables = Object.values(scene.__interaction).filter(sceneObject => sceneObject.userData.bindedId === object.userData.id)
            for(let i = 0; i < mapAttachables.length; i++) {
              commit(mapAttachables[i].userData.id, mapAttachables[i])
            }
          }

          uiService.send({ type: 'UNLOCK' })
        },
        
        onSnapStart: (context, event) => {
          let controller = gl.xr.getController(context.draggingController)
          let object = scene.__interaction.find(o => o.userData.id === context.selection)

          let root = rootRef.current
          // put object in root space
          root.attach(object)
          object.updateMatrixWorld(true)

          // rotate
          snapObjectRotation(object)
          object.userData.staticRotation = object.quaternion.clone()

          // put object in controller space
          controller.attach(object)
          object.updateMatrixWorld(true)
        },
        onSnapEnd: (context, event) => {
          let controller = gl.xr.getController(context.draggingController)
          let object = scene.__interaction.find(o => o.userData.id === context.selection)

          if (object && object.userData.staticRotation) {
            object.userData.staticRotation = null
          }
        },

        moveAndRotateCamera: (context, event) => {
          onMoveCamera(event)
          onRotateCamera(event)
        },

        moveAndRotateObject: (context, event) => {
          let controller = gl.xr.getController(context.draggingController)
          let object = scene.__interaction.find(o => o.userData.id === context.selection)
          
          let { worldScale } = useStoreApi.getState()

          let shouldMoveWithCursor = (object.userData.type === 'character')
          let target = shouldMoveWithCursor
            ? controller.getObjectByName('cursor')
            : object
          moveObjectZ(target, event, worldScale)

          rotateObjectY(object, event, controller)
        },


        onRotateBoneEntry: (context, event) => {
          let controller = event.controller
          let bone = event.intersection.bone

          useStoreApi.setState({
            boneRotationMemento: getRotationMemento(controller, bone)
          })

          // select by UUID, like shot generator does
          dispatch(selectBone(bone.uuid))
          BonesHelper.getInstance().selectBone(bone)

          playSound('bone-click')

          let parent
          bone.traverseAncestors(ancestor => {
            if (parent == null && ancestor.userData.type == 'character') {
              parent = ancestor
            }
          })
          playSound('bone-drone', parent)
        },
        onRotateBoneExit: (context, event) => {
          useStoreApi.setState({
            boneRotationMemento: {}
          })

          let selectedBone = getSelectedBone(store.getState())
          let bone = scene.getObjectByProperty('uuid', selectedBone)

          let parent
          bone.traverseAncestors(ancestor => {
            if (parent == null && ancestor.userData.type == 'character') {
              parent = ancestor
            }
          })

          let rotation = new THREE.Euler()
          rotation.setFromQuaternion(bone.quaternion.clone().normalize(), 'XYZ')

          let id = parent.userData.id
          let name = bone.name

          // TODO wrap in an undo group
          dispatch(
            updateCharacterSkeleton({
              id,
              name,
              rotation: {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z
              }
            })
          )
          dispatch(selectBone(null))
          BonesHelper.getInstance().resetSelection()

          stopSound('bone-drone', parent)
        },

        onToggleMiniMode: (context, event) => {
          let { worldScale } = useStoreApi.getState()

          if (worldScale === WORLD_SCALE_LARGE) {
            saveStandingMemento(camera)

            setMiniMode(true, camera) 
            getIkHelper().isInMiniMode(true)
          } else {
            setMiniMode(false, camera)
            getIkHelper().isInMiniMode(false)

            restoreStandingMemento(camera)
            clearStandingMemento()
          }
        }
      },

      // services: {
      //   example: (context, event) => new Promise(resolve => {
      //     console.log('an example service')
      //     resolve()
      //   })
      // },

      logger: log
    }
  )

  return { controllers, interactionServiceCurrent, interactionServiceSend }
}

module.exports = {
  useStore,
  useStoreApi,
  useInteractionsManager,
  WORLD_SCALE_LARGE,
  WORLD_SCALE_SMALL
}
