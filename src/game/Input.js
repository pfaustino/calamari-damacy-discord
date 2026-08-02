import * as THREE from 'three';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
/** Ignore micro-jitter when the ground aim is on top of the ball. */
const MIN_STEER_DIST_SQ = 0.25;

/**
 * Keyboard + pointer input for rolling the calamari.
 * LMB hold / touch drag steers toward the cursor or finger on the ground plane.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this._pointerActive = false;
    this._pointerClientX = 0;
    this._pointerClientY = 0;
    /** @type {HTMLCanvasElement | null} */
    this._canvas = null;
    /** @type {number | null} */
    this._touchId = null;

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
    this._onTouchStart = (e) => {
      if (this._touchId != null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      this._touchId = t.identifier;
      this._pointerActive = true;
      this._setPointerClient(t.clientX, t.clientY);
    };
    this._onTouchMove = (e) => {
      if (this._touchId == null) return;
      const t = Array.from(e.changedTouches).find((touch) => touch.identifier === this._touchId)
        ?? Array.from(e.touches).find((touch) => touch.identifier === this._touchId);
      if (!t) return;
      e.preventDefault();
      this._setPointerClient(t.clientX, t.clientY);
    };
    this._onTouchEnd = (e) => {
      const ended = Array.from(e.changedTouches).some((t) => t.identifier === this._touchId);
      if (!ended) return;
      this.clearPointer();
    };
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
    this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this._canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this._canvas.addEventListener('touchend', this._onTouchEnd);
    this._canvas.addEventListener('touchcancel', this._onTouchEnd);
    this._canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mouseup', this._onPointerUp);

    if (this._canvas) {
      this._canvas.removeEventListener('mousedown', this._onPointerDown);
      this._canvas.removeEventListener('mousemove', this._onPointerMove);
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('touchend', this._onTouchEnd);
      this._canvas.removeEventListener('touchcancel', this._onTouchEnd);
    }
    this._canvas = null;
  }

  clearPointer() {
    this._pointerActive = false;
    this._touchId = null;
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

  /**
   * World-space roll direction toward the active pointer on the ground plane.
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
   * Pointer steering takes priority while LMB / touch is active; otherwise keyboard.
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./Katamari.js').Katamari} ball
   * @param {import('./FollowCamera.js').FollowCamera} followCam
   * @returns {{ x: number, z: number }}
   */
  resolveWorldWish(camera, ball, followCam) {
    const pointer = this.getPointerWorldWish(camera, ball);
    if (pointer) return pointer;
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
