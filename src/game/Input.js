import * as THREE from 'three';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
/** Ignore micro-jitter when the ground aim is on top of the ball. */
const MIN_STEER_DIST_SQ = 0.25;
/** m/s² from table-flat before steering kicks in (~small wrist tilt). */
const TILT_DEADZONE = 1.25;
/** m/s² for full stick deflection. */
const TILT_MAX = 4.5;
const TILT_SMOOTH = 0.22;

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
    this._motionBound = false;
    this._gravX = 0;
    this._gravY = 0;

    this._onMotion = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;

      this._gravX += (g.x - this._gravX) * TILT_SMOOTH;
      this._gravY += (g.y - this._gravY) * TILT_SMOOTH;
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

  /** @returns {boolean} True when the viewport is taller than wide (portrait). */
  static isPortrait() {
    const orientType = screen.orientation?.type;
    if (orientType === 'portrait-primary' || orientType === 'portrait-secondary') {
      return true;
    }
    if (orientType === 'landscape-primary' || orientType === 'landscape-secondary') {
      return false;
    }
    const raw = screen.orientation?.angle ?? window.orientation ?? 0;
    const deg = ((Number(raw) % 360) + 360) % 360;
    if (deg === 90 || deg === 270) return false;
    if (deg === 0 || deg === 180) return true;
    return window.innerHeight >= window.innerWidth;
  }

  /** iOS requires a user gesture before motion/orientation events fire. */
  static needsMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function') {
      return true;
    }
    return (
      typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function'
    );
  }

  /** @returns {boolean} */
  static canUseTilt() {
    return typeof DeviceMotionEvent !== 'undefined'
      || typeof DeviceOrientationEvent !== 'undefined';
  }

  static getControlHint() {
    if (Input.prefersTilt()) {
      return 'Lay phone flat like a marble tray · tilt in landscape to roll · Esc pause';
    }
    return 'Click / hold to roll toward cursor · WASD · scroll zoom · Esc pause';
  }

  /** @returns {Promise<'granted' | 'denied' | 'default'>} */
  static async requestMotionAccess() {
    if (typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission();
    }
    if (typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission();
    }
    return 'granted';
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

    const permission = await Input.requestMotionAccess();
    if (permission !== 'granted') return false;

    if (!this._motionBound && typeof DeviceMotionEvent !== 'undefined') {
      window.addEventListener('devicemotion', this._onMotion);
      this._motionBound = true;
    }

    this._tiltActive = true;
    return true;
  }

  disableTilt() {
    if (this._motionBound) {
      window.removeEventListener('devicemotion', this._onMotion);
      this._motionBound = false;
    }
    this._tiltActive = false;
  }

  /** Screen rotation in degrees (0 portrait, 90/270 landscape). */
  _screenAngleDeg() {
    const raw = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((raw % 360) + 360) % 360;
  }

  /**
   * Device-fixed gravity (gx, gy) into screen-space tilt.
   * Neutral is table-flat screen-up (gx=0, gy=0); gravity mostly on Z.
   */
  _deviceTiltToScreen(gx, gy) {
    const type = screen.orientation?.type;
    switch (type) {
      case 'landscape-primary':
        return { sx: gy, sy: -gx };
      case 'landscape-secondary':
        return { sx: -gy, sy: gx };
      case 'portrait-secondary':
        return { sx: -gx, sy: -gy };
      case 'portrait-primary':
        return { sx: gx, sy: gy };
      default:
        break;
    }

    // Some WebViews (e.g. Discord) report angle 0 in landscape — use viewport.
    if (!Input.isPortrait()) {
      if (this._screenAngleDeg() === 270) {
        return { sx: -gy, sy: gx };
      }
      return { sx: gy, sy: -gx };
    }
    if (this._screenAngleDeg() === 180) {
      return { sx: -gx, sy: -gy };
    }
    return { sx: gx, sy: gy };
  }

  /**
   * Map device gravity to camera-relative wish.
   * Device axes are portrait-fixed on Android; rotate into screen space, then
   * map screen tilt to roll (marble-on-a-tray: lean edge down → roll that way).
   */
  _gravityToWish() {
    const { sx, sy } = this._deviceTiltToScreen(this._gravX, this._gravY);

    const x = sx;
    const z = -sy;

    const len = Math.hypot(x, z);
    if (len < TILT_DEADZONE) return { x: 0, z: 0 };

    const strength = Math.min(1, (len - TILT_DEADZONE) / (TILT_MAX - TILT_DEADZONE));
    return { x: (x / len) * strength, z: (z / len) * strength };
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
    return this._gravityToWish();
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
