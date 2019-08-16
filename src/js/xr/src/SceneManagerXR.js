const THREE = require('three')
window.THREE = window.THREE || THREE
const { Canvas, useThree, useRender } = require('react-three-fiber')

const { connect, useStore, Provider } = require('react-redux')
const { useMemo, useState, useRef, Suspense } = React = require('react')

const { WEBVR } = require('three/examples/jsm/vr/WebVR')

const {
  getSceneObjects,
  getWorld,
  getActiveCamera
} = require('../../shared/reducers/shot-generator')

const useRStats = require('./hooks/use-rstats')
const useVrControllers = require('./hooks/use-vr-controllers')

const Stats = require('./components/Stats')
const Ground = require('./components/Ground')
const Character = require('./components/Character')

const { createSelector } = require('reselect')

// TODO move to selectors if useful
// TODO optimize to only change if top-level keys change
const getSceneObjectCharacterIds = createSelector(
  [getSceneObjects],
  sceneObjects => Object.values(sceneObjects).filter(o => o.type === 'character').map(o => o.id)
)

const SceneContent = connect(
  state => ({
    sceneObjects: getSceneObjects(state),
    world: getWorld(state),
    activeCamera: getActiveCamera(state),

    characterIds: getSceneObjectCharacterIds(state)
  })
)(
  ({
    sceneObjects, world, activeCamera,
    characterIds
  }) => {
    const { camera, scene } = useThree()

    const [teleportPos, setTeleportPos] = useState(null)
    const [teleportRot, setTeleportRot] = useState(null)

    // initialize behind the camera, on the floor
    useMemo(() => {
      const { x, y, rotation } = sceneObjects[activeCamera]

      const behindCam = {
        x: Math.sin(rotation),
        y: Math.cos(rotation)
      }

      setTeleportPos(new THREE.Vector3(x + behindCam.x, 0, y + behindCam.y))
      setTeleportRot(new THREE.Euler(0, rotation, 0))
    }, [])

    useMemo(() => {
      scene.background = new THREE.Color(0x000000)
      scene.fog = new THREE.Fog( 0x000000, -10, 40 )
    })

    const groundTexture = useMemo(
      () => new THREE.TextureLoader().load('/data/system/grid_floor_1.png'), []
    )

    const rStats = useRStats()
    const controllers = useVrControllers()
    const controllerLeft = useMemo(() => controllers.find(c => c.getHandedness() === 'left'), [controllers])
    const controllerRight = useMemo(() => controllers.find(c => c.getHandedness() === 'right'), [controllers])

    const groupRef = useRef()

    return (
      <>
        <group
          position={teleportPos}
          rotation={teleportRot}
        >
          <primitive object={camera}>
            <Stats rStats={rStats} position={[0, 0, -1]} />
          </primitive>
        </group>

        <ambientLight color={0xffffff} intensity={world.ambient.intensity} />

        {
          characterIds.map(id =>
            <Suspense key={id} fallback={null}>
              <Character sceneObject={sceneObjects[id]} />
            </Suspense>
          )
        }

        <Ground texture={groundTexture} visible={true/*!world.room.visible && world.ground*/} />
      </>
    )
  })

const XRStartButton = ({ }) => {
  const { gl } = useThree()
  useMemo(() => document.body.appendChild(WEBVR.createButton(gl)), [])
  return null
}

const SceneManagerXR = () => {
  const store = useStore()

  const loaded = true

  return (
    <>
      {
        !loaded && <div className='loading-button'>LOADING …</div>
      }
      <Canvas vr>
        <Provider store={store}>
          {
            loaded && <XRStartButton />
          }
          <SceneContent />
        </Provider>
      </Canvas>
      <div className='scene-overlay' />
    </>
  )
}

module.exports = SceneManagerXR