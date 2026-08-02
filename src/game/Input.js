import * as THREE from 'three';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
/** Ignore micro-jitter when the ground aim is on top of the ball. */
const MIN_STEER_DIST_SQ = 0.25;
const TILT_DEADZONE_DEG = 4;
const TILT_MAX_DEG = 22;

/**
 * Keyboard + mouse (desktop) or device tilt (mobile) for rolling the calamari.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this._pointerActive = false;
    this._pointerClientX = 0;
    this._pointerClientY = 0;
    /** @type {HTMLCanvasElement | null} */
    this._canvas = null;

    this._tiltActive = false;
    this._orientationBound = false;
    this._gamma = 0;
    this._beta = 0;
    this._neutralGamma = 0;
    this._neutralBeta = 0;

    this._onOrientation = (e) => {
      if (e.gamma == null || e.beta == null) return;
      this._gamma = e.gamma;
      this._beta = e.beta;
    };

    this._onDown = (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => {
      this.keys.clear();
      this.clearPointer();
    };
    this._onPointerDown = (e) => {
      if (Input.prefersTilt()) return;
      if (e.button !== 0) return;
      e.preventDefault();
      this._pointerActive = true;
      this._setPointerClient(e.clientX, e.clientY);
    };
    this._onPointerUp = (e) => {
      if (e.button !== 0) return;
      this.clearPointer();
    };
    this._onPointerMove = (e) => {
      if (!this._pointerActive) return;
      this._setPointerClient(e.clientX, e.clientY);
    };
  }

  /** @returns {boolean} */
  static prefersTilt() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  /** iOS Safari requires a user gesture before device orientation events fire. */
  static needsMotionPermission() {
    return (
      typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function'
    );
  }

  /** @returns {boolean} */
  static canUseTilt() {
    return typeof DeviceOrientationEvent !== 'undefined';
  }

  static getControlHint() {
    if (Input.prefersTilt()) return 'Tilt your phone to roll the calamari';
    return 'Click / hold to roll toward cursor · WASD · scroll zoom · Esc pause';
  }

  init() {
    this._canvas = document.getElementById('game-canvas');

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);

    if (!this._canvas) return;

    this._canvas.addEventListener('mousedown', this._onPointerDown);
    window.addEventListener('mouseup', this._onPointerUp);
    this._canvas.addEventListener('mousemove', this._onPointerMove);
    this._canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    this.disableTilt();
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mouseup', this._onPointerUp);

    if (this._canvas) {
      this._canvas.removeEventListener('mousedown', this._onPointerDown);
      this._canvas.removeEventListener('mousemove', this._onPointerMove);
    }
    this._canvas = null;
  }

  clearPointer() {
    this._pointerActive = false;
  }

  /** @returns {boolean} */
  isTiltActive() {
    return this._tiltActive;
  }

  /** @returns {Promise<boolean>} */
  async enableTilt() {
    if (!Input.canUseTilt()) return false;

    if (Input.needsMotionPermission()) {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') return false;
    }

    if (!this._orientationBound) {
      window.addEventListener('deviceorientation', this._onOrientation);
      this._orientationBound = true;
    }

    this._tiltActive = true;
    this.calibrateTilt();
    return true;
  }

  disableTilt() {
    if (this._orientationBound) {
      window.removeEventListener('deviceorientation', this._onOrientation);
      this._orientationBound = false;
    }
    this._tiltActive = false;
  }

  /** Treat the current phone angle as neutral (call when a stage starts). */
  calibrateTilt() {
    this._neutralGamma = this._gamma;
    this._neutralBeta = this._beta;
  }

  /** @returns {{ x: number, z: number }} camera-relative wish dir in XZ */
  getMoveVector() {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  /** @returns {{ x: number, z: number }} camera-relative tilt wish */
  getTiltMoveVector() {
    if (!this._tiltActive) return { x: 0, z: 0 };

    const dx = this._gamma - this._neutralGamma;
    const dz = -(this._beta - this._neutralBeta);
    let x = Math.abs(dx) > TILT_DEADZONE_DEG ? dx : 0;
    let z = Math.abs(dz) > TILT_DEADZONE_DEG ? dz : 0;

    const len = Math.hypot(x, z);
    if (len < 0.001) return { x: 0, z: 0 };

    const strength = Math.min(1, len / TILT_MAX_DEG);
    return { x: (x / len) * strength, z: (z / len) * strength };
  }

  /**
   * World-space roll direction toward the active mouse pointer on the ground plane.
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./Katamari.js').Katamari} ball
   * @returns {{ x: number, z: number } | null}
   */
  getPointerWorldWish(camera, ball) {
    if (!this._pointerActive || !this._canvas || !ball) return null;

    const rect = this._canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    _ndc.x = ((this._pointerClientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((this._pointerClientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_ndc, camera);
    if (!_raycaster.ray.intersectPlane(GROUND_PLANE, _hit)) return null;

    const dx = _hit.x - ball.position.x;
    const dz = _hit.z - ball.position.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < MIN_STEER_DIST_SQ) return { x: 0, z: 0 };

    const len = Math.sqrt(lenSq);
    return { x: dx / len, z: dz / len };
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./Katamari.js').Katamari} ball
   * @param {import('./FollowCamera.js').FollowCamera} followCam
   * @returns {{ x: number, z: number }}
   */
  resolveWorldWish(camera, ball, followCam) {
    if (!Input.prefersTilt()) {
      const pointer = this.getPointerWorldWish(camera, ball);
      if (pointer) return pointer;
    }

    if (this._tiltActive) {
      const tilt = this.getTiltMoveVector();
      if (tilt.x !== 0 || tilt.z !== 0) {
        return followCam.wishToWorld(tilt);
      }
    }

    return followCam.wishToWorld(this.getMoveVector());
  }

  isEscapePressed() {
    return this.keys.has('Escape');
  }

  /** @param {number} clientX @param {number} clientY */
  _setPointerClient(clientX, clientY) {
    this._pointerClientX = clientX;
    this._pointerClientY = clientY;
  }
}
