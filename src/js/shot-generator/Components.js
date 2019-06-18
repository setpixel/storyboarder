const THREE = require('three')

const { ipcRenderer, remote } = require('electron')
const { dialog } = remote
const fs = require('fs-extra')
const path = require('path')

const React = require('react')
const { useState, useEffect, useRef, useContext } = React
const { connect } = require('react-redux')
const Stats = require('stats.js')
const { VariableSizeList } = require('react-window')
const classNames = require('classnames')
const prompt = require('electron-prompt')

const { createSelector } = require('reselect')

const child_process = require('child_process')

const h = require('../utils/h')
const useComponentSize = require('../hooks/use-component-size')

//const robot = require("robotjs")

const {
  //
  //
  // action creators
  //
  selectObject,
  selectObjectToggle,

  createObject,
  updateObject,
  deleteObjects,

  duplicateObjects,

  selectBone,
  setMainViewCamera,
  loadScene,
  saveScene,
  updateCharacterSkeleton,
  setActiveCamera,
  resetScene,
  createScenePreset,
  updateScenePreset,
  deleteScenePreset,

  createCharacterPreset,

  createPosePreset,
  updatePosePreset,
  deletePosePreset,

  updateWorld,
  updateWorldRoom,
  updateWorldEnvironment,

  markSaved,

  toggleWorkspaceGuide,
  undoGroupStart,
  undoGroupEnd,

  //
  //
  // selectors
  //
  getSerializedState,
  getIsSceneDirty,

  getSceneObjects,
  getSelections,
  getActiveCamera,
  getSelectedBone,
  getWorld
//} = require('../state')
} = require('../shared/reducers/shot-generator')

const IconSprites = require('./IconSprites')

const presetsStorage = require('../shared/store/presetsStorage')
//const presetsStorage = require('../presetsStorage')

const ModelLoader = require('../services/model-loader')

const NumberSliderComponent = require('./NumberSlider')
const NumberSlider = connect(null, {
  onDragStart: undoGroupStart,
  onDragEnd: undoGroupEnd
})(NumberSliderComponent.NumberSlider)
const NumberSliderTransform = require('./NumberSlider').transforms
const NumberSliderFormatter = require('./NumberSlider').formatters

const ModelSelect = require('./ModelSelect')
const AttachmentsSelect = require('./AttachmentsSelect')
const PosePresetsEditor = require('./PosePresetsEditor')
const ServerInspector = require('./ServerInspector')
const MultiSelectionInspector = require('./MultiSelectionInspector')

require('../vendor/OutlineEffect.js')


window.THREE = THREE

// const draggables = (sceneObjects, scene) =>
//   //scene.children.filter(o => o.userData.type === 'object' || o instanceof BoundingBoxHelper)
//   scene.children.filter(o => o.userData.type === 'object' ||
//                               o.userData.type === 'character' ||
//                               o.userData.type === 'light' ||
//                               o.userData.type === 'volume' )

// const cameras = ( scene ) =>
//   scene.children.filter(o => o instanceof THREE.PerspectiveCamera)

const animatedUpdate = (fn) => (dispatch, getState) => fn(dispatch, getState())

const metersAsFeetAndInches = meters => {
  let heightInInches = meters * 39.3701
  let heightFeet = Math.floor(heightInInches / 12)
  let heightInches = Math.floor(heightInInches % 12)
  return [heightFeet, heightInches]
}

const feetAndInchesAsString = (feet, inches) => `${feet}′${inches}″`
const feetAndInchesAsString2nd = (feet, inches) => `${feet}'${inches}"`  //need these because sdf font doesn't have these glyphs

const shortId = id => id.toString().substr(0, 7).toLowerCase()

const preventDefault = (fn, ...args) => e => {
  e.preventDefault()
  fn(e, ...args)
}

/**
 * Return the first index containing an *item* which is greater than *item*.
 * @arguments _(item)_
 * @example
 *  indexOfGreaterThan([10, 5, 77, 55, 12, 123], 70) // => 2
 * via mohayonao/subcollider
 */
const indexOfGreaterThan = (array, item) => {
  for (var i = 0, imax = array.length; i < imax; ++i) {
    if (array[i] > item) { return i }
  }
  return -1
}
/**
 * Returns the closest index of the value in the array (collection must be sorted).
 * @arguments _(item)_
 * @example
 *  indexIn([2, 3, 5, 6], 5.2) // => 2
 * via mohayonao/subcollider
 */
 const indexIn = (array, item) => {
  var i, j = indexOfGreaterThan(array, item)
  if (j === -1) { return array.length - 1 }
  if (j ===  0) { return j }
  i = j - 1
  return ((item - array[i]) < (array[j] - item)) ? i : j
}

// all pose presets (so we can use `stand` for new characters)
const defaultPosePresets = require('../shared/reducers/shot-generator-presets/poses.json')
// id of the pose preset used for new characters
const DEFAULT_POSE_PRESET_ID = '79BBBD0D-6BA2-4D84-9B71-EE661AB6E5AE'

const SceneContext = React.createContext()



require('../vendor/three/examples/js/loaders/LoaderSupport')
require('../vendor/three/examples/js/loaders/GLTFLoader')
require('../vendor/three/examples/js/loaders/OBJLoader2')
const loadingManager = new THREE.LoadingManager()
const objLoader = new THREE.OBJLoader2(loadingManager)
const gltfLoader = new THREE.GLTFLoader(loadingManager)
objLoader.setLogging(false, false)
THREE.Cache.enabled = true

// const DebugObject = React.memo(({ id, type }) => {
//   useEffect(() => {
//     console.log(type, id, 'added')
//
//     return function cleanup () {
//       console.log(type, id, 'removed')
//     }
//   }, [])
//   console.log(type, id, 'render')
//
//   return null
// })



const Camera = React.memo(({ scene, id, type, setCamera, icon, ...props }) => {
  let camera = useRef(
    new THREE.PerspectiveCamera(
    props.fov,
    props.aspectRatio,
    // near
    0.01,
    // far
    1000
  ))

  useEffect(() => {
    console.log(type, id, 'added')

    // TODO do we ever need these?  - we do at least some (aspectRatio breaks)
    // camera.current.position.x = props.x
    // camera.current.position.y = props.z
    // camera.current.position.z = props.y
    // camera.current.rotation.x = 0
    // camera.current.rotation.z = 0
    // camera.current.rotation.y = props.rotation
    // camera.current.rotateX(props.tilt)
    // camera.current.rotateZ(props.roll)
    // camera.current.userData.type = type
    // camera.current.userData.id = id
    camera.current.fov = props.fov
    let focal = camera.current.getFocalLength()
    let [camFeet, camInches] = metersAsFeetAndInches(props.z)
    camera.current.aspect = props.aspectRatio
    camera.current.orthoIcon = new IconSprites( type, props.name ? props.name : props.displayName, camera.current, Math.round(focal)+"mm, "+feetAndInchesAsString2nd(camFeet, camInches) )
    camera.current.orthoIcon.position.copy(camera.current.position)
    camera.current.orthoIcon.icon.material.rotation = camera.current.rotation.y
    scene.add(camera.current.orthoIcon)

    let frustumIcons = new THREE.Object3D()

    frustumIcons.left = new IconSprites( 'object', '', camera.current )
    frustumIcons.right = new IconSprites( 'object', '', camera.current )
    frustumIcons.left.scale.set(0.06, 2.5, 1)
    frustumIcons.right.scale.set(0.06, 2.5, 1)
    //frustumIcons.left.icon.position.z = -0.3
    frustumIcons.left.icon.center = new THREE.Vector2(0.5, -0.2)
    frustumIcons.right.icon.center = new THREE.Vector2(0.5, -0.2)
    let hFOV = 2 * Math.atan( Math.tan( camera.current.fov * Math.PI / 180 / 2 ) * camera.current.aspect )
    frustumIcons.left.icon.material.rotation = hFOV/2 + camera.current.rotation.y
    frustumIcons.right.icon.material.rotation = -hFOV/2 + camera.current.rotation.y

    camera.current.orthoIcon.frustumIcons = frustumIcons
    frustumIcons.add(frustumIcons.left)
    frustumIcons.add(frustumIcons.right)
    camera.current.orthoIcon.add(frustumIcons)

    scene.add(camera.current)
    // setCamera(camera.current)

    // console.log(
    //   'focal length:',
    //   camera.current.getFocalLength(),
    //   'fov',
    //   camera.current.fov,
    //   'h',
    //   camera.current.getFilmHeight(),
    //   'gauge',
    //   camera.current.filmGauge,
    //   'aspect',
    //   camera.current.aspect
    // )

    return function cleanup () {
      console.log(type, id, 'removed')
      scene.remove(camera.current.orthoIcon)
      scene.remove(camera.current)
      // setCamera(null)
    }
  }, [])

  useEffect(()=>{
    if (camera.current) {
      camera.current.orthoIcon.changeFirstText(props.name ? props.name : props.displayName)
    }
  }, [props.displayName, props.name])

  useEffect(() => {
    camera.current.orthoIcon.setSelected(props.isSelected)
  }, [props.isSelected])

  camera.current.position.x = props.x
  camera.current.position.y = props.z
  camera.current.position.z = props.y
  camera.current.rotation.x = 0
  camera.current.rotation.z = 0
  camera.current.rotation.y = props.rotation
  camera.current.rotateX(props.tilt)
  camera.current.rotateZ(props.roll)
  camera.current.userData.type = type
  camera.current.userData.id = id
  camera.current.aspect = props.aspectRatio

  camera.current.fov = props.fov
  camera.current.updateProjectionMatrix()
  if (camera.current.orthoIcon) {
    camera.current.orthoIcon.position.copy(camera.current.position)
    let rotation = new THREE.Euler().setFromQuaternion( camera.current.quaternion, "YXZ" )   //always "YXZ" when we gat strange rotations
    camera.current.orthoIcon.icon.material.rotation = rotation.y

    let hFOV = 2 * Math.atan( Math.tan( camera.current.fov * Math.PI / 180 / 2 ) * camera.current.aspect )
    camera.current.orthoIcon.frustumIcons.left.icon.material.rotation = hFOV/2 + rotation.y
    camera.current.orthoIcon.frustumIcons.right.icon.material.rotation = -hFOV/2 + rotation.y


    //calculatedName = camera.current.name || capitalize(`${camera.current.type} ${number}`)
    //if (camera.current.orthoIcon.iconText)
      //camera.current.orthoIcon.iconText.textGeometry.update( calculatedName )

    let focal = camera.current.getFocalLength()
    let [camFeet, camInches] = metersAsFeetAndInches(props.z)
    if (camera.current.orthoIcon.iconSecondText)
      camera.current.orthoIcon.changeSecondText( Math.round(focal)+"mm, "+feetAndInchesAsString2nd(camFeet, camInches) )
    //camera.current.orthoIcon.frustumIcons = frustumIcons
  }
  camera.current.layers.enable(1)

  return null
})

const WorldElement = React.memo(({ index, world, isSelected, selectObject, style = {} }) => {
  const onClick = preventDefault(() => {
    selectObject(null)
  })

  let className = classNames({
    'selected': isSelected,
    'zebra': index % 2
  })

  return h([
    'div.element', { className, style: { height: ELEMENT_HEIGHT, ...style } }, [
      [
        'a.title[href=#]',
        { onClick },
        ['span.type', 'Scene']
      ]
    ]
  ])
})

const ListItem = ({ index, style, isScrolling, data }) => {
  const { items, models, selections, selectObject, selectObjectToggle, updateObject, deleteObjects, activeCamera, setActiveCamera, undoGroupStart, undoGroupEnd } = data
  const isWorld = index === 0

  const sceneObject = index === 0
    ? items[0]
    : items[index]

  return h(
    isWorld
    ? [
      WorldElement, {
        index,
        world: items[0],
        isSelected: selections.length === 0,
        selectObject
      }
    ]
    : [
        Element, {
          index,
          style,
          sceneObject,
          isSelected: selections.includes(sceneObject.id),
          isActive: sceneObject.type === 'camera' && sceneObject.id === activeCamera,
          allowDelete: (
            sceneObject.type != 'camera' ||
            sceneObject.type == 'camera' && activeCamera !== sceneObject.id
          ),
          selectObject,
          selectObjectToggle,
          updateObject,
          deleteObjects,
          setActiveCamera,
          undoGroupStart,
          undoGroupEnd
        }
      ]
  )
}

const Inspector = ({
  world,
  kind, data,
  models, updateObject, deleteObjects,
  machineState, transition,
  selectedBone,
  selectBone,
  updateCharacterSkeleton,
  updateWorld,
  updateWorldRoom,
  updateWorldEnvironment,
  storyboarderFilePath,
  selections
}) => {
  const { scene } = useContext(SceneContext)

  const ref = useRef()

  const onFocus = event => transition('TYPING_ENTER')
  const onBlur = event => transition('TYPING_EXIT')

  let sceneObject = data

  // try to exit typing if there is nothing to inspect
  useEffect(() => {
    if (!data) transition('TYPING_EXIT')
  }, [data])

  useEffect(() => {
    // automatically blur if typing mode was exited but a child of ours is focused
    if (!machineState.matches('typing')) {
      if (document.hasFocus()) {
        const el = document.activeElement
        if (ref.current.contains(el)) {
          el.blur()
        }
      }
    }
  }, [machineState])

  return h([
    'div#inspector',
    { ref, onFocus, onBlur },
    selections.length > 1
      ? [
          MultiSelectionInspector
        ]
      : (kind && data)
        ? [
            InspectedElement, {
              sceneObject,
              models,
              updateObject,
              selectedBone: scene.getObjectByProperty('uuid', selectedBone),
              machineState,
              transition,
              selectBone,
              updateCharacterSkeleton,
              storyboarderFilePath
            }
          ]
        : [
          InspectedWorld, {
            world,

            transition,

            updateWorld,
            updateWorldRoom,
            updateWorldEnvironment
          }
        ],
      [ServerInspector]
  ])
}

const InspectedWorld = ({ world, transition, updateWorld, updateWorldRoom, updateWorldEnvironment }) => {
  const onGroundClick = event => {
    event.preventDefault()
    updateWorld({ ground: !world.ground })
  }

  return h([
    'div',
    ['h4', { style: { margin: 0 } }, 'Scene'],
    [
      'div', { style: { marginBottom: 12 }},

      [
        'div.row',
        { style: { alignItems: 'center', margin: '6px 0 3px 0' } }, [

          ['div', { style: { width: 50, opacity: world.room.visible ? 0.5 : 1 } }, 'ground'],

          ['input', {
            type: 'checkbox',
            checked: world.ground,
            readOnly: true,
            style: {

            }
          }],

          ['label', {
            onClick: onGroundClick,
          }, [
            'span'
          ]]
        ]
      ],

      [NumberSlider,
        {
          label: 'bg color',
          value: world.backgroundColor / 0xFFFFFF,
          min: 0,
          max: 1,
          onSetValue: value => {
            // value is 0..1, scale to component value of 0x00...0xFF (0...255)
            let c = 0xFF * value
            // monochrome
            let backgroundColor = (c << 16) | (c << 8) | c
            updateWorld({ backgroundColor })
          }
        }
      ],

    ],

    [
      'div', { style: { marginBottom: 12 }},
      [
        ['h5', { style: { margin: 0 } }, 'Room'],

        [
          'div.row',
          { style: { alignItems: 'center', margin: '6px 0 3px 0' } }, [

            ['div', { style: { width: 50 } }, 'visible'],

            ['input', {
              type: 'checkbox',
              checked: world.room.visible,
              readOnly: true,
              style: {

              }
            }],

            ['label', {
              onClick: preventDefault(event => {
                updateWorldRoom({ visible: !world.room.visible })
              }),
            }, [
              'span'
            ]]
          ]
        ],

        ['div.column', [
          [NumberSlider, { label: 'width', value: world.room.width, min: 1.83, max: 76.2, onSetValue: value => updateWorldRoom({ width: value }) } ],
          [NumberSlider, { label: 'length', value: world.room.length, min: 1.83, max: 76.2, onSetValue: value => updateWorldRoom({ length: value }) } ],
          [NumberSlider, { label: 'height', value: world.room.height, min: 1.83, max: 12.19, onSetValue: value => updateWorldRoom({ height: value }) } ],
        ]]
      ]
    ],

    [
      'div', { style: { marginBottom: 12 }},
      [
        ['h5', { style: { margin: 0 } }, 'Environment'],

        [
          'div.row',
          { style: { alignItems: 'center', margin: '6px 0 3px 0' } }, [

            ['div', { style: { width: 50 } }, 'visible'],

            ['input', {
              type: 'checkbox',
              checked: world.environment.visible,
              readOnly: true,
              style: {

              }
            }],

            ['label', {
              onClick: preventDefault(event => {
                updateWorldEnvironment({ visible: !world.environment.visible })
              }),
            }, [
              'span'
            ]]
          ]
        ],

        ['div.row', [
          ['div', { style: { width: 50 } }, 'file'],
          ['div', [
            'a[href=#]',
            {
              onClick: preventDefault(event => {
                let filepaths = dialog.showOpenDialog(null, {})
                if (filepaths) {
                  let filepath = filepaths[0]
                  updateWorldEnvironment({ file: filepath })
                } else {
                  updateWorldEnvironment({ file: undefined })
                }
                // automatically blur to return keyboard control
                document.activeElement.blur()
                transition('TYPING_EXIT')
              }),
              style: {
                fontStyle: 'italic',
                textDecoration: 'none',
                borderBottomWidth: '1px',
                borderBottomStyle: 'dashed'
              }
            },
            world.environment.file ? path.basename(world.environment.file) : '(none)'
          ]]
        ]],

        ['div.column', [
          [NumberSlider, { label: 'x', value: world.environment.x, min: -30, max: 30, onSetValue: value => updateWorldEnvironment({ x: value }) } ],
          [NumberSlider, { label: 'y', value: world.environment.y, min: -30, max: 30, onSetValue: value => updateWorldEnvironment({ y: value }) } ],
          [NumberSlider, { label: 'z', value: world.environment.z, min: -30, max: 30, onSetValue: value => updateWorldEnvironment({ z: value }) } ],
        ]],

        ['div.row', [
          [
            NumberSlider, {
              label: 'scale',
              value: world.environment.scale,
              min: 0.001,
              max: 2,
              onSetValue: value => {
                updateWorldEnvironment({ scale: value })
              }
            }
          ]
        ]],

        ['div',
          [NumberSlider, {
            label: 'rotation',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(world.environment.rotation),
            onSetValue: rotation => {
              updateWorldEnvironment({ rotation: THREE.Math.degToRad(rotation) })
            },
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }]
        ]

      ]
    ],

    [
      'div', { style: { marginBottom: 12 }},
      [
        ['h5', { style: { margin: 0 } }, 'Ambient light'],

        [NumberSlider, { label: 'intensity', value: world.ambient.intensity, min: 0, max: 1, onSetValue: value => updateWorldEnvironment({ intensity: value }) } ],
      ]
    ],

    [
      'div', { style: { marginBottom: 12 }},
      [
        ['h5', { style: { margin: 0 } }, 'Directional light'],

        [NumberSlider, { label: 'intensity', value: world.directional.intensity, min: 0, max: 1, onSetValue: value => updateWorldEnvironment({ intensityDirectional: value }) } ],
        ['div',
          [NumberSlider, {
            label: 'rotation',
            min: -Math.PI,
            max: Math.PI,
            step: Math.PI/180,
            value: world.directional.rotation,
            onSetValue: rotationDirectional => {
              updateWorldEnvironment({ rotationDirectional })
            },
            transform: NumberSliderTransform.radians,
            formatter: NumberSliderFormatter.radToDeg
          }]
        ],
        ['div',
          [NumberSlider, {
            label: 'tilt',
            min: -Math.PI,
            max: Math.PI,
            step: Math.PI/180,
            value: world.directional.tilt,
            onSetValue: tiltDirectional => {
              updateWorldEnvironment({ tiltDirectional })
            },
            transform: NumberSliderTransform.radians,
            formatter: NumberSliderFormatter.radToDeg
          }]
        ]
      ]
    ]
  ])
}

const RemoteInputView = ({ remoteInput }) => {
  let input = remoteInput

  let accel = input.accel.map(x => x.toFixed())
  let mag = input.mag.map(x => x.toFixed())
  let sensor = input.sensor.map(x => x.toFixed(2))
  let down = (input.down ? 'Y' : 'N')

  return h(
    ['div#remoteInputView',
      ['div',
        'input',
        ['div', 'accel: ' + accel ],
        ['div', 'mag: ' +  mag],
        ['div', 'sensor: ' + sensor ],
        ['div', 'down: ' + down ]
      ]
    ],
  )
}

const ElementsPanel = connect(
  // what changes should we watch for to re-render?
  state => ({
    world: getWorld(state),
    sceneObjects: getSceneObjects(state),
    selections: getSelections(state),
    selectedBone: getSelectedBone(state),
    models: state.models,
    activeCamera: getActiveCamera(state),

    storyboarderFilePath: state.meta.storyboarderFilePath
  }),
  // what actions can we dispatch?
  {
    selectObject,
    selectObjectToggle,
    updateObject,
    deleteObjects,
    setActiveCamera,
    selectBone,
    updateCharacterSkeleton,
    updateWorld,
    updateWorldRoom,
    updateWorldEnvironment,
    undoGroupStart,
    undoGroupEnd
  }
)(
  React.memo(({ world, sceneObjects, models, selections, selectObject, selectObjectToggle, updateObject, deleteObjects, selectedBone, machineState, transition, activeCamera, setActiveCamera, selectBone, updateCharacterSkeleton, updateWorld, updateWorldRoom, updateWorldEnvironment, storyboarderFilePath, undoGroupStart, undoGroupEnd }) => {
    let ref = useRef(null)
    let size = useComponentSize(ref)

    let listRef = useRef(null)

    // TODO momoized selector
    // group by type
    let types = Object
     .entries(sceneObjects)
     .reduce((o, [ k, v ]) => {
       o[v.type] = o[v.type] || {}
       o[v.type][k.toString()] = v
       return o
    }, {})
    let sceneObjectsSorted = {
      ...types.camera,
      ...types.character,
      ...types.object,
      ...types.light,
      ...types.volume
    }

    let items = [
      world,
      ...Object.values(sceneObjectsSorted)
    ]

    const ItemsList = size.width && React.createElement(
      VariableSizeList,
      {
        ref: listRef,
        height: size.height,
        itemCount: items.length,
        itemSize: index => ELEMENT_HEIGHT,
        width: size.width,
        itemData: {
          items,

          models,
          selections,
          selectObject,
          selectObjectToggle,
          updateObject,
          deleteObjects,
          activeCamera,
          setActiveCamera,

          undoGroupStart,
          undoGroupEnd
        }
      },
      ListItem
    )

    useEffect(() => {
      let arr = Object.values(sceneObjectsSorted)
      let selected = arr.find(o => o.id === selections[0])
      let index = arr.indexOf(selected)
      if (index > -1) {
        // item 0 is always the world item
        // so add 1 to index for actual item
        listRef.current.scrollToItem(index + 1)
      }
    }, [selections])

    let kind = sceneObjects[selections[0]] && sceneObjects[selections[0]].type
    let data = sceneObjects[selections[0]]

    return React.createElement(
      'div', { style: { flex: 1, display: 'flex', flexDirection: 'column' }},
        React.createElement(
          'div', { ref, id: 'listing' },
          size.width
            ? ItemsList
            : null
        ),
        h(
          [Inspector, {
            world,

            kind,
            data,

            models, updateObject,

            machineState, transition,

            selectedBone, selectBone,

            updateCharacterSkeleton,

            updateWorld,
            updateWorldRoom,
            updateWorldEnvironment,

            storyboarderFilePath,

            selections
          }]
        )
      )
  }
))

const LabelInput = ({ label, setLabel, onFocus, onBlur }) => {
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  const onStartEditingClick = event => {
    setEditing(true)
  }

  const onSetLabelClick = event => {
    let value = ref.current.value
    if (value != null && value.length) {
      setLabel(value)
      setEditing(false)
    } else {
      setLabel(null)
      setEditing(false)
    }
    onBlur()
  }

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing, ref.current])

  return h(
    editing
      ? [
          'form',
          {
            onFocus,
            onBlur,

            style: {
              margin: '6px 0 12px 0'
            },
            onSubmit: preventDefault(onSetLabelClick),
          },
          [
            'input',
            {
              ref,
              style: {
                padding: 6
              },
              defaultValue: label
            }
          ],
          [
            'button',
            {
              style: {
                fontSize: 14,
                padding: 6,
                margin: '0 0 0 6px'
              }
            },
            'set'
          ]
        ]
      : [
          'a[href=#][className=object-property-heading]',
          {
            onClick: preventDefault(onStartEditingClick)
          },
          label + ' Properties'
        ]
  )
}

const saveCharacterPresets = state => presetsStorage.saveCharacterPresets({ characters: state.presets.characters })

const CharacterPresetsEditor = connect(
  state => ({
    characterPresets: state.presets.characters,
    models: state.models
  }),
  {
    updateObject,
    selectCharacterPreset: (id, characterPresetId, preset) => (dispatch, getState) => {
      dispatch(updateObject(id, {
        // set characterPresetId
        characterPresetId,

        // apply preset values to character model
        height: preset.state.height,
        //height: state.models[preset.state.model].baseHeight,
        model: preset.state.model,
        // gender: 'female',
        // age: 'adult'

        headScale: preset.state.headScale,

        morphTargets: {
          mesomorphic: preset.state.morphTargets.mesomorphic,
          ectomorphic: preset.state.morphTargets.ectomorphic,
          endomorphic: preset.state.morphTargets.endomorphic
        },

        name: preset.state.name
      }))
    },
    createCharacterPreset: ({ id, name, sceneObject }) => (dispatch, getState) => {
      // add the character data to a named preset
      let preset = {
        id,
        name,
        state: {
          height: sceneObject.height,
          //height: sceneObject.model.originalHeight,

          model: sceneObject.model,
          // gender: 'female',
          // age: 'adult'

          headScale: sceneObject.headScale,

          morphTargets: {
            mesomorphic: sceneObject.morphTargets.mesomorphic,
            ectomorphic: sceneObject.morphTargets.ectomorphic,
            endomorphic: sceneObject.morphTargets.endomorphic
          },

          name: sceneObject.name
        }
      }
      // create it
      dispatch(createCharacterPreset(preset))

      // save the presets file
      saveCharacterPresets(getState())

      // select the preset in the list
      dispatch(updateObject(sceneObject.id, { characterPresetId: id }))
    }
  }
)(
  // TODO could optimize by only passing sceneObject properties we actually care about
  React.memo(({ sceneObject, characterPresets, selectCharacterPreset, createCharacterPreset }) => {
    const onCreateCharacterPresetClick = event => {
      // show a prompt to get the desired preset name
      let id = THREE.Math.generateUUID()
      prompt({
        title: 'Preset Name',
        label: 'Select a Preset Name',
        value: `Character ${shortId(id)}`
      }, require('electron').remote.getCurrentWindow()).then(name => {
        if (name != null && name != '' && name != ' ') {
          createCharacterPreset({
            id,
            name,
            sceneObject
          })
        }
      }).catch(err => {
        console.error(err)
      })
    }

    const onSelectCharacterPreset = event => {
      let characterPresetId = event.target.value
      let preset = characterPresets[characterPresetId]
      selectCharacterPreset(sceneObject.id, characterPresetId, preset)
    }

    return h(
      ['div.row', { style: { margin: '9px 0 6px 0', paddingRight: 0 } }, [
        ['div', { style: { width: 50, display: 'flex', alignSelf: 'center' } }, 'preset'],
        [
          'select', {
            required: true,
            value: sceneObject.characterPresetId || '',
            onChange: preventDefault(onSelectCharacterPreset),
            style: {
              flex: 1,
              marginBottom: 0,
              maxWidth: 192
            }
          }, [
              ['option', { value: '', disabled: true }, '---'],
              Object.values(characterPresets).map(preset =>
                ['option', { value: preset.id }, preset.name]
              )
            ]
          ]
        ],
        ['a.button_add[href=#]', { style: { marginLeft: 6 }, onClick: preventDefault(onCreateCharacterPresetClick) }, '+']
      ]
    )
  })
)


const MORPH_TARGET_LABELS = {
  'mesomorphic': 'meso',
  'ectomorphic': 'ecto',
  'endomorphic': 'obese',
}
const InspectedElement = ({ sceneObject, models, updateObject, selectedBone, machineState, transition, selectBone, updateCharacterSkeleton, storyboarderFilePath }) => {
  const createOnSetValue = (id, name, transform = value => value) => value => updateObject(id, { [name]: transform(value) })

  let positionSliders = [
    [NumberSlider, { label: 'x', value: sceneObject.x, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'x') } ],
    [NumberSlider, { label: 'y', value: sceneObject.y, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'y') } ],
    [NumberSlider, { label: 'z', value: sceneObject.z, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'z') } ],
  ]

  let volumeSliders = (sceneObject.model === 'box' )
    ? [
        [NumberSlider, { label: 'width', value: sceneObject.width, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'width') } ],
        [NumberSlider, { label: 'height', value: sceneObject.height, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'height') } ],
        [NumberSlider, { label: 'depth', value: sceneObject.depth, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'depth') } ]
      ]
    : [
        NumberSlider, {
          label: 'size',
          value: sceneObject.depth,
          min: 0.025,
          max: 5,
          onSetValue: value => updateObject(
            sceneObject.id,
            { width: value, height: value, depth: value }
          )
        }
      ]

  const onFocus = event => transition('TYPING_ENTER')
  const onBlur = event => transition('TYPING_EXIT')

  // TODO selector?
  const modelValues = Object.values(models)
  const modelOptions = {
    object: modelValues
      .filter(model => model.type === 'object')
      .map(model => ({ name: model.name, value: model.id })),

    character: modelValues
      .filter(model => model.type === 'character')
      .map(model => ({ name: model.name, value: model.id }))
  }

  return h([
    'div',
      [
        LabelInput,
        {
          key: sceneObject.id,
          label: sceneObject.name != null
            ? sceneObject.name
            : sceneObject.displayName,
          onFocus,
          onBlur,
          setLabel: name => {
            updateObject(sceneObject.id, { name })
          }
        }
      ],

      // character preset
      sceneObject.type == 'character' && [
        [CharacterPresetsEditor, { sceneObject }],
      ],

      (sceneObject.type == 'object' || sceneObject.type == 'character') && [
        ModelSelect, {
          sceneObject,
          options: modelOptions[sceneObject.type],
          updateObject,
          transition
        }
      ],

      // sceneObject.type == 'object' && [
      //   'select', {
      //     value: sceneObject.model,
      //     onChange: event => {
      //       event.preventDefault()
      //       updateObject(sceneObject.id, { model: event.target.value })
      //     }
      //   }, [
      //     [['box', 'box'], ['tree', 'tree'], ['chair', 'chair']].map(([name, value]) =>
      //       ['option', { value }, name]
      //     )
      //   ]
      // ],

      sceneObject.type != 'camera' &&
        [
          'div.row',
          { style: { alignItems: 'center' } }, [

            // ['div', { style: { width: 50 } }, 'visible'],

            // ['input', {
            //   type: 'checkbox',
            //   checked: sceneObject.visible,
            //   readOnly: true
            // }],

            ['label', {
              onClick: preventDefault(event => {
                if (sceneObject.type === 'character') {
                  selectBone(null)
                }
                updateObject(sceneObject.id, { visible: !sceneObject.visible })
              }),
            }, [
              'span'
            ]]
          ]
        ],

      [
        'div.column',
        positionSliders
      ],

      (sceneObject.type == 'object' ) && [
        [
          'div.column',
          volumeSliders
        ],
      ],

      sceneObject.type == 'volume' && [
        [
          'div.column',

          [NumberSlider, { label: 'width', value: sceneObject.width, min: 0.1, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'width') } ],
          [NumberSlider, { label: 'height', value: sceneObject.height, min: -25, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'height') } ],
          [NumberSlider, { label: 'depth', value: sceneObject.depth, min: 0.1, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'depth') } ],

          ['div.number-slider', [
            ['div.number-slider__label', 'Layer Image Files'],
            ['div.number-slider__control', { style: { width: 137 }}, [
              AttachmentsSelect, {
                style: { flex: 1 },

                ids: sceneObject.volumeImageAttachmentIds,
                options: [
                  { name: 'rain', value: 'rain1,rain2' },
                  { name: 'fog', value: 'fog1,fog2' },
                  { name: 'explosion', value: 'debris,explosion' }
                ],
                copyFiles: filepaths => {
                  let projectDir = path.dirname(storyboarderFilePath)
                  let assetsDir = path.join(projectDir, 'models', 'volumes')
                  fs.ensureDirSync(assetsDir)

                  let dsts = []
                  for (let src of filepaths) {
                    let dst = path.join(assetsDir, path.basename(src))
                    console.log('copying from', src, 'to', dst)
                    try {
                      fs.copySync(src, dst)
                      dsts.push(dst)
                    } catch (err) {
                      console.error('could not copy', src)
                      alert('could not copy ' + src)
                    }
                  }

                  let ids = dsts.map(filepath => path.relative(projectDir, filepath))
                  console.log('setting attachment ids', ids)

                  return ids
                },
                onChange: volumeImageAttachmentIds => {
                  updateObject(sceneObject.id, { volumeImageAttachmentIds })
                },
                onBlur: () => transition('TYPING_EXIT')
              }
            ]
          ]]],

          [NumberSlider, {
            label: 'layers',
            value: sceneObject.numberOfLayers,
            min: 1,
            max: 10,
            step: 1,
            transform: NumberSliderTransform.round,
            formatter: NumberSliderFormatter.identity,
            onSetValue: createOnSetValue(sceneObject.id, 'numberOfLayers')}],
          [NumberSlider, { label: 'opacity', value: sceneObject.opacity, min: 0, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'opacity') } ],
          [NumberSlider, {
            label: 'color',
            value: sceneObject.color/0xFFFFFF,
            min: 0.0,
            max: 1,
            onSetValue: value => {
              let c = 0xFF * value
              let color = (c << 16) | (c << 8) | c
              updateObject(sceneObject.id, { color: color })
            }
          }]
        ],
      ],

      sceneObject.type == 'light' && [
        [
          'div.column',
          [NumberSlider, { label: 'intensity', value: sceneObject.intensity, min: 0.025, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'intensity') } ],
        ],
        [
          'div.column',
          [NumberSlider, {
            label: 'angle',
            value: sceneObject.angle,
            min: 0.025,
            max: Math.PI/2,
            onSetValue: createOnSetValue(sceneObject.id, 'angle'),
            step: Math.PI/180,
            transform: NumberSliderTransform.radians,
            formatter: NumberSliderFormatter.radToDeg
           }]
        ],
        [
          'div.column',
          [NumberSlider, { label: 'distance', value: sceneObject.distance, min: 0.025, max: 100, onSetValue: createOnSetValue(sceneObject.id, 'distance') } ],
        ],
        [
          'div.column',
          [NumberSlider, { label: 'penumbra', value: sceneObject.penumbra, min: 0, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'penumbra') } ],
        ],
        [
          'div.column',
          [NumberSlider, { label: 'decay', value: sceneObject.decay, min: 1, max: 2, onSetValue: createOnSetValue(sceneObject.id, 'decay') } ],
        ],
      ],

      sceneObject.type == 'object'
        ? [
            ['div',
              [NumberSlider, {
                label: 'rotate x',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.x),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { x: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ],
            ['div',
              [NumberSlider, {
                label: 'rotate y',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.z),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { z: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ],
            ['div',
              [NumberSlider, {
                label: 'rotate z',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.y),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { y: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ]
          ]
        : ['div',
            [NumberSlider, {
              label: 'rotation',
              min: -180,
              max: 180,
              step: 1,
              value: THREE.Math.radToDeg(sceneObject.rotation),
              onSetValue: value => updateObject(sceneObject.id, { rotation: THREE.Math.degToRad(value) }),
              transform: NumberSliderTransform.degrees,
              formatter: NumberSliderFormatter.degrees
            }]
          ],

      sceneObject.type == 'camera' &&
        ['div',
          [NumberSlider, {
            label: 'roll',
            min: -45,
            max: 45,
            step: 1,
            value: THREE.Math.radToDeg(sceneObject.roll),
            onSetValue: value => updateObject(sceneObject.id, { roll: THREE.Math.degToRad(value) }),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }]
        ],

      (sceneObject.type == 'camera' || sceneObject.type == 'light') &&
        ['div',
          [NumberSlider, {
            label: 'tilt',
            min: sceneObject.type == 'light' ? -180 : -90,
            max: sceneObject.type == 'light' ? 180 : 90,
            step: 1,
            value: THREE.Math.radToDeg(sceneObject.tilt),
            onSetValue: value => updateObject(sceneObject.id, { tilt: THREE.Math.degToRad(value) }),
            formatter: NumberSliderFormatter.degrees
          }]
        ],

      sceneObject.type == 'camera' &&
        [
          NumberSlider, {
            label: 'F.O.V.',
            min: 1,
            max: 120,
            step: 1,
            value: sceneObject.fov,
            onSetValue: createOnSetValue(sceneObject.id, 'fov'),
            formatter: value => value.toFixed(1) + '°'
          }
        ],

      sceneObject.type == 'character' && (
        ModelLoader.isCustomModel(sceneObject.model)
          ? [
            ['div', { style: { flex: 1, paddingBottom: 6 } }, [
              [NumberSlider, {
                label: 'height',
                min: 0.3,
                max: 3.05,
                step: 0.0254,
                value: sceneObject.height,
                onSetValue: createOnSetValue(sceneObject.id, 'height'),
              }]]
            ]
          ]
          : [
            ['div', { style: { flex: 1, paddingBottom: 6 } }, [
              [NumberSlider, {
                label: 'height',
                min: 1.4732,
                max: 2.1336,
                step: 0.0254,
                value: sceneObject.height,
                onSetValue: createOnSetValue(sceneObject.id, 'height'),
                formatter: value => feetAndInchesAsString(
                  ...metersAsFeetAndInches(
                    sceneObject.height
                  )
                )
              }],

              [
                NumberSlider,
                {
                  label: 'head',
                  min: 80,
                  max: 120,
                  step: 1,
                  value: sceneObject.headScale * 100,
                  onSetValue: createOnSetValue(sceneObject.id, 'headScale', value => value / 100),
                  formatter: value => Math.round(value).toString() + '%'
                }
              ],
            ]],

            ['div', { style: { margin: '6px 0 3px 0', fontStyle: 'italic' } }, 'morphs'],

            ['div', { style: { flex: 1 } },
              Object.entries(sceneObject.morphTargets).map(([ key, value ]) =>
                [
                  NumberSlider,
                  {
                    label: MORPH_TARGET_LABELS[key],
                    min: 0,
                    max: 100,
                    step: 1,
                    value: value * 100,
                    onSetValue: value => updateObject(
                      sceneObject.id,
                      { morphTargets: { [key]: value / 100 }
                    }),
                    formatter: NumberSliderFormatter.percent
                  }
                ]
              )
            ]
          ]
      ),

      sceneObject.type == 'character' && [
        PosePresetsEditor, {
          id: sceneObject.id,
          posePresetId: sceneObject.posePresetId
        }
      ],

      sceneObject.type == 'character' &&
        selectedBone && [BoneEditor, { sceneObject, bone: selectedBone, updateCharacterSkeleton }]
    ]
  )
}

const BoneEditor = ({ sceneObject, bone, updateCharacterSkeleton }) => {
  const [render, setRender] = useState(false)

  // has the user modified the skeleton?
  let rotation = sceneObject.skeleton[bone.name]
    // use the modified skeleton data
    ? sceneObject.skeleton[bone.name].rotation
    // otherwise, use the initial rotation of the bone
    : { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z }

  const createOnSetValue = (key, transform) => value => {
    updateCharacterSkeleton({
      id: sceneObject.id,
      name: bone.name,
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        [key]: transform(value)
      }
    })
  }

  // the posePresetId and skeleton will change synchronously
  // but the three scene will not have updated bones until SceneManager renders
  // so for now, just wait until that has probably happened :/
  useEffect(() => {
    setRender(false)

    setTimeout(() => {
      setRender(true)
    }, 1)
  }, [sceneObject.posePresetId])

  return h(
    ['div.column', [

      ['div.column', { style: { marginBottom: 3 } }, [
        ['div', { style: { flex: 1, margin: '6px 0 3px 0' } }, 'Bone'],
        ['small', { style: { display: 'flex', flex: 1, marginLeft: 1, fontStyle: 'italic', opacity: 0.8 } }, bone.name]
      ]],

      ['div.column', [
        [NumberSlider,
          {
            label: 'x',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.x),
            onSetValue: createOnSetValue('x', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ],
        [NumberSlider,
          {
            label: 'y',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.y),
            onSetValue: createOnSetValue('y', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ],
        [NumberSlider,
          {
            label: 'z',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.z),
            onSetValue: createOnSetValue('z', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ]
      ]]
    ]]
  )
}

const ELEMENT_HEIGHT = 40
const Element = React.memo(({ index, style, sceneObject, isSelected, isActive, selectObject, selectObjectToggle, updateObject, deleteObjects, setActiveCamera, machineState, transition, allowDelete, undoGroupStart, undoGroupEnd }) => {
  const onClick = preventDefault(event => {
    const { shiftKey } = event

    undoGroupStart()

    if (shiftKey) {
      selectObjectToggle(sceneObject.id)

    } else {
      selectObject(sceneObject.id)

      if (sceneObject.type === 'camera') {
        setActiveCamera(sceneObject.id)
      }
    }

    undoGroupEnd()
  })

  const onDeleteClick = preventDefault(event => {
    let choice = dialog.showMessageBox(null, {
      type: 'question',
      buttons: ['Yes', 'No'],
      message: 'Are you sure?',
      defaultId: 1 // default to No
    })
    if (choice === 0) {
      deleteObjects([sceneObject.id])
    }
  })

  const onToggleVisibleClick = preventDefault(event => {
    updateObject(sceneObject.id, { visible: !sceneObject.visible })
  })

  let typeLabels = {
    'camera': [Icon, { src: 'icon-item-camera' }],
    'character': [Icon, { src: 'icon-item-character' }],
    'object': [Icon, { src: 'icon-item-object' }],
    'light': [Icon, { src: 'icon-item-light' }],
    'volume': [Icon, { src: 'icon-item-volume' }]
  }

  let className = classNames({
    'selected': isSelected,
    'zebra': index % 2
  })

  return h([
    'div.element', { className, style: { height: ELEMENT_HEIGHT, ...style } }, [
      [
        'a.title[href=#]',
        { onClick },
        [
          ['span.type', typeLabels[sceneObject.type]],
          ...(sceneObject.name
            ? [
                ['span.name', sceneObject.name]
              ]
            : [
                ['span.id', sceneObject.displayName]
              ]
          ),
        ],
      ],
      ['div.row', [
          isActive
            ? ['span.active', { style: { display: 'flex' }},  [Icon, { src: 'icon-item-active' }]]
            : [],

          sceneObject.type === 'camera'
            ? []
            : sceneObject.visible
              ? isSelected
                ? ['a.visibility[href=#]', { onClick: onToggleVisibleClick }, [Icon, { src: 'icon-item-visible' }]]
                : []
              : ['a.visibility[href=#]', { onClick: onToggleVisibleClick }, [Icon, { src: 'icon-item-hidden' }]],

              isSelected 
                ? allowDelete
                  ? ['a.delete[href=#]', { onClick: onDeleteClick }, 'X']
                  : ['a.delete', { style: { opacity: 0.1 } }, 'X']
                : []
      ]]
    ]
  ])
})

const PhoneCursor = connect(
  state => ({
    selections: getSelections(state),
    sceneObjects: getSceneObjects(state),
  }),
  {
    selectObject,
    selectBone,
    updateObject
  })(
    ({ remoteInput, camera, largeCanvasRef, selectObject, selectBone, sceneObjects, selections, selectedBone, updateObject }) => {
      let startingDeviceRotation = useRef(null)
      let startingObjectRotation = useRef(null)
      let startingCameraPosition = useRef(null)
      let startingCameraOffset = useRef(null)
      let startingDirection = useRef(null)
      let tester = useRef(null)
      let isRotating = useRef(false)
      let isDragging = useRef(false)
      let intersectionPlane = useRef(null)
      let mousePosition = useRef(null)
      let virtualMouse = useRef(null)
      let xy = useRef({x:0, y:0})
      let startPosition = useRef(null)
      let viewportwidth = largeCanvasRef.current.clientWidth,
          viewportheight = largeCanvasRef.current.clientHeight
      const rect = largeCanvasRef.current.getBoundingClientRect();

      const { scene } = useContext(SceneContext)

      const setPlanePosition = (obj) => {
        let direction = new THREE.Vector3()
        camera.getWorldDirection( direction )
        let newPos = new THREE.Vector3()
        let dist = 5
        newPos.addVectors ( camera.position, direction.multiplyScalar( dist ) )
        obj.position.set(newPos.x, newPos.y, newPos.z)
        obj.lookAt(camera.position)
      }

      const setCylinderOrientation = (obj) => {
        let direction = new THREE.Vector3()
        camera.getWorldDirection( direction )
        obj.position.set(camera.x, camera.y, camera.z)
        //obj.quaternion.copy(camera.quaternion)
      }

      const findIntersection = ( origin, ph_direction, obj ) =>
      {
        var raycaster = new THREE.Raycaster(origin, ph_direction)
        var intersection = raycaster.intersectObject(obj, true)
        return intersection
      }

      const toScreenXY = ( position, camera ) => {

        var pos = position.clone()
        projScreenMat = new THREE.Matrix4()
        projScreenMat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
        pos = pos.applyMatrix4( projScreenMat )
        return { x: ( pos.x  ),
             y: ( - pos.y )}
      }

      useEffect(() => {
        // move mouse here

        if (remoteInput.orbitMode) return
        else {
          if (isDragging.current) {
            isDragging.current = false
          }
        }
        if (camera !== undefined && camera !== null && remoteInput.mouseMode)
        {
          if (camera.parent) scene.current = camera.parent
          if (intersectionPlane.current)
          {
            // intersection plane exists
          } else {
            intersectionPlane.current = new THREE.Mesh(
              //new THREE.CylinderGeometry(1, 1, 40, 16, 2),
              new THREE.PlaneGeometry(100, 100, 2),
              new THREE.MeshBasicMaterial( {color: 0xffff00, side: THREE.DoubleSide} ))
            setPlanePosition(intersectionPlane.current)
            //setCylinderOrientation(intersectionPlane.current)
            //scene.current.add(intersectionPlane.current)  //
            intersectionPlane.current.updateMatrix()  // required for correct first pass
          }

          if (tester.current) {
            //console.log('tester exists')
          }
          else {
            tester.current = new THREE.Object3D()
            let m = new THREE.Mesh(
              new THREE.BoxGeometry(0.01, 0.01, 0.1),
              new THREE.MeshBasicMaterial({color: '#123123' })
            )
            m.position.z = -0.005
            tester.current.position.set(camera.position.x, camera.position.y, camera.position.z)
            tester.current.position.y += 0.05;
            tester.current.quaternion.copy(camera.quaternion)
            tester.current.add(new THREE.AxesHelper(1))
            tester.current.add(m)
            //scene.current.add(tester.current)
          }
        }

        // handling phone rotation to screen position here
        if (remoteInput.mouseMode)
        {
          if (remoteInput.down)
          {
            let [ alpha, beta, gamma ] = remoteInput.mag.map(THREE.Math.degToRad)
            if (!isRotating.current) {
              //starting rotation
              let target = tester.current
              startingObjectRotation.current ={
                x: target.rotation.x,
                y: target.rotation.y,
                z: target.rotation.z
              }
              startingDeviceRotation.current = {
                alpha: alpha,
                beta: beta,
                gamma: gamma
              }
              mousePosition.current = {x: 0, y: 0} //robot.getMousePos()
              virtualMouse.current = {
                x: mousePosition.x,
                y: mousePosition.y
              }
              //
            }
            let w = 0,
              x = 0,
              y = 0,
              z = 1
            let startingDeviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingDeviceRotation.current.beta, startingDeviceRotation.current.alpha, -startingDeviceRotation.current.gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
            let deviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta, alpha, -gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
            //startingDeviceQuaternion.multiply(camera.quaternion)
            //deviceQuaternion.multiply(camera.quaternion)
            let deviceDifference = startingDeviceQuaternion.clone().inverse().multiply(deviceQuaternion)
            let startingObjectQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingObjectRotation.current.x,startingObjectRotation.current.y,startingObjectRotation.current.z))
            startingObjectQuaternion.multiply(deviceDifference)
            tester.current.quaternion.copy(startingObjectQuaternion)
            let dir = new THREE.Vector3()
            tester.current.updateMatrixWorld()
            tester.current.children[0].getWorldDirection(dir).negate()
            let intersect = findIntersection(camera.position, dir, intersectionPlane.current)
            if (intersect.length>0)
            {
              // let point = new THREE.Mesh(
              //   new THREE.SphereGeometry(0.05),
              //   new THREE.MeshBasicMaterial({color: "#ff0000"})
              // )
              // point.position.copy(intersect[0].point)
              // scene.add(point)

              let xy_coords = toScreenXY( intersect[0].point, camera )
              if (!isRotating.current)
              {
                isRotating.current = true
                firstRun = false
                startPosition.current = {
                  x: xy_coords.x * 300, // * viewportwidth/4,
                  y: xy_coords.y * 300 //* viewportheight/4
                }
              }
              //virtualMouse.current.x = mousePosition.current.x - ((startPosition.current.x - xy_coords.x * viewportwidth/4)/2)
              //virtualMouse.current.y = mousePosition.current.y - ((startPosition.current.y - xy_coords.y * viewportheight/4)/2)
              virtualMouse.current.x = mousePosition.current.x - ((startPosition.current.x - xy_coords.x * 300)/2)
              virtualMouse.current.y = mousePosition.current.y - ((startPosition.current.y - xy_coords.y * 300)/2)
              //robot.moveMouse(virtualMouse.current.x, virtualMouse.current.y)
            }
          } else {
            if (scene.current && tester.current!=null)
            {
              if (isRotating.current)
              {
                isRotating.current = false
                //robot.mouseClick()
              }

              scene.current.remove(tester.current)
              scene.current.remove(intersectionPlane.current)
              tester.current = null
              intersectionPlane.current = null
            }
          }
        } else {
          // not in mouse mode
          if (scene.current && tester.current!=null)
          {
            if (isRotating.current)
            {
              isRotating.current = false
              //robot.mouseClick()
            }

            scene.current.remove(tester.current)
            scene.current.remove(intersectionPlane.current)
            tester.current = null
            intersectionPlane.current = null
          }
        }

      }, [remoteInput, selections])


      useEffect(() => {
        // handling phone rotation to camera orbit
        if (!remoteInput.orbitMode)
        {
          if (isDragging.current) {
            //robot.mouseToggle("up", "left")
            isDragging.current = false
            isRotating.current = false
          }
          return
        }
        if ( camera !== undefined && camera !== null )
        {
          if (camera.parent) scene.current = camera.parent
        }

        if (remoteInput.orbitMode)
        {
          let firstRun = false
          let [ alpha, beta, gamma ] = remoteInput.mag.map(THREE.Math.degToRad)
          if (!isDragging.current) {
            //starting rotation
            firstRun = true
            isDragging.current = true
            startingCameraPosition.current = camera.position.clone()
            startingDirection.current = new THREE.Vector3()
            camera.getWorldDirection(startingDirection.current)
            startingDeviceRotation.current = {
              alpha: alpha,
              beta: beta,
              gamma: gamma
            }
            mousePosition.current = {x: 0, y: 0} //robot.getMousePos()
            virtualMouse.current = {
              x: mousePosition.x,
              y: mousePosition.y
            }

          }
          let w = 0,
            x = 0,
            y = 0,
            z = 1
          let startingDeviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingDeviceRotation.current.beta, startingDeviceRotation.current.alpha, -startingDeviceRotation.current.gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
          let deviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta, alpha, -gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))

          let deviceDifference = startingDeviceQuaternion.clone().inverse().multiply(deviceQuaternion)

          let rot = new THREE.Euler().setFromQuaternion(deviceDifference)

          let direction = new THREE.Vector3()
          camera.getWorldDirection( direction )

          let objInScene = scene.children.find(o => o.userData.id === selections[0])

          let newPos = new THREE.Vector3()
          let getDistanceToPosition = new THREE.Vector3()
          if (sceneObjects[selections[0]] && (sceneObjects[selections[0]].type === 'object' || sceneObjects[selections[0]].type === 'character'))
          {
            getDistanceToPosition = objInScene.position.clone()
            if (selectedBone)
            {
              let skel = objInScene.userData.skeleton// (objInScene.children[0] instanceof THREE.Mesh) ? object.current.children[0] : object.current.children[1]
              let realBone = skel.bones.find(bone => bone.uuid == selectedBone)
              let bonePosition = new THREE.Vector3()
              realBone.getWorldPosition( bonePosition )
              getDistanceToPosition = bonePosition.clone()
            }
          }
          let dist = (sceneObjects[selections[0]] && (sceneObjects[selections[0]].type === 'object' || sceneObjects[selections[0]].type === 'character')) ? startingCameraPosition.current.distanceTo(getDistanceToPosition) : 3
          newPos.addVectors ( startingCameraPosition.current, direction.multiplyScalar( dist ) )
          if (firstRun)
          {
            firtRun = false
            startingCameraOffset.current = newPos
          }

          let radPerPixel = (Math.PI / 30),
            center = startingCameraOffset.current
            deltaPhi = radPerPixel * rot.y,
            deltaTheta = -radPerPixel * rot.x,
            campos = new THREE.Vector3(startingCameraPosition.current.x, startingCameraPosition.current.y, startingCameraPosition.current.z),
            pos = camera.position.clone().sub(center),
            radius = dist,
            theta = Math.acos(pos.y / radius),
            phi = Math.atan2(pos.z, pos.x)

          theta = Math.min(Math.max(theta - deltaTheta, 0), Math.PI)
          phi -= deltaPhi
          pos.x = radius * Math.sin(theta) * Math.cos(phi);
          pos.z = radius * Math.sin(theta) * Math.sin(phi);
          pos.y = radius * Math.cos(theta)

          //TODO limit y position to 0 (ground level)
          pos.add(center)

          let cam = {
            x: pos.x,
            y: pos.y,
            z: pos.z,
          }
          let testCam = new THREE.PerspectiveCamera()
          testCam.position.copy(cam)
          testCam.lookAt(startingCameraOffset.current)

          let cameraId = camera.userData.id
          let euler = new THREE.Euler()
          euler.setFromQuaternion( testCam.quaternion.clone().normalize(), "YXZ" )

          if (cam.y < 0) cam.y = 0
          cam.y = cam.y > startingCameraOffset.current.y + radius - radius/20 ? startingCameraOffset.current.y + radius - radius/20 : cam.y

          updateObject(cameraId, {
            x: cam.x,
            y: cam.z,
            z: cam.y,
            rotation: euler.y,
            tilt: euler.x,
            // roll: camera.rotation.z
          })

        } else {
          // not in orbit mouse mode
          if (scene.current && tester.current!=null)
          {
            if (isDragging.current)
            {
              isDragging.current = false
            }
            scene.current.remove(tester.current)
            scene.current.remove(intersectionPlane.current)
            tester.current = null
            intersectionPlane.current = null
          }
        }
      }, [remoteInput])

      return h(
        ['div#phoneCursor', { key: 'cursor' } ,
          [
          ]
        ]
      )
    })

const Icon = ({ src }) => h(
  [
    'img.icon', {
      width: 32,
      height: 32,
      src: `./img/shot-generator/${src}.svg`
    }
  ]
)

const Toolbar = ({
  createObject,
  selectObject,
  loadScene,
  saveScene,
  camera,
  setActiveCamera,
  resetScene,
  saveToBoard,
  insertAsNewBoard,
  xrServerUrl,

  undoGroupStart,
  undoGroupEnd
}) => {
  const onCreateCameraClick = () => {
    let id = THREE.Math.generateUUID()

    undoGroupStart()
    createObject({
      id,

      type: 'camera',
      fov: 22.25,
      x: 0,
      y: 6,
      z: 2,
      rotation: 0,
      tilt: 0,
      roll: 0
    })
    selectObject(id)
    setActiveCamera(id)
    undoGroupEnd()
  }

  const onCreateObjectClick = () => {
    let id = THREE.Math.generateUUID()
    //let camera = findCamera();
    let newPoz = generatePositionAndRotation(camera)

    undoGroupStart()
    createObject({
      id,
      type: 'object',
      model: 'box',
      width: 1,
      height: 1,
      depth: 1,
      x: newPoz.x,
      y: newPoz.y,
      z: newPoz.z,
      rotation: { x: 0, y: 0, z: 0 }, //Math.random() * Math.PI * 2,

      visible: true
    })
    selectObject(id)
    undoGroupEnd()
  }

  const generatePositionAndRotation = (camera) => {
    let direction = new THREE.Vector3() // create once and reuse it!
    camera.getWorldDirection( direction )
    let newPos = new THREE.Vector3()
    let dist = (Math.random()) * 6 + 4
    newPos.addVectors ( camera.position, direction.multiplyScalar( dist ) )
    let obj = new THREE.Object3D()
    newPos.x += (Math.random() * 4 - 2)
    newPos.z += (Math.random() * 4 - 2)
    obj.position.set(newPos.x, 0, newPos.z)
    obj.lookAt(camera.position)
    obj.rotation.set(0, obj.rotation.y, 0)  //maybe we want rotation relative to camera (facing the camera)
    obj.rotation.y = Math.random() * Math.PI * 2

    return {
      x: obj.position.x,
      y: obj.position.z,
      z: obj.position.y,
      rotation: obj.rotation.y
    }
  }

  const onCreateCharacterClick = () => {
    let newPoz = generatePositionAndRotation(camera)
    let id = THREE.Math.generateUUID()

    undoGroupStart()
    createObject({
      id,
      type: 'character',
      height: 1.8,
      model: 'adult-male',
      x: newPoz.x,
      y: newPoz.y,
      z: newPoz.z,
      rotation: 0,//newPoz.rotation,
      headScale: 1,

      morphTargets: {
        mesomorphic: 0,
        ectomorphic: 0,
        endomorphic: 0
      },

      posePresetId: DEFAULT_POSE_PRESET_ID,
      skeleton: defaultPosePresets[DEFAULT_POSE_PRESET_ID].state.skeleton,

      visible: true
    })
    selectObject(id)
    undoGroupEnd()
  }

  const onCreateLightClick = () => {
    let id = THREE.Math.generateUUID()

    undoGroupStart()
    createObject({
      id,
      type: 'light',
      x: 0,
      y: 0,
      z: 2,
      rotation: 0,
      tilt: 0,
      intensity: 0.8,
      visible: true,
      angle: 1.04,
      distance: 5,
      penumbra: 1.0,
      decay: 1,
    })
    selectObject(id)
    undoGroupEnd()
  }

  const onCreateVolumeClick = () => {
    let id = THREE.Math.generateUUID()

    undoGroupStart()
    createObject({
      id,
      type: 'volume',
      x: 0,
      y:2,
      z: 0,
      width: 5,
      height: 5,
      depth:5,
      rotation: 0,
      visible: true,
      opacity: 0.3,
      color: 0x777777,
      numberOfLayers: 4,
      distanceBetweenLayers: 1.5,
      volumeImageAttachmentIds: ['rain2', 'rain1']
    })
    selectObject(id)
    undoGroupEnd()
  }

  const onCreateStressClick = () => {
    undoGroupStart()
    for (let i = 0; i < 500; i++) {
      onCreateObjectClick()
    }
    for (let i = 0; i < 20; i++) {
      onCreateCharacterClick()
    }
    undoGroupEnd()
    setTimeout(() => {
      console.log(Object.values(getSceneObjects($r.store.getState())).length, 'scene objects')
    }, 100)
  }

  const onLoadClick = () => {
    let filepaths = dialog.showOpenDialog(null, {})
    if (filepaths) {
      let filepath = filepaths[0]
      let choice = dialog.showMessageBox(null, {
        type: 'question',
        buttons: ['Yes', 'No'],
        message: 'Your existing scene will be cleared to load the file. Are you sure?',
        defaultId: 1 // default to No
      })
      if (choice === 0) {
        try {
          let data = JSON.parse(
            fs.readFileSync(filepath)
          )
          loadScene(data)
        } catch (err) {
          console.error(err)
          dialog.showMessageBox(null, {
            message: 'Sorry, an error occurred.'
          })
        }
      }
    }
  }

  const onSaveClick = () => {
    let filepath = dialog.showSaveDialog(null, { defaultPath: 'test.json' })
    if (filepath) {
      // if (fs.existsSync(filepath)) {
      //   let choice = dialog.showMessageBox(null, {
      //     type: 'question',
      //     buttons: ['Yes', 'No'],
      //     message: 'That file already exists. Overwrite?',
      //     defaultId: 1 // default to No
      //   })
      //   if (choice === 1) return
      // }
      saveScene(filepath)
    }
  }

  const onClearClick = () => {
    let choice = dialog.showMessageBox(null, {
      type: 'question',
      buttons: ['Yes', 'No'],
      message: 'Your existing scene will be cleared. Are you sure?',
      defaultId: 1 // default to No
    })
    if (choice === 0) {
      resetScene()
    }
  }

  const onSaveToBoardClick = event => {
    saveToBoard()
  }

  const onInsertNewBoardClick = event => {
    insertAsNewBoard()
  }

  const onOpenVR = preventDefault(() =>
    dialog.showMessageBox(null, {
      message: `To view, open a VR web browser to:\n\n${xrServerUrl}`
    })
  )

  return h(
    ['div#toolbar', { key: 'toolbar' },
      ['div.toolbar__addition.row', [
        ['a[href=#]', { onClick: preventDefault(onCreateCameraClick) }, [[Icon, { src: 'icon-toolbar-camera' }], 'Camera']],
        ['a[href=#]', { onClick: preventDefault(onCreateObjectClick) }, [[Icon, { src: 'icon-toolbar-object' }], 'Object']],
        ['a[href=#]', { onClick: preventDefault(onCreateCharacterClick) }, [[Icon, { src: 'icon-toolbar-character' }], 'Character']],
        ['a[href=#]', { onClick: preventDefault(onCreateLightClick) }, [[Icon, { src: 'icon-toolbar-light' }], 'Light']],
        ['a[href=#]', { onClick: preventDefault(onCreateVolumeClick) }, [[Icon, { src: 'icon-toolbar-volume' }], 'Volume']]
      ]],
      // ['a[href=#]', { onClick: preventDefault(onCreateStressClick) }, '+ STRESS'],

      // ['a[href=#]', { onClick: preventDefault(onClearClick) }, 'Clear'],
      // ['a[href=#]', { onClick: preventDefault(onLoadClick) }, 'Load'],
      // ['a[href=#]', { onClick: preventDefault(onSaveClick) }, 'Save'],

      ['div.toolbar__board-actions.row', [
        xrServerUrl ? ['a[href=#]', { onClick: preventDefault(onOpenVR) }, 'Open in VR'] : [],
        ['a[href=#]', { onClick: preventDefault(onSaveToBoardClick) }, [[Icon, { src: 'icon-toolbar-save-to-board' }], 'Save to Board']],
        ['a[href=#]', { onClick: preventDefault(onInsertNewBoardClick) }, [[Icon, { src: 'icon-toolbar-insert-as-new-board' }], 'Insert As New Board']],
      ]]
    ]
  )
}

const getClosestCharacterInView = (objects, camera) => {
  let obj = null
  let dist = 1000000
  let allDistances = []

  for (var char of objects) {
    let d = camera.position.distanceTo(
      new THREE.Vector3(char.position.x, camera.position.y, char.position.z))

    allDistances.push({
      object: char,
      distance: d
    })
  }

  let compare = (a, b) => {
    if (a.distance < b.distance)
      return -1;
    if (a.distance > b.distance)
      return 1;
    return 0;
  }

  allDistances.sort(compare)

  for (var i = 0; i< allDistances.length; i++) {
    if (checkIfCharacterInCameraView(allDistances[i].object, camera))
      return allDistances[i]
  }

  return {
    object: obj,
    distance: dist !== 1000000 ? dist : 0
  }
}

const checkIfCharacterInCameraView = (character, camera) => {
  camera.updateMatrix()
  camera.updateMatrixWorld()
  var frustum = new THREE.Frustum()
  frustum.setFromMatrix(
    new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))

  for (var hitter of character.bonesHelper.hit_meshes) {
    if (frustum.intersectsBox(new THREE.Box3().setFromObject( hitter ))) {
      return true
    }
  }
  return false
}

const ClosestObjectInspector = ({ camera, sceneObjects, characters }) => {
  const [result, setResult] = useState('')

  useEffect(() => {
    // HACK
    // we're delaying 1 frame until scene is guaranteed to be updated
    // wrap in a try/catch because the scene might not have the same characters
    // by the time we actually render
    // if we get an error in hit testing against empty objects, just ignore it
    requestAnimationFrame(() => {
      try {
        let closest = getClosestCharacterInView(characters, camera)

        let [distFeet, distInches] = metersAsFeetAndInches(closest.distance)

        let sceneObject = closest.object ? sceneObjects[closest.object.userData.id] : undefined

        setResult(sceneObject
          ? `Distance to ${sceneObject.name || sceneObject.displayName}: ${feetAndInchesAsString(distFeet, distInches)} (${parseFloat(Math.round(closest.distance * 100) / 100).toFixed(2)}m)`
          : '')

      } catch (err) {
        setResult('')
      }
    })
  }, [camera, sceneObjects, characters])

  return h(['div.camera-inspector__nearest-character', result])
}

const CameraInspector = connect(
  state => ({
    sceneObjects: getSceneObjects(state),
    activeCamera: getActiveCamera(state)
  })
)(
  React.memo(({ camera, sceneObjects, activeCamera }) => {
    const { scene } = useContext(SceneContext)

    if (!camera) return h(['div.camera-inspector'])

    let cameraState = sceneObjects[activeCamera]

    let tiltInDegrees = Math.round(cameraState.tilt * THREE.Math.RAD2DEG)

    let [heightFeet, heightInches] = metersAsFeetAndInches(cameraState.z)

    let cameraNumber = Object.values(sceneObjects)
                        .filter(o => o.type === 'camera')
                        .indexOf(cameraState) + 1

    let cameraName = cameraState.name || `Camera ${cameraNumber}`

    let fakeCamera = camera.clone() // TODO reuse a single object
    fakeCamera.fov = cameraState.fov
    let focalLength = fakeCamera.getFocalLength()
    fakeCamera = null

    return h(
      ['div.camera-inspector',

        ['div.row',
          { style: { justifyContent: 'space-between' } },
          [
            'div',
            `${cameraName}, ${Math.round(focalLength)}mm, f/1.4`,
            ['br'],
            `Height: ${feetAndInchesAsString(heightFeet, heightInches)} Tilt: ${tiltInDegrees}°`,
            ['br'],
            [ClosestObjectInspector, {
              camera,
              sceneObjects,
              characters: scene.children.filter(o => o.userData.type === 'character')
            }]
          ]
        ]
        // [RemoteInputView, { remoteInput }]
      ]
    )
  }
))

// const { durationOfWords } = require('../utils')
const BoardInspector = connect(
  state => ({
    board: state.board
  })
)(
({ board }) => {
  const present = value => value && value.length > 1

  // let suggestedDuration = durationOfWords(dialogue, 300) + 300
  // let suggestedDurationInSeconds = suggestedDuration / 1000
  // let durationString = `// about ${suggestedDurationInSeconds} seconds`

  return h(
    ['div.column.board-inspector', [
      ['div.board-inspector__shot', 'Shot ' + board.shot],

      present(board.dialogue) && ['p.board-inspector__dialogue', 'DIALOGUE: ' + board.dialogue],
      present(board.action) && ['p.board-inspector__action', 'ACTION: ' + board.action],
      present(board.notes) && ['p.board-inspector__notes', 'NOTES: ' + board.notes]
    ]]
  )
})

const GuidesInspector = connect(
  state => ({
    center: state.workspace.guides.center,
    thirds: state.workspace.guides.thirds,
    eyeline: state.workspace.guides.eyeline
  }),
  {
    toggleWorkspaceGuide
  }
)(
(({
  center, thirds, eyeline,
  toggleWorkspaceGuide
}) =>
  h(['div.guides-inspector', [
    'div.row',
      ['div.guides-inspector__label', 'Guides'],
        ['div.round-buttons-panel', [
          [
            'a[href=#]',
            {
              className: classNames({ active: center }),
              onClick: preventDefault(() => toggleWorkspaceGuide('center'))
            },
            [[Icon, { src: 'icon-guides-center' }]]
          ],
          [
            'a[href=#]',
            {
              className: classNames({ active: thirds }),
              onClick: preventDefault(() => toggleWorkspaceGuide('thirds'))
            },
            [[Icon, { src: 'icon-guides-thirds' }]]
          ],
          [
            'a[href=#]',
            {
              className: classNames({ active: eyeline }),
              onClick: preventDefault(() => toggleWorkspaceGuide('eyeline'))
            },
            [[Icon, { src: 'icon-guides-eyeline' }]]
          ]
        ]]
      ]]
)))

const CamerasInspector = connect(
  state => ({
    activeCamera: getActiveCamera(state),
    _cameras: getCameraSceneObjects(state)
  }),
  {
    setActiveCamera,
    selectObject
  }
)(
({
  // props
  activeCamera,

  // via selectors
  _cameras,

  // action creators
  setActiveCamera,
  selectObject
}) => {

  const onClick = (camera, event) => {
    event.preventDefault()

    undoGroupStart()
    selectObject(camera.id)
    setActiveCamera(camera.id)
    undoGroupEnd()
  }

  return h(['div.cameras-inspector', [
    'div.row',
      ['div.cameras-inspector__label', 'Camera'],
      ['div.round-buttons-panel',
        _cameras.map(
          (camera, n) =>
            [
              'a[href=#]',
              {
                className: classNames({ active: activeCamera === camera.id }),
                onClick: onClick.bind(this, camera)
              },
              n + 1
            ]
        )
      ]
  ]])
})

// TODO move selector logic into reducers/shot-generator?
// memoized selectors
const getCameraSceneObjects = createSelector(
  [getSceneObjects],
  (sceneObjects) => Object.values(sceneObjects).filter(o => o.type === 'camera')
)
const getSelectedSceneObject = createSelector(
  [getSceneObjects, getSelections],
  (sceneObjects, selections) => Object.values(sceneObjects).find(o => o.id === selections[0])
)
const canDelete = (sceneObject, activeCamera) =>
  // allow objects
  sceneObject.type === 'object' ||
  // allow characters
  sceneObject.type === 'character' ||
  // allow volumes
  sceneObject.type === 'volume' ||
  // allow cameras which are not the active camera
  (sceneObject.type === 'camera' && sceneObject.id !== activeCamera)

const menu = require('../menu')
const onMenuFocus = () => {
  menu.setShotGeneratorMenu()
}
const MenuManager = ({ }) => {
  useEffect(() => {
    let win = remote.getCurrentWindow()
    win.on('focus', onMenuFocus)
    onMenuFocus()

    return function cleanup () {
      win.off('focus', onMenuFocus)
    }
  }, [])
  return null
}

const KeyHandler = connect(
  state => ({
    mainViewCamera: state.mainViewCamera,
    activeCamera: getActiveCamera(state),
    selections: getSelections(state),

    _selectedSceneObject: getSelectedSceneObject(state),

    _cameras: getCameraSceneObjects(state)
  }),
  {
    setMainViewCamera,
    selectObject,
    setActiveCamera,
    duplicateObjects,
    deleteObjects,
    updateObject,
    undoGroupStart,
    undoGroupEnd
  }
)(
  ({
    mainViewCamera,
    activeCamera,
    selections,
    _selectedSceneObject,
    _cameras,
    setMainViewCamera,
    selectObject,
    setActiveCamera,
    duplicateObjects,
    deleteObjects,
    updateObject,
    undoGroupStart,
    undoGroupEnd
  }) => {
    const { scene } = useContext(SceneContext)

    const onCommandDuplicate = () => {
      if (selections) {
        // NOTE: this will also select the new duplicates, replacing selection
        duplicateObjects(
          // ids to duplicate
          selections,
          // new ids
          selections.map(THREE.Math.generateUUID)
        )
      }
    }

    useEffect(() => {
      const onCameraSelectByIndex = index => {
        if (_cameras[index]) {
          let id = _cameras[index].id
          undoGroupStart()
          selectObject(id)
          setActiveCamera(id)
          undoGroupEnd()
        }
      }

      const onKeyDown = event => {
        if (event.key === 'Backspace') {
          if (selections.length && canDelete(_selectedSceneObject, activeCamera)) {
            let choice = dialog.showMessageBox(null, {
              type: 'question',
              buttons: ['Yes', 'No'],
              message: `Deleting ${selections.length} item${selections.length > 1 ? 's' : ''}. Are you sure?`
            })
            if (choice === 0) {
              deleteObjects(selections)
            }
          }
        }
        if (event.key === 't') {
          setMainViewCamera(mainViewCamera === 'ortho' ? 'live' : 'ortho')
        }
        if (event.key === 'Escape') {
          selectObject(activeCamera)
        }
        if (
          event.key === '1' ||
          event.key === '2' ||
          event.key === '3' ||
          event.key === '4' ||
          event.key === '5' ||
          event.key === '6' ||
          event.key === '7' ||
          event.key === '8' ||
          event.key === '9'
          ) {
            onCameraSelectByIndex(parseInt(event.key, 10) - 1)
          }

        if (
          (event.key === 'z' || event.key === 'x') &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          let cameraState = _cameras.find(camera => camera.id === activeCamera)
          let roll = {
            'z': Math.max(cameraState.roll - THREE.Math.DEG2RAD, -45 * THREE.Math.DEG2RAD),
            'x': Math.min(cameraState.roll + THREE.Math.DEG2RAD, 45 * THREE.Math.DEG2RAD)
          }[event.key]

          updateObject(activeCamera, { roll })
        }

        if (event.key === '[' || event.key === ']') {
          let cameraState = _cameras.find(camera => camera.id === activeCamera)

          let mms = [12, 16, 18, 22, 24, 35, 50, 85, 100, 120, 200, 300, 500]

          let camera = scene.children.find(child => child.userData.id === activeCamera)
          let fakeCamera = camera.clone() // TODO reuse a single object
          let fovs = mms.map(mm => {
            fakeCamera.setFocalLength(mm)
            return fakeCamera.fov
          }).sort((a, b) => a - b)
          fakeCamera = null

          let index = indexIn(fovs, cameraState.fov)

          let fov = {
            '[': fovs[Math.min(index + 1, fovs.length)],
            ']': fovs[Math.max(index - 1, 0)]
          }[event.key]

          updateObject(activeCamera, { fov })
        }
      }

      window.addEventListener('keydown', onKeyDown)
      ipcRenderer.on('shot-generator:object:duplicate', onCommandDuplicate)

      return function cleanup () {
        window.removeEventListener('keydown', onKeyDown)
        ipcRenderer.off('shot-generator:object:duplicate', onCommandDuplicate)
      }
    }, [mainViewCamera, _cameras, selections, _selectedSceneObject, activeCamera])

    return null
  }
)

// TODO move to selectors file
const getLoadableSceneObjects = createSelector(
  [getSceneObjects],
  sceneObjects => Object.values(sceneObjects)
    .filter(sceneObject =>
      (sceneObject.type === 'character' || sceneObject.type === 'object') &&
      sceneObject.loaded != null
    )
)
const getLoadableSceneObjectsRemaining = createSelector(
  [getLoadableSceneObjects],
  loadableSceneObjects => loadableSceneObjects.filter(sceneObject => sceneObject.loaded === false)
)

const LoadingStatus = connect(
  state => ({
    storyboarderFilePath: state.meta.storyboarderFilePath,
    remaining: getLoadableSceneObjectsRemaining(state),
    attachments: state.attachments
  })
)(React.memo(({ ready, remaining, attachments, storyboarderFilePath }) => {
  let message

  let inprogress = remaining.filter(loadable => {
    let filepathForModel = ModelLoader.getFilepathForModel(loadable, { storyboarderFilePath })
    if (attachments[filepathForModel]) {
      // in cache but in progress
      return attachments[filepathForModel].status === 'NotAsked' || attachments[filepathForModel].status === 'Loading'
    } else {
      // not even in cache yet
      return true
    }
  })

  if (!ready) {
    message = 'Initializing Shot Generator …'
  } else if (inprogress.length) {
    message = 'Loading models …'
  }

  if (!message) return null

  return h(
    ['div.modal-overlay', [
      ['div.modal', [
        ['div.modal__content', [
          ['div.title', 'Loading'],
          ['div.message', message]
        ]]
      ]]
    ]]
  )

}))

// const saveScenePresets = state => presetsStorage.saveScenePresets({ scenes: state.presets.scenes })
// const PresetsEditor = connect(
//   state => ({
//     presets: state.presets
//   }),
//   {
//     loadScenePreset: id => (dispatch, getState) => {
//       let choice = dialog.showMessageBox(null, {
//         type: 'question',
//         buttons: ['Yes', 'No'],
//         message: 'Your existing scene will be cleared. Are you sure?',
//         defaultId: 1 // default to No
//       })
//       if (choice === 0) {
//         let state = getState()
//         let preset = state.presets.scenes[id]
//         dispatch(loadScene({
//           world: preset.state.world,
//           sceneObjects: preset.state.sceneObjects,
//           activeCamera: preset.state.activeCamera
//         }))
//       }
//     },
// 
//     createScenePreset: () => (dispatch, getState) => {
//       // show a prompt to get the desired preset name
//       let id = THREE.Math.generateUUID()
//       prompt({
//         title: 'Preset Name',
//         label: 'Select a Preset Name',
//         value: `Scene ${shortId(id)}`
//       }, require('electron').remote.getCurrentWindow()).then(name => {
//         if (name != null && name != '' && name != ' ') {
//           let state = getState()
//           let preset = {
//             id,
//             name,
//             state: {
//               // TODO
//               world: state.world,
//               sceneObjects: getSceneObjects(state),
//               activeCamera: getActiveCamera(state)
//             }
//           }
//           dispatch(createScenePreset(preset))
//           saveScenePresets(getState())
//         }
//       }).catch(err => {
//         console.error(err)
//       })
//     },
// 
//     updateScenePreset: (id, values) => (dispatch, getState) => {
//       dispatch(updateScenePreset(id, values))
//       saveScenePresets(getState())
//     },
// 
//     deleteScenePreset: id => (dispatch, getState) => {
//       let choice = dialog.showMessageBox(null, {
//         type: 'question',
//         buttons: ['Yes', 'No'],
//         message: 'This scene preset will be deleted. Are you sure?',
//         defaultId: 1 // default to No
//       })
//       if (choice === 0) {
//         dispatch(deleteScenePreset(id))
//         saveScenePresets(getState())
//       }
//     }
//   }
// )(
// ({ presets, loadScenePreset, createScenePreset, updateScenePreset, deleteScenePreset, transition }) => {
//   const onLoadClick = (preset, event) => {
//     event.preventDefault()
//     loadScenePreset(preset.id)
//   }
// 
//   const onSaveClick = event => {
//     event.preventDefault()
//     createScenePreset()
//   }
// 
//   const onDeleteClick = id => {
//     event.preventDefault()
//     deleteScenePreset(id)
//   }
// 
//   const onEditClick = (preset, event) => {
//     event.preventDefault()
//     updateScenePreset(preset.id, { name: 'ok'})
//   }
// 
//   const onFocus = event => transition('TYPING_ENTER')
//   const onBlur = event => transition('TYPING_EXIT')
// 
//   return h([
//     'div', { style: { padding: 6 } }, [
//       ['h3', { style: { margin: '24px 0 12px 0' } }, 'Preset Scenes'],
// 
//       ['ul', Object.values(presets.scenes).map(preset =>
//         ['li.element', { style: { display: 'flex', justifyContent: 'space-between' } },
// 
//           ['a.select[href=#]', { style: { color: 'white', textDecoration: 'none', display: 'flex', alignSelf: 'center', top: -3, position: 'relative', width: '1.5rem' }, onClick: onLoadClick.bind(this, preset) }, '⇧'],
// 
//           [
//             'span',
//             { style: { flex: 1 } },
//             [
//               LabelInput,
//               {
//                 key: preset.id,
//                 label: preset.name != null
//                   ? preset.name
//                   : `Preset ${shortId(preset.id)}`,
//                 onFocus,
//                 onBlur,
//                 setLabel: name => {
//                   updateScenePreset(preset.id, { name })
//                 }
//               }
//             ]
//           ],
// 
// 
//           ['a.delete[href=#]', { onClick: onDeleteClick.bind(this, preset.id) }, 'X']
//         ] )
//       ],
// 
//       ['button', { style: { marginTop: 20, padding: '9px 12px', fontSize: 16 }, onClick: onSaveClick }, '+ Preset'],
//     ]
//   ])
// })

let stats
ipcRenderer.on('shot-generator:menu:view:fps-meter', (event, value) => {
  console.log('shot-generator:menu:view:fps-meter', event, value)
  if (!stats) {
    stats = new Stats()
    stats.showPanel(0)
    document.body.appendChild( stats.dom )
    stats.dom.style.top = '7px'
    stats.dom.style.left = '460px'
  } else {
    document.body.removeChild( stats.dom )
    stats = undefined
  }
})

// setInterval(() => {
//   let count = Object.values(store.getState().sceneObjects).length
//
//   store.dispatch(createObject({
//
//     id: count,
//     type: 'character',
//     height: 1.6,
//     x: 1 + (Math.random() * 0.5),
//     y: 0,
//     z: 0,
//     rotation: -0.8
//
//     // type: 'box',
//     // width: 1,
//     // height: 0.5,
//     // depth: 1,
//     // x: 4,
//     // y: 0.5,
//     // z: 0,
//     // rotation: 0,
//   }))
// }, 1000)
//
// setInterval(() => {
//   // let count = Object.values(store.getState().sceneObjects).length
//   store.dispatch(deleteObject(5))
//   store.dispatch(deleteObject(6))
//   store.dispatch(deleteObject(7))
// }, 3000)

// setInterval(() => {
//   let r = store.getState().sceneObjects[4].rotation
//   store.dispatch(updateObject(4, { rotation: r + 0.1 }))
// }, 1000)

module.exports = {
  SceneContext,
  Toolbar,
  Icon,
  ElementsPanel,
  CameraInspector,
  BoardInspector,
  GuidesInspector,
  CamerasInspector,
  KeyHandler,
  MenuManager,
  PhoneCursor,

  Camera,

  preventDefault,
  animatedUpdate,
  gltfLoader,

  stats
}
