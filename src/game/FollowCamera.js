import * as THREE from 'three';

/**
 * Chase camera: always sits on an orbit around the ball, behind travel facing.
 * Facing comes from velocity (wish while nearly stopped) — not mesh roll.
 * Input is camera-relative via wishToWorld; mouse wheel zooms.
 */
export class FollowCamera {
  /** @param {import('./Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.yaw = 0;
    /** 1 = default; smaller = closer; larger = farther */
    this.zoom = 1;
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._onWheel = (e) => {
      e.preventDefault();
      const step = this.game.tuning.cameraZoomStep ?? 0.12;
      const min = this.game.tuning.cameraZoomMin ?? 0.45;
      const max = this.game.tuning.cameraZoomMax ?? 2.4;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.zoom = THREE.MathUtils.clamp(this.zoom + dir * step, min, max);
    };
  }

  init() {
    const canvas = document.getElementById('game-canvas');
    canvas?.addEventListener('wheel', this._onWheel, { passive: false });
  }

  reset() {
    this.yaw = 0;
    this.zoom = 1;
  }

  /**
   * @param {number} dt
   * @param {import('./Katamari.js').Katamari} ball
   * @param {{ x: number, z: number }} wish world-space wish (from wishToWorld)
   */
  update(dt, ball, wish) {
    const cam = this.game.camera;
    const { cameraDistance, cameraHeight, cameraLerp } = this.game.tuning;

    // Facing = horizontal travel direction; wish while nearly stopped so turn starts early.
    let faceX = 0;
    let faceZ = 0;
    const spd = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (spd > 0.2) {
      faceX = ball.velocity.x / spd;
      faceZ = ball.velocity.z / spd;
    } else if (wish && (wish.x !== 0 || wish.z !== 0)) {
      faceX = wish.x;
      faceZ = wish.z;
    }

    if (faceX !== 0 || faceZ !== 0) {
      const targetYaw = Math.atan2(faceX, faceZ);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = 1 - Math.exp(-cameraLerp * dt);
      this.yaw += diff * turn;
    }

    const dist = (cameraDistance + ball.radius * 2.2) * this.zoom;
    const height = (cameraHeight + ball.radius * 1.4) * this.zoom;

    // Always on the orbit ring around the ball (behind facing).
    this._desired.set(
      ball.position.x - Math.sin(this.yaw) * dist,
      ball.position.y + height,
      ball.position.z - Math.cos(this.yaw) * dist,
    );
    cam.position.copy(this._desired);
    this._look.set(ball.position.x, ball.position.y + ball.radius * 0.3, ball.position.z);
    cam.lookAt(this._look);
  }

  /** Convert camera-relative wish (W forward / S back / A left / D right) into world XZ. */
  wishToWorld(wish) {
    if (wish.x === 0 && wish.z === 0) return wish;

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);

    // W → z=-1 forward, S → z=+1 back; A → x=-1 left, D → x=+1 right
    const wx = -wish.z * fx + wish.x * rx;
    const wz = -wish.z * fz + wish.x * rz;
    const len = Math.hypot(wx, wz);
    if (len > 0) return { x: wx / len, z: wz / len };
    return { x: 0, z: 0 };
  }
}
