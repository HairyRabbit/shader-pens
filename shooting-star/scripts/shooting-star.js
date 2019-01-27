import * as THREE from 'three'

import {
  animate,
  easingList
} from './modules/animation'
import { downloadFile } from './modules/file'
// import './modules/three/original/postprocessing/BloomPass'
import store from './store'
// import lineCoordinateCache from '../json/lineCoordinateCache.json'
import { EASE } from './constant'

import vertexShader from '../shaders/top/milky-way/particle.vert'
import fragmentShader from '../shaders/top/milky-way/particle.frag'

const data = {
  visible: {
    value: true
  }
}

const uniformData = {
  size: {
    type: '1f',
    value: 0.05,
    range: [0, 1]
  },
  speed: {
    type: '1f',
    value: 0.012,
    range: [0, 0.05]
  },
  alphaSpeed: {
    type: '1f',
    value: 1.1,
    range: [1, 2]
  },
  maxAlpha: {
    type: '1f',
    value: 1.5,
    range: [1, 5]
  },
  spread: {
    type: '1f',
    value: 6,
    range: [0, 20]
  },
  maxSpread: {
    type: '1f',
    value: 5,
    range: [1, 20]
  },
  spreadZ: {
    type: '1f',
    value: 100,
    range: [0, 500]
  },
  far: {
    type: '1f',
    value: 10,
    range: [0, 100]
  },
  maxDiff: {
    type: '1f',
    value: 100,
    range: [0, 1000]
  },
  diffPow: {
    type: '1f',
    value: 0.24,
    range: [0, 10]
  }
}
const DATA_KEYS = Object.keys(uniformData)

const PER_MOUSE = 800
const COUNT = PER_MOUSE * 200
const MOUSE_ATTRIBUTE_COUNT = 4
const FRONT_ATTRIBUTE_COUNT = 2

export default class ShootingStar {
  constructor () {
    const { root, controller } = store
    this.root = root

    this.rate = 1
    this.setSize()

    const folder = controller.addFolder('Shooting Star')
    this.datData = controller.addData(data, { folder })

    const front = new THREE.Vector2()

    const uniforms = {
      resolution: {
        value: store.resolution
      },
      pixelRatio: {
        value: root.renderer.getPixelRatio()
      },
      timestamp: {
        value: 0
      }
    }

    this.datUniformData = controller.addUniformData(uniformData, uniforms, { folder })

    const geometry = this.geometry = new THREE.BufferGeometry()
    const positions = []
    const mouse = []
    const aFront = []
    const random = []
    for (let i = 0; i < COUNT; i++) {
      positions.push(Math.random(), Math.random(), Math.random())
      mouse.push(-1, -1, 0, 0)
      aFront.push(front.x, front.y)
      random.push(Math.random())
    }
    geometry.addAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.addAttribute('mouse', new THREE.Float32BufferAttribute(mouse, MOUSE_ATTRIBUTE_COUNT))
    geometry.addAttribute('aFront', new THREE.Float32BufferAttribute(aFront, FRONT_ATTRIBUTE_COUNT))
    geometry.addAttribute('random', new THREE.Float32BufferAttribute(random, 1))

    const material = this.material = new THREE.RawShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })

    const mesh = this.mesh = new THREE.Points(geometry, material)
    mesh.frustumCulled = false
    mesh.visible = this.datData.visible

    root.add(mesh)

    // root.initPostProcessing([
    //   new THREE.BloomPass(1.3, 25, 3.1, 256),
    //   new THREE.ShaderPass(THREE.CopyShader)
    // ])

    this.mouseI = 0
    this.lineCoordinateList = []
    this.enableSaveCoordinate = false

    root.addUpdateCallback(timestamp => {
      this.update(timestamp)
    })

    root.addResizeCallback(() => {
      this.setSize()

      material.uniforms['resolution'].value = store.resolution

      // let scale
      // if (store.ratio > store.initialRatio) {
      //   scale = store.clientHeight / store.initialClientHeight
      // } else {
      //   scale = store.clientWidth / store.initialClientWidth
      // }
      // console.log(scale)
      // mesh.scale.set(scale, scale, 1)
    })
  }

  setEvent () {
    window.addEventListener('pointermove', e => {
      const { clientX, clientY } = e
      this.draw({
        clientX: clientX - store.clientHalfWidth,
        clientY: clientY - store.clientHalfHeight
      })
    })
    window.addEventListener('touchmove', e => {
      const { clientX, clientY } = e.touches[0]
      this.draw({
        clientX: clientX - store.clientHalfWidth,
        clientY: clientY - store.clientHalfHeight
      })
    })
    window.addEventListener('keydown', ({ key }) => {
      switch (key) {
        case 'r':
          !this.enableSaveCoordinate && (this.lineCoordinateList = [])
          this.enableSaveCoordinate = !this.enableSaveCoordinate
          break
        case 's':
          this.lineCoordinateList.length > 0 && downloadFile(JSON.stringify(this.lineCoordinateList), 'lineCoordinateCache.json')
          break
      }
    })
  }

  setSize () {
    this.rate = Math.min(
      store.ratio > store.initialRatio
        ? store.clientHeight / store.initialClientHeight
        : store.clientWidth / store.initialClientWidth
      , 1)
    this.rate *= 1 / (store.clientHeight / store.initialClientHeight)
  }

  update (timestamp) {
    this.timestamp = timestamp
    this.material.uniforms['timestamp'].value = timestamp

    this.mesh.visible = this.datData.visible
    DATA_KEYS.forEach(key => {
      this.material.uniforms[key].value = this.datUniformData[key]
    })
  }

  draw ({ clientX, clientY }) {
    this.enableSaveCoordinate && this.lineCoordinateList.push({ clientX, clientY })

    // const x = clientX + store.clientHalfWidth
    // const y = store.clientHeight - (clientY + store.clientHalfHeight)
    const x = clientX * this.rate + store.clientHalfWidth
    const y = store.clientHeight - (clientY * this.rate + store.clientHalfHeight)
    const newPosition = new THREE.Vector2(x, y)
    const diff = this.oldPosition ? newPosition.clone().sub(this.oldPosition) : new THREE.Vector2()
    const length = diff.length()
    const front = diff.clone().normalize()

    for (let i = 0; i < PER_MOUSE; i++) {
      const ci = this.mouseI % (COUNT * MOUSE_ATTRIBUTE_COUNT) + i * MOUSE_ATTRIBUTE_COUNT
      const position = this.oldPosition ? this.oldPosition.clone().add(diff.clone().multiplyScalar(i / PER_MOUSE)) : newPosition

      this.geometry.attributes['mouse'].array[ci] = position.x
      this.geometry.attributes['mouse'].array[ci + 1] = position.y
      this.geometry.attributes['mouse'].array[ci + 2] = this.timestamp
      this.geometry.attributes['mouse'].array[ci + 3] = length

      this.geometry.attributes['aFront'].array[ci] = front.x
      this.geometry.attributes['aFront'].array[ci + 1] = front.y
    }

    this.oldPosition = newPosition
    this.geometry.attributes['mouse'].needsUpdate = true
    this.geometry.attributes['aFront'].needsUpdate = true
    this.mouseI += MOUSE_ATTRIBUTE_COUNT * PER_MOUSE
  }

  start () {
    const period = Math.PI * 3

    return new Promise(resolve => {
      animate(progress => {
        this.draw({
          clientX: Math.cos(progress * period) * 150,
          clientY: (progress * store.clientHeight - store.clientHalfHeight) * 1.2
        })
      }, {
        duration: 1300,
        easing: EASE,
        onAfter: () => {
          this.draw({
            clientX: -store.clientHalfWidth,
            clientY: (store.clientHeight - store.clientHalfHeight) * 1.2
          })
          this.draw({
            clientX: -store.clientHalfWidth * 1.1,
            clientY: 0
          })

          this.startText()

          resolve()
        }
      })
    })
  }

  startText () {
    animate(progress => {
      this.draw({
        clientX: progress,
        clientY: 0
      })
    }, {
      begin: -store.clientHalfWidth,
      finish: store.clientHalfWidth,
      duration: 600,
      easing: EASE,
      onAfter: () => {
        this.oldPosition = null
        this.setEvent()
      }
    })
  }
}
