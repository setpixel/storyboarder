import ShotRule from "./ShotRule"
import * as THREE from 'three'

const isBoneInShot = (bone) => {
    let name = bone.name;
    return name === "Neck" || name === "Head" || name === "leaf" 
            || name === "LeftEye" || name === "RightEye" || name === "LeftShoulder"
            || name === "RightShoulder";
}

class AreaShotRule extends ShotRule {
    constructor(focusedCenter, camera, characters, shot) {
        super(focusedCenter, camera);
        this.characters = characters;
        this.shot = shot;
        this.radius = 1.5;
    }

    applyRule(scene) {
        super.applyRule();
        let character = this.shot.character;
        let charactersInRange = [];
        let characterPosition = character.worldPosition();
        let headPoints = [];
        let frustum = new THREE.Frustum();
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();

        frustum.setFromProjectionMatrix( new THREE.Matrix4().multiplyMatrices( this.camera.projectionMatrix, this.camera.matrixWorldInverse ) );
        for( let i = 0; i < this.characters.length; i++) {
            let position = this.characters[i].worldPosition();
            if(Math.pow(position.x - characterPosition.x, 2) + Math.pow(position.y - characterPosition.y, 2) < Math.pow(this.radius, 2)) {
                let shotCharacter = this.characters[i];
                let skinnedMesh = shotCharacter.getObjectByProperty("type", "SkinnedMesh");
                if(!skinnedMesh || !skinnedMesh.skeleton) continue
                let box = new THREE.Box3();
                for(let i = 0; i < skinnedMesh.skeleton.bones.length; i++) {
                    let bone = skinnedMesh.skeleton.bones[i];
                    box.expandByPoint(bone.worldPosition());
                }
                if(skinnedMesh && frustum.intersectsBox(box)) {
                    charactersInRange.push(shotCharacter);
                    headPoints = headPoints.concat(this.getCharacterShotPoints(skinnedMesh));
                }
            }
        }
        let box = new THREE.Box3().setFromPoints(headPoints);
        if(charactersInRange.length > 1) {

            //#region Camera distancing method
            let center = this.focusedCenter;
            let areaCenter = new THREE.Vector3();
            box.getCenter(areaCenter)
            areaCenter.y = box.max.y
            areaCenter.x = center.x
            areaCenter.z = center.z
            let BA = new THREE.Vector3().subVectors(center, this.camera.position);
            let BC = new THREE.Vector3().subVectors(areaCenter, this.camera.position);
            let cosineAngle = BA.dot(BC) / (BA.length() * BC.length());
            let angle = Math.acos(cosineAngle);

            let difference = center.clone().sub(areaCenter);
            let normalCenter = difference.clone().normalize();
            normalCenter.set(normalCenter.y, normalCenter.x, 0);
            let sphere = new THREE.Sphere();
            box.getBoundingSphere(sphere);
            this.camera.rotateOnAxis(normalCenter, angle);
            let direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            direction.negate();
            let depth = sphere.radius / Math.tan(this.camera.fov / 2 * Math.PI / 180.0);
            let newPos = new THREE.Vector3().addVectors(sphere.center, direction.clone().setLength(depth));
            if(sphere.center.distanceTo(newPos) + this.radius > sphere.center.distanceTo(this.camera.position)) {
                this.camera.position.copy(newPos)
            }
            this.camera.updateMatrixWorld(true);
            //#endregion

        }
        return null
    }


    //#region private methods
    getCharacterShotPoints(skinnedMesh) {
        let headPoints = [];
        let shotBones = skinnedMesh.skeleton.bones.filter(bone => isBoneInShot(bone));
        for(let i = 0; i < shotBones.length; i++) {
            headPoints.push(shotBones[i].worldPosition());
        }
        return headPoints;
    }
    //#endregion
}

export default AreaShotRule;
