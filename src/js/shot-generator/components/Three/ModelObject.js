import * as THREE from 'three'
import React, { useMemo, useEffect, useRef } from 'react'
import { useUpdate, extend } from 'react-three-fiber'

import traverseMeshMaterials from '../../helpers/traverse-mesh-materials'
import { useAsset } from "../../hooks/use-assets-manager"

import { SHOT_LAYERS } from '../../utils/ShotLayers'
import RoundedBoxGeometryCreator from './../../../vendor/three-rounded-box'
import { patchMaterial, setSelected } from "../../helpers/outlineMaterial"
import { axis } from "../../../shared/IK/utils/TransformControls"

const RoundedBoxGeometry = RoundedBoxGeometryCreator(THREE)

extend({RoundedBoxGeometry})

const materialFactory = () => patchMaterial(new THREE.MeshToonMaterial({
  color: 0xcccccc,
  emissive: 0x0,
  specular: 0x0,
  skinning: false,
  shininess: 0,
  flatShading: false,
  morphNormals: false,
  morphTargets: false
}), {
  thickness: 0.008
})

const meshFactory = (source, isIcon) => {
  let mesh = source.isSkinnedMesh ? THREE.SkeletonUtils.clone(source) : source.clone()

  let material = materialFactory(isIcon)

  if (mesh.material.map) {
    material.map = mesh.material.map
    material.map.needsUpdate = true
  }
  mesh.material = material

  return mesh
}

const ModelObject = React.memo(({path, isIcon = false, sceneObject, isSelected, ...props }) => {
  const ref = useUpdate(
    self => {
      self.traverse(child => child.layers.enable(SHOT_LAYERS))
    }
  )
  
  const {asset} = useAsset((sceneObject.model === 'box') ? null : path)

  const meshes = useMemo(() => {
    if (sceneObject.model === 'box') {
      return [
        <mesh key={sceneObject.id}>
          <roundedBoxGeometry
            ref={ref => ref && ref.translate(0, 0.5, 0)}
            attach='geometry'
            args={[1, 1, 1, 0.005, 5]} />
          <primitive
            attach='material'
            object={materialFactory(isIcon)} />
        </mesh>
      ]
    }

    if (asset) {
      let children = []
      asset.scene.traverse(child => {
        if (child.isMesh) {
          children.push(
            <primitive
              key={`${sceneObject.id}-${child.uuid}`}
              object={meshFactory(child, isIcon)}
            />
          )
        }
      })
      return children
    }

    return []
  }, [sceneObject.model, asset])

  useEffect(() => {
    traverseMeshMaterials(ref.current, material => {
      if (material.emissive) {
        material.emissive = new THREE.Color( sceneObject.tintColor || '#000000' )
      }
    })
  }, [ref.current, sceneObject.tintColor])

  useEffect(() => {
    ref.current.traverse((child) => {
      if (child.isMesh) {
        setSelected(child, isSelected, sceneObject.blocked)
      }
    })
  }, [ref.current, isSelected, sceneObject.blocked, asset])

  useEffect(() => {
    if(isIcon) return
    if(!ref.current) return
    if(isSelected) {
      props.objectRotationControl.setUpdateCharacter((name, rotation) => {
        let euler = new THREE.Euler().setFromQuaternion(ref.current.worldQuaternion())
        props.updateObject(ref.current.userData.id, {
          rotation:
          {
            x : euler.x,
            y : euler.y,
            z : euler.z,
          }
        } )})
      props.objectRotationControl.setCharacterId(ref.current.uuid)
      props.objectRotationControl.selectObject(ref.current, ref.current.uuid)
      props.objectRotationControl.control.setShownAxis(axis.X_axis | axis.Y_axis | axis.Z_axis)
    }
    else {
      if(props.objectRotationControl && props.objectRotationControl.isSelected(ref.current)) {
        props.objectRotationControl.deselectObject()
      }
    }
  }, [isSelected])

  useEffect(() => {
    return () => {
      if(props.objectRotationControl && props.objectRotationControl.isSelected(ref.current)) {
        props.objectRotationControl.deselectObject()
      }
    }
  }, [])

  const { x, y, z, visible, width, height, depth, rotation, locked, blocked } = sceneObject

  return <group
    ref={ref}

    onController={ sceneObject.visible ? () => null : null} 
    userData={{
      type: 'object',
      id: sceneObject.id,
      locked: locked,
      blocked: blocked
    }}

    visible={ visible }
    position={ [x, z, y] }
    scale={ [width, height, depth] }
    rotation={ [rotation.x, rotation.y, rotation.z] }
    {...props}
  >
    {meshes}
  </group>
})

export default ModelObject
