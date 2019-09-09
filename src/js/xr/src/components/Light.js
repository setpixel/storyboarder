const { useUpdate } = require('react-three-fiber')

const Light = React.memo(({ sceneObject, isSelected, children }) => {
  const ref = useUpdate(self => {
    self.rotation.x = 0
    self.rotation.z = 0
    self.rotation.y = sceneObject.rotation || 0
    self.rotateX(sceneObject.tilt || 0)
    self.rotateZ(sceneObject.roll || 0)

    // TODO
    // spotLight.target.position.set(0, 0, sceneObject.distance)
  }, [sceneObject.rotation, sceneObject.tilt, sceneObject.roll, sceneObject.distance])

  const spotLight = useUpdate(
    self => {
      self.target.position.set(0, 0, sceneObject.distance)
      self.add(self.target)
    },
    [sceneObject.intensity, sceneObject.distance]
  )

  return (
    <group
      ref={ref}
      onController={sceneObject.visible ? () => null : null}
      visible={sceneObject.visible}
      userData={{
        id: sceneObject.id,
        type: 'light'
      }}
      position={[sceneObject.x, sceneObject.z, sceneObject.y]}
    >
      
      <spotLight
        ref={spotLight}
        color={0xffffff}
        intensity={sceneObject.intensity}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        angle={sceneObject.angle}
        distance={sceneObject.distance}
        penumbra={sceneObject.penumbra}
        decay={sceneObject.decay}
      />
     
      <mesh>
        <cylinderBufferGeometry attach="geometry" args={[0.0, 0.05, 0.14]} />
        <meshLambertMaterial
          attach="material"
          color={0xffff66}
          emissive-b={isSelected ? 0.15 : 0}
        />
      </mesh>
      {children}
    </group>
  )
})

module.exports = Light