const { remote } = require('electron')
const { useState, useEffect, useLayoutEffect, useRef, useMemo, forwardRef } = React = require('react')
const { connect } = require('react-redux')
const path = require('path')
const fs = require('fs-extra')
const classNames = require('classnames')
const prompt = require('electron-prompt')
const THREE = require('three')
window.THREE = THREE

// for pose harvesting (maybe abstract this later?)
const { machineIdSync } = require('node-machine-id')
const pkg = require('../../../package.json')
const request = require('request')

const { createSelector } = require('reselect')

const { FixedSizeGrid } = require('react-window')

const h = require('../utils/h')

const {
  updateObject,
  createPosePreset,

  getSceneObjects
} = require('../shared/reducers/shot-generator')

const ModelLoader = require('../services/model-loader')

require('../vendor/three/examples/js/utils/SkeletonUtils')
require('../vendor/OutlineEffect.js')

const defaultPosePresets = require('../shared/reducers/shot-generator-presets/poses.json')
const presetsStorage = require('../shared/store/presetsStorage')

const comparePresetNames = (a, b) => {
  var nameA = a.name.toUpperCase()
  var nameB = b.name.toUpperCase()

  if (nameA < nameB) {
    return -1
  }
  if (nameA > nameB) {
    return 1
  }
  return 0
}

const shortId = id => id.toString().substr(0, 7).toLowerCase()

const GUTTER_SIZE = 5
const ITEM_WIDTH = 68
const ITEM_HEIGHT = 132

const IMAGE_WIDTH = ITEM_WIDTH
const IMAGE_HEIGHT = 100

class PoseRenderer {
  constructor () {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true
    })
    this.renderer.setClearColor( 0x3e4043, 1 )

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      // fov
      75,
      // aspect ratio
      IMAGE_WIDTH/IMAGE_HEIGHT,

      // near
      0.01,

      // far
      1000
    )

    let light = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(light)

    this.group = new THREE.Group()
    this.scene.add(this.group)

    let directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.7)

    this.scene.add(directionalLight)
    directionalLight.position.set(0, 5, 3)
    directionalLight.rotation.z = Math.PI/6.0
    directionalLight.rotation.y = Math.PI/6.0
    directionalLight.rotation.x = Math.PI/6.0


    this.camera.position.y = 1
    this.camera.position.z = 2
    this.scene.add(this.camera)

    this.outlineEffect = new THREE.OutlineEffect(
      this.renderer,
      {
        defaultThickness: 0.018, // 0.008, 0.009
        ignoreMaterial: false,
        defaultColor: [0, 0, 0]
      }
    )
  }

  setup ({ preset }) {
    let pose = preset.state.skeleton
    let skeleton = this.child.skeleton

    skeleton.pose()
    for (let name in pose) {
      let bone = skeleton.getBoneByName(name)
      if (bone) {
        bone.rotation.x = pose[name].rotation.x
        bone.rotation.y = pose[name].rotation.y
        bone.rotation.z = pose[name].rotation.z

        if (name === 'Hips') {
          bone.rotation.x += Math.PI / 2.0
        }
      }
    }
  }

  clear () {}

  render () {
    this.renderer.setSize(IMAGE_WIDTH*2, IMAGE_HEIGHT*2)
    this.outlineEffect.render(this.scene, this.camera)
  }

  toDataURL (...args) {
    return this.renderer.domElement.toDataURL(...args)
  }

  setModelData (modelData) {
    if (!this.group.children.length) {
      let group = THREE.SkeletonUtils.clone(modelData.scene.children[0])
      this.child = group.children[1]

      let material = new THREE.MeshToonMaterial({
        color: 0xffffff,
        emissive: 0x0,
        specular: 0x0,
        skinning: true,
        shininess: 0,
        flatShading: false,
        morphNormals: true,
        morphTargets: true,
        map: modelData.scene.children[0].children[1].material.map
      })
      material.map.needsUpdate = true

      this.child.material = material
      this.group.add(group)
      group.rotation.y = Math.PI/20

      // uncomment to test a simple box
      //
      // let box = new THREE.Mesh(
      //   new THREE.BoxGeometry( 1, 1, 1 ),
      //   new THREE.MeshToonMaterial({
      //     color: 0xcccccc,
      //     emissive: 0x0,
      //     specular: 0x0,
      //     shininess: 0,
      //     flatShading: false
      //   })
      // )
      // this.group.add(box)
    }
  }
}

const poseRenderer = new PoseRenderer()

const PosePresetsEditorItem = React.memo(({ style, id, posePresetId, preset, updateObject }) => {
  const src = path.join(remote.app.getPath('userData'), 'presets', 'poses', `${preset.id}.jpg`)

  const onClick = event => {
    event.preventDefault()

    let posePresetId = preset.id
    let skeleton = preset.state.skeleton

    updateObject(id, { posePresetId, skeleton })
  }

  useMemo(() => {
    let hasRendered = fs.existsSync(src)

    if (!hasRendered) {
      poseRenderer.setup({ preset })
      poseRenderer.render()
      let dataURL = poseRenderer.toDataURL('image/jpg')
      poseRenderer.clear()

      fs.ensureDirSync(path.dirname(src))

      fs.writeFileSync(
        src,
        dataURL.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      )
    }
  }, [src])

  let className = classNames({
    'pose-presets-editor__item--selected': posePresetId === preset.id
  })

  return h(['div.pose-presets-editor__item', {
    style,
    className,
    onClick,
    'data-id': preset.id,
    title: preset.name
  }, [
    ['figure', { style: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }}, [
      ['img', { src, style: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT } }]
    ]],
    ['div.pose-presets-editor__name', {
      style: {
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT - IMAGE_HEIGHT - GUTTER_SIZE
      },
    }, preset.name]
  ]])
})

const ListItem = React.memo(({ data, columnIndex, rowIndex, style }) => {
  let { id, posePresetId, updateObject} = data
  let preset = data.presets[columnIndex + (rowIndex * 4)]

  if (!preset) return h(['div', { style }])

  return h([
    PosePresetsEditorItem,
    {
      style,
      id, posePresetId, updateObject,
      preset
    }
  ])
})

const getSortedPosePresets = createSelector(
  [state => state.presets.poses],
  poses => Object.values(poses).sort(comparePresetNames)
)

const PosePresetsEditor = connect(
  state => ({
    sortedPosePresets: getSortedPosePresets(state),

    attachments: state.attachments
  }),
  {
    updateObject,
    createPosePreset,
    withState: (fn) => (dispatch, getState) => fn(dispatch, getState())
  }
)(
React.memo(({
  id,
  posePresetId,

  sortedPosePresets,
  attachments,

  updateObject,
  createPosePreset,
  withState
}) => {
  const [ready, setReady] = useState(false)
  const [terms, setTerms] = useState(null)

  const filepath = useMemo(() =>
    ModelLoader.getFilepathForModel(
      { model: 'adult-male', type: 'character' },
      { storyboarderFilePath: null }
    )
  , [])

  const presets = useMemo(() => {
    const matchAll = terms == null || terms.length === 0

    return sortedPosePresets
      .filter(preset => {
        if (matchAll) return true

        let termsRegex = new RegExp(terms, 'i')
        return preset.name.match(termsRegex) ||
                (preset.keywords && preset.keywords.match(termsRegex))
      })
  }, [sortedPosePresets, terms])

  useEffect(() => {
    if (ready) return

    if (attachments[filepath] && attachments[filepath].value) {
      poseRenderer.setModelData(attachments[filepath].value)
      setTimeout(() => {
        setReady(true)
      }, 100) // slight delay for snappier character selection via click
    }
  }, [attachments])


  const onChange = event => {
    event.preventDefault()
    setTerms(event.currentTarget.value)
  }

  const onCreatePosePresetClick = event => {
    event.preventDefault()

    // show a prompt to get the desired preset name
    let win = remote.getCurrentWindow()
    prompt({
      title: 'Preset Name',
      label: 'Select a Preset Name',
      value: `Pose ${shortId(THREE.Math.generateUUID())}`
    }, win).then(name => {
      if (name != null && name != '' && name != ' ') {
        withState((dispatch, state) => {
          // get the latest skeleton data
          let sceneObject = getSceneObjects(state)[id]
          let skeleton = sceneObject.skeleton
          let model = sceneObject.model

          // create a preset out of it
          let newPreset = {
            id: THREE.Math.generateUUID(),
            name,
            keywords: name, // TODO keyword editing
            state: {
              skeleton: skeleton || {}
            }
          }

          // add it to state
          createPosePreset(newPreset)

          // save to server
          // for pose harvesting (maybe abstract this later?)
          request.post('https://storyboarders.com/api/create_pose', {
            form: {
              name: name,
              json: JSON.stringify(skeleton),
              model_type: model,
              storyboarder_version: pkg.version,
              machine_id: machineIdSync()
            }
          })

          // select the preset in the list
          updateObject(id, { posePresetId: newPreset.id })

          // get updated state (with newly created pose preset)
          withState((dispatch, state) => {
            // ... and save it to the presets file
            let denylist = Object.keys(defaultPosePresets)
            let filteredPoses = Object.values(state.presets.poses)
              .filter(pose => denylist.includes(pose.id) === false)
              .reduce(
                (coll, pose) => {
                  coll[pose.id] = pose
                  return coll
                },
                {}
              )
            presetsStorage.savePosePresets({ poses: filteredPoses })
          })
        })
      }
    }).catch(err =>
      console.error(err)
    )
  }

  // via https://reactjs.org/docs/forwarding-refs.html
  const innerElementType = forwardRef(({ style, ...rest }, ref) => {
    return h([
      'div',
      {
        ref,
        style: {
          ...style,
          width: 288, // cut off the right side gutter
          position: 'relative',
          overflow: 'hidden'
        },
        ...rest
      },
    ])
  })

  return h(
    ['div.pose-presets-editor.column', ready && [
      ['div.row', { style: { padding: '6px 0' } }, [
        ['div.column', { style: { flex: 1 }}, [
          ['input', {
            placeholder: 'Search for a pose …',
            onChange
          }],
        ]],
        ['div.column', { style: { marginLeft: 5 }}, [
          ['a.button_add[href=#]', {
            style: { width: 30, height: 34 },
            onClick: onCreatePosePresetClick
          }, '+']
        ]]
      ]],
      ['div.pose-presets-editor__list', [
        FixedSizeGrid,
        {
          columnCount: 4,
          columnWidth: ITEM_WIDTH + GUTTER_SIZE,

          rowCount: Math.ceil(presets.length / 4),
          rowHeight: ITEM_HEIGHT,

          width: 288,
          height: 363,

          innerElementType,

          itemData: {
            presets,

            id: id,
            posePresetId: posePresetId,
            updateObject
          },
          children: ListItem
        }
      ]]
    ]]
  )
}))

module.exports = PosePresetsEditor
