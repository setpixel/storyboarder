const THREE = require('three')
const { produce } = require('immer')
const undoable = require('redux-undo').default
const crypto = require('crypto')
const reduceReducers = require('../../vendor/reduce-reducers')
const { combineReducers } = require('redux')

const batchGroupBy = require('./shot-generator/batchGroupBy')

const hashify = string => crypto.createHash('sha1').update(string).digest('base64')

const capitalize = string => string.charAt(0).toUpperCase() + string.slice(1)

//
//
// selectors
//
const getSceneObjects = state => state.undoable.present.sceneObjects

const getSelections = state => state.undoable.present.selections

const getActiveCamera = state => state.undoable.present.activeCamera

const getSelectedBone = state => state.undoable.present.selectedBone

const getWorld = state => state.undoable.present.world


const getIsSceneDirty = state => {
  let current = hashify(JSON.stringify(getSerializedState(state)))
  return current !== state.meta.lastSavedHash
}
// return only the stuff we want to save to JSON
const getSerializedState = state => {
  let sceneObjects = Object.entries(getSceneObjects(state))
    .reduce((o, [ k, v ]) => {
      let {
        // ignore 'loaded'
        loaded: _,
        // but allow serialization of the rest
        ...serializable
      } = v
      o[k] = serializable
      return o
    }, {})

  return {
    world: getWorld(state),
    sceneObjects,
    activeCamera: getActiveCamera(state)
  }
}

//
//
// state helper functions
//
const checkForCharacterChanges = (state, draft, actionPayloadId) => {
  // check to see if character has changed from preset
  // and invalidate if so
  let characterPresetId = getSceneObjects(draft)[actionPayloadId].characterPresetId
  if (characterPresetId) {
    let statePreset = state.presets.characters[characterPresetId]

    // preset does not exist anymore
    if (!statePreset) {
      // so don't reference it
      getSceneObjects(draft)[actionPayloadId].characterPresetId = undefined
      return true
    }

    let stateCharacter = getSceneObjects(draft)[actionPayloadId]

    // for every top-level prop in the preset
    for (let prop in statePreset.state) {
      // if the prop is a number or a string
      if (
        typeof statePreset.state[prop] === 'number' ||
        typeof statePreset.state[prop] === 'string' ||
        typeof statePreset.state[prop] === 'undefined'
      ) {
        // if it differs

        if (stateCharacter[prop] != statePreset.state[prop]) {
          // changed, no longer matches preset
          getSceneObjects(draft)[actionPayloadId].characterPresetId = undefined
          return true
        }
      }
    }

    // hardcode check of second-level props
    if (
      stateCharacter.morphTargets.mesomorphic != statePreset.state.morphTargets.mesomorphic ||
      stateCharacter.morphTargets.ectomorphic != statePreset.state.morphTargets.ectomorphic ||
      stateCharacter.morphTargets.endomorphic != statePreset.state.morphTargets.endomorphic
    ) {
      // changed, no longer matches preset
      getSceneObjects(draft)[actionPayloadId].characterPresetId = undefined
      return true
    }
  }
}

const checkForSkeletonChanges = (state, draft, actionPayloadId) => {
  // check to see if pose has changed from preset
  // and invalidate if so
  let posePresetId = getSceneObjects(draft)[actionPayloadId].posePresetId
  if (posePresetId) {
    let statePreset = state.presets.poses[posePresetId]

    // preset does not exist anymore
    if (!statePreset) {
      // so don't reference it
      getSceneObjects(draft)[actionPayloadId].posePresetId = undefined
      return true
    }

    let draftSkeleton = getSceneObjects(draft)[actionPayloadId].skeleton

    let preset = statePreset.state.skeleton
    let curr = draftSkeleton

    if (Object.values(curr).length != Object.values(preset).length) {
      // changed, no longer matches preset
      getSceneObjects(draft)[actionPayloadId].posePresetId = undefined
      return true
    }

    for (name in preset) {
      if (
        preset[name].rotation.x !== curr[name].rotation.x ||
        preset[name].rotation.y !== curr[name].rotation.y ||
        preset[name].rotation.z !== curr[name].rotation.z
      ) {
        // changed, no longer matches preset
        getSceneObjects(draft)[actionPayloadId].posePresetId = undefined
        return true
      }
    }
  }
}

// migrate SceneObjects from older beta builds of Shot Generator 2.0
const migrateRotations = sceneObjects =>
  Object.entries(sceneObjects)
    .reduce((o, [ k, v ]) => {
      if (v.type === 'object' && typeof v.rotation === 'number') {
        v = {
          ...v,
          rotation: {
            x: 0,
            y: v.rotation,
            z: 0
          }
        }
      }
      o[k] = v
      return o
    }, {})

const updateObject = (draft, state, props, { models }) => {
  // TODO is there a simpler way to merge only non-null values?

  // update skeleton first
  // so that subsequent changes to height and headScale take effect
  if (props.hasOwnProperty('skeleton')) {
    draft.skeleton = props.skeleton
  }

  if (props.x != null) {
    draft.x = props.x
  }
  if (props.y != null) {
    draft.y = props.y
  }
  if (props.z != null) {
    draft.z = props.z
  }

  if (props.fov != null) {
    draft.fov = props.fov
  }
  if (props.rotation != null) {
    if (draft.type === 'object') {
      // MERGE
      draft.rotation = {
        ...state.rotation,
        ...props.rotation
      }
    } else {
      draft.rotation = props.rotation
    }
  }
  if (props.tilt != null) {
    draft.tilt = props.tilt
  }
  if (props.roll != null) {
    draft.roll = props.roll
  }
  if (props.model != null) {
    draft.model = props.model

    // if a character's model is changing
    if (draft.type === 'character') {
      // reset the height ...
      draft.height = models[props.model]
        // ... to default (if known) ...
        ? models[props.model].height
        // ... otherwise, a reasonable value
        : 1.6
    }
  }

  if (props.width != null) {
    draft.width = props.width
  }
  if (props.height != null) {
    draft.height = props.height
  }
  if (props.depth != null) {
    draft.depth = props.depth
  }

  if (props.headScale != null) {
    draft.headScale = props.headScale
  }

  if (props.morphTargets != null) {
    Object.entries(props.morphTargets).forEach(([key, value]) => {
      draft.morphTargets[key] = value
    })
  }

  // allow a null value for name
  if (props.hasOwnProperty('name')) {
    draft.name = props.name
  }

  if (props.visible != null) {
    draft.visible = props.visible
  }

  if (props.intensity != null) {
    draft.intensity = props.intensity
  }

  if (props.angle != null) {
    draft.angle = props.angle
  }

  if (props.penumbra != null) {
    draft.penumbra = props.penumbra
  }

  if (props.decay != null) {
    draft.decay = props.decay
  }

  if (props.distance != null) {
    draft.distance = props.distance
  }



  // for volumes
  if (props.numberOfLayers != null) {
    draft.numberOfLayers = props.numberOfLayers
  }
  if (props.distanceBetweenLayers != null) {
    draft.distanceBetweenLayers = props.distanceBetweenLayers
  }
  if (props.opacity != null) {
    draft.opacity = props.opacity
  }
  if (props.color != null) {
    draft.color = props.color
  }
  if (props.volumeImageAttachmentIds != null) {
    draft.volumeImageAttachmentIds = props.volumeImageAttachmentIds
  }



  if (props.hasOwnProperty('characterPresetId')) {
    draft.characterPresetId = props.characterPresetId
  }

  if (props.hasOwnProperty('posePresetId')) {
    draft.posePresetId = props.posePresetId
  }

  if (props.hasOwnProperty('loaded')) {
    draft.loaded = props.loaded
  }
}

// `loaded` status is not serialized
// when we load a new file, we need to initialize it
// so it can be read to determine loading progress
const resetLoadingStatus = sceneObjects => {
  for (let key in sceneObjects) {
    if (
      sceneObjects[key].type === 'character' ||
      sceneObjects[key].type === 'object' ||
      sceneObjects[key].type === 'volume'
    ) {
      sceneObjects[key] = {
        ...sceneObjects[key],
        loaded: sceneObjects[key].loaded == null
          ? false
          : sceneObjects[key].loaded
      }
    }
  }
  return sceneObjects
}

// decorate each SceneObject with a calculated displayName
const withDisplayNames = sceneObjects => {
  let countByType = {}

  for (let id in sceneObjects) {
    let sceneObject = sceneObjects[id]

    countByType[sceneObject.type] = countByType[sceneObject.type]
      ? countByType[sceneObject.type] + 1
      : 1

    let number = countByType[sceneObject.type]
    let displayName = capitalize(`${sceneObject.type} ${number}`)

    if (sceneObjects[id].displayName !== displayName) {
      // mutate
      sceneObjects[id] = {
        ...sceneObjects[id],
        displayName
      }
    }
  }

  return sceneObjects
}

// load up the default poses
const defaultPosePresets = require('./shot-generator-presets/poses.json')
 
// reference AE56DD1E-3F6F-4A74-B247-C8A6E3EB8FC0 as our Default Pose
const defaultPosePreset = defaultPosePresets['AE56DD1E-3F6F-4A74-B247-C8A6E3EB8FC0']

const defaultCharacterPreset = {
  height: 1.6256,
  model: 'adult-female',
  headScale: 1,
  // gender: 'female',
  // age: 'adult'
  morphTargets: {
    mesomorphic: 0,
    ectomorphic: 0,
    endomorphic: 0
  },
  name: undefined
}

const defaultScenePreset = {
  world: {
    ground: false,
    backgroundColor: 0xFFFFFF,
    room: {
      visible: true,
      width: 4,
      length: 4,
      height: 3
    },
    environment: {
      file: undefined,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      scale: 1,
      visible: true
    },
    ambient: {
      intensity: 0.1
    },
    directional: {
      intensity: 0.5,
      rotation: -0.9,
      tilt: 0.75
    }
  },
  sceneObjects: {
    'C2062AFC-D710-4C7D-942D-A3BAF8A76D5C': {
      id: 'C2062AFC-D710-4C7D-942D-A3BAF8A76D5C',
      type: 'object',
      model: 'box',
      width: 1,
      height: 1,
      depth: 1,
      x: 0,
      y: 0,
      z: 0,
      rotation: { x: 0, y: 0, z: 0 },
      name: undefined,
      visible: true
    },
    'D8B95127-6C04-40A9-B592-8870EEAF43A8': {
      id: 'D8B95127-6C04-40A9-B592-8870EEAF43A8',
      type: 'object',
      model: 'chair',
      width: 1,
      height: 1,
      depth: 1,
      x: 2,
      y: 0.5,
      z: 0,
      rotation: { x: 0, y: 0, z: 0 },
      name: undefined,
      visible: true
    },
    '94FA0F9D-E1E8-436B-8041-D831BD06CB33': {
      id: '94FA0F9D-E1E8-436B-8041-D831BD06CB33',
      type: 'object',
      model: 'box',
      width: .5,
      height: .5,
      depth: .5,
      x: -2,
      y: -2,
      z: 0,
      rotation: { x: 0, y: 2, z: 0 },
      name: undefined,
      visible: true
    },
    'A1A35319-82D1-4A24-98FE-136836750A61': {
      // non-preset properties
      id: 'A1A35319-82D1-4A24-98FE-136836750A61',
      type: 'character',
      x: 1,
      y: 0,
      z: 0,
      rotation: 0,
      visible: true,

      // character preset properties
      characterPresetId: '7C694D0F-9D45-4B74-BA70-38479E520091',
      ...defaultCharacterPreset,

      // pose preset properties
      posePresetId: defaultPosePreset.id,
      skeleton: defaultPosePreset.skeleton
    },

    '4F0FF9B8-BBB4-4D83-9E87-6EFE16A01D6F': {
      id: '4F0FF9B8-BBB4-4D83-9E87-6EFE16A01D6F',
      type: 'light',
      x: 1,
      y: 1.5,
      z: 2,
      rotation: 10,
      tilt: 10,
      intensity: 0.7,
      visible: true,
      angle: 1.04,
      distance: 3,
      penumbra: 0,
      decay: 1,
    },

    '6BC46A44-7965-43B5-B290-E3D2B9D15EEE': {
      id: '6BC46A44-7965-43B5-B290-E3D2B9D15EEE',
      type: 'camera',
      fov: 22.25,
      x: 0,
      y: 6,
      z: 1,
      rotation: -0.0,
      tilt: 0,
      roll: 0.0,
      name: undefined
    },
  },
  activeCamera: '6BC46A44-7965-43B5-B290-E3D2B9D15EEE',
}

const initialScene = {
  world: {
    ground: true,
    backgroundColor: 0xFFFFFF,
    room: {
      visible: false,
      width: 4,
      length: 4,
      height: 3
    },
    environment: {
      file: undefined,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      scale: 1,
      visible: true
    },
    ambient: {
      intensity: 0.5
    },
    directional: {
      intensity: 0.5,
      rotation: -0.9,
      tilt: 0.75
    }
  },
  sceneObjects: {
    '6BC46A44-7965-43B5-B290-E3D2B9D15EEE': {
      id: '6BC46A44-7965-43B5-B290-E3D2B9D15EEE',
      type: 'camera',
      fov: 22.25,
      x: 0,
      y: 6,
      z: 1,
      rotation: 0,
      tilt: 0,
      roll: 0.0,
      name: undefined
    }
  },
  activeCamera: '6BC46A44-7965-43B5-B290-E3D2B9D15EEE'
}

// TODO sg key
const initialState = {
  models: {
    'adult-female': {
      id: 'adult-female',
      name: 'Adult Female',
      type: 'character',
      height: 1.65
    },
    'adult-male': {
      id: 'adult-male',
      name: 'Adult Male',
      type: 'character',
      height: 1.8
    },
    'teen-female': {
      id: 'teen-female',
      name: 'Teen Female',
      type: 'character',
      height: 1.6
    },
    'teen-male': {
      id: 'teen-male',
      name: 'Teen Male',
      type: 'character',
      height: 1.6
    },

    'box': {
      id: 'box',
      name: 'box',
      type: 'object',
      height: 1
    },
    'tree': {
      id: 'tree',
      name: 'tree',
      type: 'object',
      height: 1
    },
    'chair': {
      id: 'chair',
      name: 'chair',
      type: 'object',
      height: 1
    },
    'car': {
      id: 'car',
      name: 'car',
      type: 'object',
      height: 1
    },
    'door': {
      id: 'door',
      name: 'door',
      type: 'object',
      height: 1
    },
    'building': {
      id: 'building_one_storey',
      name:  'building (1)',
      type: 'object',
      height: 1
    }
  },

  attachments: {},

  aspectRatio: 2.35,

  board: {},

  undoable: {
    world: initialScene.world,
    activeCamera: initialScene.activeCamera,
    sceneObjects: withDisplayNames(initialScene.sceneObjects),

    selections: [],
    selectedBone: null,
  },

  meta: {
    storyboarderFilePath: undefined,
    lastSavedHash: undefined
  },

  workspace: {
    guides: {
      center: false,
      thirds: false
    }
  },

  mainViewCamera: 'live', // 'ortho' or 'live'
  input: {
    accel: [0, 0, 0],
    mag: [0, 0, 0],
    sensor: [0, 0, 0, 0],
    down: false,
    mouseMode: false,
    orbitMode: false
  },
  devices: {
    0: {
      analog: {
        lStickX: 127,
        lStickY: 127,
        rStickX: 127,
        rStickY: 127
      },
      motion: {
        gryoPitch: 0,
        gyroRoll: 0,
        gyroYaw: 0
      },
      digital: {
        circle: false
      }
    }
  },
  presets: {
    scenes: {
      'C181CF19-AF44-4348-8BCB-FB3EE582FC5D': {
        id: 'C181CF19-AF44-4348-8BCB-FB3EE582FC5D',
        name: 'Default Scene',
        state: defaultScenePreset
      }
    },

    characters: {
      '7C694D0F-9D45-4B74-BA70-38479E520091': {
        id: '7C694D0F-9D45-4B74-BA70-38479E520091',
        name: 'Default Character',
        state: defaultCharacterPreset
      }
    },

    poses: defaultPosePresets
  },
  server: {
    uri: undefined,
    client: false
  }
}

const selectionsReducer = (state = [], action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        // clear selections
        return []

      // select a single object
      case 'SELECT_OBJECT':
        return (action.payload == null)
          // empty the selection
          ? []
          // make the selection
          : [action.payload]

      case 'SELECT_OBJECT_TOGGLE':
        let n = draft.indexOf(action.payload)
        if (n === -1) {
          draft.push(action.payload)
        } else {
          draft.splice(n, 1)
        }
        return

      case 'DUPLICATE_OBJECTS':
        // select the new duplicates, replacing the selection list
        return action.payload.newIds

      case 'DELETE_OBJECTS':
        for (let id of action.payload.ids) {
          // did we remove a selected id?
          if (draft.includes(id)) {
            // delete it from the selections list
            draft.splice(draft.indexOf(id), 1)
          }
        }
        return

      default:
        return
    }
  })
}

const sceneObjectsReducer = (state = {}, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        return withDisplayNames(
          resetLoadingStatus(
            migrateRotations(action.payload.sceneObjects)
          )
        )

      case 'CREATE_OBJECT':
        let id = action.payload.id != null
          ? action.payload.id
          : THREE.Math.generateUUID()

        draft[id] = {
          ...action.payload, id
        }

        return withDisplayNames(draft)

      case 'DELETE_OBJECTS':
        if (
          action.payload.ids == null ||
          action.payload.ids.length === 0
        ) return

        for (let id of action.payload.ids) {
          if (draft[id] == null) continue

          delete draft[id]
        }

        return withDisplayNames(draft)

      case 'UPDATE_OBJECT':
        if (draft[action.payload.id] == null) return

        updateObject(
          draft[action.payload.id],
          state[action.payload.id],
          action.payload,
          { models: initialState.models }
        )
        return

      case 'UPDATE_OBJECTS':
        for (let [ key, value ] of Object.entries(action.payload)) {
          if (draft[key] == null) return

          draft[key].x = value.x
          draft[key].y = value.y
        }
        return

      case 'DUPLICATE_OBJECTS':
        for (let n in action.payload.ids) {
          let srcId = action.payload.ids[n]
          let dstId = action.payload.newIds[n]

          let offsetX = 0.5 // (Math.random() * 2 - 1)
          let offsetY = 0.5 // (Math.random() * 2 - 1)

          if (draft[srcId]) {
            let source = draft[srcId]

            draft[dstId] = {
              ...source,
              name: source.name == null ? null : source.name + ' copy',
              x: source.x + offsetX,
              y: source.y + offsetY,
              z: source.z,
              id: dstId
            }
          }
        }
        return withDisplayNames(draft)

      case 'UPDATE_CHARACTER_SKELETON':
        draft[action.payload.id].skeleton = draft[action.payload.id].skeleton || {}
        draft[action.payload.id].skeleton[action.payload.name] = {
          rotation: action.payload.rotation
        }
        return

      case 'ATTACHMENTS_RELOCATE':
        let { src, dst } = action.payload
        for (let id in draft) {
          let sceneObject = draft[id]

          if (sceneObject.model === src) {
            sceneObject.model = dst
          }
        }
        return

      default:
        return
    }
  })
}

const metaReducer = (state = {}, action, appState) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        draft.lastSavedHash = hashify(JSON.stringify(getSerializedState(appState)))
        return

      case 'MARK_SAVED':
        draft.lastSavedHash = hashify(JSON.stringify(getSerializedState(appState)))
        return

      case 'SET_META_STORYBOARDER_FILE_PATH':
        draft.storyboarderFilePath = action.payload
        return

      default:
        return
    }
  })
}

const activeCameraReducer = (state = initialScene.activeCamera, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        return action.payload.activeCamera

      case 'SET_ACTIVE_CAMERA':
        return action.payload
      
      default:
        return
    }
  })
}

const selectedBoneReducer = (state = null, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        // clear selections
        return null

      // select a single object
      case 'SELECT_OBJECT':
        // de-select any currently selected bone
        return null

      case 'SELECT_BONE':
        return action.payload

      case 'DELETE_OBJECTS':
        // de-select any currently selected bone
        draft = null

      default:
        return
    }
  })
}

const worldReducer = (state = initialState.undoable.world, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        let result = {
          ...action.payload.world,

          // migrate older scenes which were missing ambient and directional light settings
          ambient: action.payload.world.ambient || initialScene.world.ambient,
          directional: action.payload.world.directional || initialScene.world.directional
        }
        return result

      case 'UPDATE_WORLD':
        if (action.payload.hasOwnProperty('ground')) {
          draft.ground = action.payload.ground
        }
        if (action.payload.hasOwnProperty('backgroundColor')) {
          draft.backgroundColor = action.payload.backgroundColor
        }
        return

      case 'UPDATE_WORLD_ROOM':
        if (action.payload.hasOwnProperty('width')) { draft.room.width = action.payload.width }
        if (action.payload.hasOwnProperty('length')) { draft.room.length = action.payload.length }
        if (action.payload.hasOwnProperty('height')) { draft.room.height = action.payload.height }
        if (action.payload.hasOwnProperty('visible')) { draft.room.visible = action.payload.visible }
        return

      case 'UPDATE_WORLD_ENVIRONMENT':
        if (action.payload.hasOwnProperty('file')) {
          draft.environment.file = action.payload.file
        }
        if (action.payload.scale != null) {
          draft.environment.scale = action.payload.scale
        }
        if (action.payload.visible != null) {
          draft.environment.visible = action.payload.visible
        }
        if (action.payload.rotation != null) {
          draft.environment.rotation = action.payload.rotation
        }
        if (action.payload.x != null) {
          draft.environment.x = action.payload.x
        }
        if (action.payload.y != null) {
          draft.environment.y = action.payload.y
        }
        if (action.payload.z != null) {
          draft.environment.z = action.payload.z
        }
        if (action.payload.intensity != null) {
          draft.ambient.intensity = action.payload.intensity
        }
        if (action.payload.intensityDirectional != null) {
          draft.directional.intensity = action.payload.intensityDirectional
        }
        if (action.payload.rotationDirectional != null) {
          draft.directional.rotation = action.payload.rotationDirectional
        }
        if (action.payload.tiltDirectional != null) {
          draft.directional.tilt = action.payload.tiltDirectional
        }
        return

      default:
        return
    }
  })
}

const mainReducer = (state/* = initialState*/, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'LOAD_SCENE':
        draft.mainViewCamera = 'live'
        return

      case 'SET_INPUT_ACCEL':
        draft.input.accel = action.payload
        return

        case 'SET_INPUT_MAG':
        draft.input.mag = action.payload
        return

        case 'SET_INPUT_SENSOR':
        draft.input.sensor = action.payload
        return

      case 'SET_INPUT_DOWN':
        draft.input.down = action.payload
        return

      case 'SET_INPUT_MOUSEMODE':
        draft.input.mouseMode = action.payload
        return

      case 'SET_INPUT_ORBITMODE':          
        draft.input.orbitMode = action.payload
        return

      case 'UPDATE_MODELS':
        draft.models = {
          ...state.models,
          ...action.payload
        }
        return

      case 'SET_ASPECT_RATIO':
        draft.aspectRatio = action.payload
        return

      case 'SET_MAIN_VIEW_CAMERA':
        draft.mainViewCamera = action.payload
        return

      case 'CREATE_SCENE_PRESET':
        draft.presets.scenes[action.payload.id] = action.payload
        return

      case 'DELETE_SCENE_PRESET':
        delete draft.presets.scenes[action.payload.id]
        return

      case 'UPDATE_SCENE_PRESET':
        // allow a null value for name
        if (action.payload.hasOwnProperty('name')) {
          draft.presets.scenes[action.payload.id].name = action.payload.name
        }
        return

      case 'UPDATE_DEVICE':
        draft.devices[action.payload.id] = action.payload
        return

      case 'CREATE_CHARACTER_PRESET':
        draft.presets.characters[action.payload.id] = action.payload
        return

      case 'CREATE_POSE_PRESET':
        draft.presets.poses[action.payload.id] = action.payload
        return

      case 'DELETE_POSE_PRESET':
        delete draft.presets.poses[action.payload.id]
        return

      case 'UPDATE_POSE_PRESET':
        // allow a null value for name
        if (action.payload.hasOwnProperty('name')) {
          draft.presets.poses[action.payload.id].name = action.payload.name
        }
        return

      case 'UPDATE_SERVER':
        console.log('%cshot-generator web client at', 'color:blue', action.payload.uri)
        draft.server = { ...draft.server, ...action.payload }
        return

      case 'SET_BOARD':
        draft.board = action.payload
        return

      case 'TOGGLE_WORKSPACE_GUIDE':
        draft.workspace.guides[action.payload] = !draft.workspace.guides[action.payload]
        return

      case 'ATTACHMENTS_PENDING':
        draft.attachments[action.payload.id] = { status: 'NotAsked' }
        return
      case 'ATTACHMENTS_LOAD':
        draft.attachments[action.payload.id] = { status: 'Loading' }
        return
      case 'ATTACHMENTS_SUCCESS':
        draft.attachments[action.payload.id] = { status: 'Success', value: action.payload.value }
        return
      case 'ATTACHMENTS_ERROR':
        draft.attachments[action.payload.id] = { status: 'Error', error: action.payload.error }
        return

      case 'ATTACHMENTS_DELETE':
        delete draft.attachments[action.payload.id]
        return

      case 'UNDO_GROUP_START':
        batchGroupBy.start(action.payload)
        return

      case 'UNDO_GROUP_END':
        batchGroupBy.end(action.payload)
        return
    }
  })
}

const checksReducer = (state, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'UPDATE_OBJECT':
        // ignore actions that are just changes to `loaded`
        if (action.payload.hasOwnProperty('loaded')) return

        let sceneObject = getSceneObjects(draft)[action.payload.id]
        if (sceneObject.type === 'character') {
          // unless characterPresetId was just set ...
          if (!action.payload.hasOwnProperty('characterPresetId')) {
            // ... detect change between state and preset
            checkForCharacterChanges(state, draft, action.payload.id)
          }

          // unless posePresetId was just set ...
          if (!action.payload.hasOwnProperty('posePresetId')) {
            // ... detect change between state and preset
            checkForSkeletonChanges(state, draft, action.payload.id)
          }
        }
        return

      // if we ever allow UPDATE_OBJECTS to change more stuff:
      // case 'UPDATE_OBJECTS':
        // if we ever allow UPDATE_OBJECTS to change character properties,
        // uncomment this:
        // checkForCharacterChanges(state, draft, key)

        // if we ever allow UPDATE_OBJECTS to change skeletons,
        // uncomment this:
        // checkForSkeletonChanges(state, draft, key)
        // return

      case 'UPDATE_CHARACTER_SKELETON':
        checkForSkeletonChanges(state, draft, action.payload.id)
        return

      // when we REDO, we are changing the entire state all at once
      // so, we gotta run all the checks
      case '@@redux-undo/REDO':
        for (let sceneObject of Object.values(getSceneObjects(draft))) {
          if (sceneObject.type === 'character') {
            checkForCharacterChanges(state, draft, sceneObject.id)
            checkForSkeletonChanges(state, draft, sceneObject.id)
          }
        }
        return

      default:
        return
    }
  })
}

const filterHistory = (action, currentState, previousHistory) => {
  // ignore `loaded` status updates
  if (action.type === 'UPDATE_OBJECT' && Object.keys(action.payload).includes('loaded')) {
    return false
  }

  return true
}

const undoableReducers = combineReducers({
  sceneObjects: sceneObjectsReducer,
  activeCamera: activeCameraReducer,
  world: worldReducer,
  selections: selectionsReducer,
  selectedBone: selectedBoneReducer
})

const undoableReducer = undoable(
  undoableReducers,
  {
    limit: 50,

    filter: filterHistory,

    // uncomment to automatically group any series of UPDATE_OBJECT or UPDATE_OBJECTS:
    // groupBy: batchGroupBy.init(['UPDATE_OBJECT', 'UPDATE_OBJECTS'])
    groupBy: batchGroupBy.init()
  }
)

const rootReducer = reduceReducers(
  initialState,

  mainReducer,

  (state, action) => ({
    ...state,
    undoable: undoableReducer(state.undoable, action)
  }),

  checksReducer,

  // `meta` must run last, to calculate lastSavedHash
  (state, action) => ({
    ...state,
    meta: metaReducer(state.meta, action, state)
  })
)

module.exports = {
  initialState,

  reducer: rootReducer,

  //
  //
  // action creators
  //
  selectObject: id => ({ type: 'SELECT_OBJECT', payload: id }),
  selectObjectToggle: id => ({ type: 'SELECT_OBJECT_TOGGLE', payload: id }),

  selectBone: id => ({ type: 'SELECT_BONE', payload: id }),

  createObject: values => ({ type: 'CREATE_OBJECT', payload: values }),
  updateObject: (id, values) => ({ type: 'UPDATE_OBJECT', payload: { id, ...values } }),

  // batch update
  updateObjects: payload => ({ type: 'UPDATE_OBJECTS', payload }),
  
  deleteObjects: ids => ({ type: 'DELETE_OBJECTS', payload: { ids } }),

  duplicateObjects: (ids, newIds) => ({ type: 'DUPLICATE_OBJECTS', payload: { ids, newIds } }),

  setMainViewCamera: name => ({ type: 'SET_MAIN_VIEW_CAMERA', payload: name }),

  loadScene: data => ({ type: 'LOAD_SCENE', payload: data }),

  updateCharacterSkeleton: ({ id, name, rotation }) => ({
    type: 'UPDATE_CHARACTER_SKELETON',
    payload: { id, name, rotation }
  }),

  setActiveCamera: id => ({ type: 'SET_ACTIVE_CAMERA', payload: id }),

  resetScene: () => ({
    type: 'LOAD_SCENE',
    payload: {
      world: initialState.undoable.world,
      sceneObjects: initialState.undoable.sceneObjects,
      activeCamera: initialState.undoable.activeCamera
    }
  }),

  createScenePreset: payload => ({ type: 'CREATE_SCENE_PRESET', payload }),
  updateScenePreset: (id, values) => ({ type: 'UPDATE_SCENE_PRESET', payload: { id, ...values} }),
  deleteScenePreset: id => ({ type: 'DELETE_SCENE_PRESET', payload: { id } }),

  createCharacterPreset: payload => ({ type: 'CREATE_CHARACTER_PRESET', payload }),

  createPosePreset: payload => ({ type: 'CREATE_POSE_PRESET', payload }),
  updatePosePreset: (id, values) => ({ type: 'UPDATE_POSE_PRESET', payload: { id, ...values} }),
  deletePosePreset: id => ({ type: 'DELETE_POSE_PRESET', payload: { id } }),

  updateWorld: payload => ({ type: 'UPDATE_WORLD', payload }),
  updateWorldRoom: payload => ({ type: 'UPDATE_WORLD_ROOM', payload }),
  updateWorldEnvironment: payload => ({ type: 'UPDATE_WORLD_ENVIRONMENT', payload }),

  updateDevice: (id, values) => ({ type: 'UPDATE_DEVICE', payload: { id, ...values } }),

  updateServer: payload => ({ type: 'UPDATE_SERVER', payload }),

  setBoard: payload => ({ type: 'SET_BOARD', payload }),
  
  markSaved: () => ({ type: 'MARK_SAVED' }),

  toggleWorkspaceGuide: payload => ({ type: 'TOGGLE_WORKSPACE_GUIDE', payload }),

  undoGroupStart: payload => ({ type: 'UNDO_GROUP_START', payload }),
  undoGroupEnd: payload => ({ type: 'UNDO_GROUP_END', payload }),

  //
  //
  // selectors
  //
  getSceneObjects,
  getSelections,
  getActiveCamera,
  getSelectedBone,
  getWorld,

  getSerializedState,
  getIsSceneDirty
}
