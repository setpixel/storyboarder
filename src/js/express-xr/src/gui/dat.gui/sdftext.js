/**
* dat-guiVR Javascript Controller Library for VR
* https://github.com/dataarts/dat.guiVR
*
* Copyright 2016 Data Arts Team, Google Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import SDFShader from 'three-bmfont-text/shaders/sdf';
import createGeometry from 'three-bmfont-text';
import parseASCII from 'parse-bmfont-ascii';

import * as Font from './font';

export function createMaterial( color ){

  const texture = new THREE.Texture();
  const image = Font.image();
  texture.image = image;
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return new THREE.RawShaderMaterial(SDFShader({
    side: THREE.DoubleSide,
    transparent: true,
    color: color,
    map: texture
  }));
}

const textScale = 0.00024;

export function creator(){

  const font = parseASCII( Font.fnt() );

  const colorMaterials = {};

  function createText( str, font, color = 0xffffff, scale = 1.0, centerText ){

    const geometry = createGeometry({
      text: str,
      align: 'left',
      width: 10000,
      flipY: true,
      font
    });

    const layout = geometry.layout;

    let material = colorMaterials[ color ];
    if( material === undefined ){
      material = colorMaterials[ color ] = createMaterial( color );
    }
    const mesh = new THREE.Mesh( geometry, material );
    mesh.scale.multiply( new THREE.Vector3(1,-1,1) );

    const finalScale = scale * textScale;

    mesh.scale.multiplyScalar( finalScale );

    const middle = new THREE.Vector3()
    geometry.computeBoundingBox()
    middle.x = (geometry.boundingBox.max.x + geometry.boundingBox.min.x) / 2
    middle.y = (geometry.boundingBox.max.y + geometry.boundingBox.min.y) / 2

    if (centerText === 'default') {
      mesh.position.y = layout.height * 0.5 * finalScale
    } else if (centerText === 'slider') {
      mesh.position.y = layout.height * 0.5 * finalScale
      middle.multiply(mesh.scale).multiply(new THREE.Vector3(-1, 0, 0))
      mesh.position.add(middle)
    } else if (centerText === 'custom') {
      middle.multiply(mesh.scale).multiplyScalar(-1)
      mesh.position.copy(middle)
    } else {
      middle.multiply(mesh.scale).multiply(new THREE.Vector3(0, -1, 0))
      mesh.position.copy(middle)
    }

    return mesh;
  }


  function create( str, { color=0xffffff, scale=1.0, centerText = 'default' } = {} ){
    const group = new THREE.Group();

    let mesh = createText( str, font, color, scale, centerText );
    group.add( mesh );
    group.layout = mesh.geometry.layout;

    group.updateLabel = function( str ){
      mesh.geometry.update( str );
    };

    return group;
  }

  return {
    create,
    getMaterial: ()=> material
  }

}