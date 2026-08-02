import * as THREE from 'three';

/** Proportional volume units (4/3π cancels) — radius = ∛volume. */
function volumeFromRadius(r) {
  return r * r * r;
}

function radiusFromVolume(v) {
  return Math.cbrt(Math.max(0, v));
}

/**
 * Packed volume from a scooped object.
 * size is bounding span; treat half-size as equivalent radius, then × packing.
 */
function objectPackedVolume(size, packing) {
  const r = size * 0.5;
  return packing * r * r * r;
}

/**
 * Sticky calamari ball — rolls, grows, parents collected meshes.
 *
 * Growth adds packed object volume into r³, then radius = ∛volume.
 * (Same cube-root curve as real spheres; 4/3π cancels out of the units.)
 */
export class Katamari {
  /**
   * @param {import('./Game.js').Game} game
   * @param {number} startRadius
   * @param {{ color?: number, spawnX?: number, spawnZ?: number }=} opts
   */
  constructor(game, startRadius, opts = {}) {
    this.game = game;
    this.radius = startRadius;
    this.volume = volumeFromRadius(startRadius);
    this.massCollected = 0;
    this.count = 0;
    /** @type {{ mesh: THREE.Object3D, mass: number, size: number, melt: number, volumeLeft: number, baseScale: THREE.Vector3, dir: THREE.Vector3 }[]} */
    this.stuck = [];
    this.velocity = new THREE.Vector3();
    const sx = opts.spawnX ?? 0;
    const sz = opts.spawnZ ?? 0;
    this.position = new THREE.Vector3(sx, startRadius, sz);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    const color = opts.color ?? 0xff6b8a;
    const geo = new THREE.SphereGeometry(1, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.05,
      emissive: new THREE.Color(color).multiplyScalar(0.25),
      emissiveIntensity: 0.15,
    });
    this.core = new THREE.Mesh(geo, mat);
    this.core.castShadow = true;
    this.core.receiveShadow = true;
    this.group.add(this.core);

    const eyeGeo = new THREE.SphereGeometry(0.18, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.45, 0.35, 0.75);
      eye.scale.setScalar(0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), pupilMat);
      pupil.position.set(0, 0, 0.12);
      eye.add(pupil);
      this.core.add(eye);
    }

    this._syncScale();
    game.scene.add(this.group);

    this._tmp = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._bumpY = 0;
    this._net = null;
  }

  get diameterCm() {
    return Math.round(this.radius * 2 * 10);
  }

  get pickupSize() {
    return this.radius * this.game.tuning.pickupRatio;
  }

  /** Unmelted junk still hanging off the surface. */
  get protrudingMass() {
    let p = 0;
    for (const s of this.stuck) p += (1 - s.melt) * s.mass;
    return p;
  }

  /**
   * Only unmelted surface junk scrapes the floor.
   * Fades with melt and is exactly 0 once the object is gone (after meltDuration).
   */
  get scrapeMass() {
    let p = 0;
    for (const s of this.stuck) {
      const remain = 1 - s.melt;
      if (remain <= 0) continue;
      // Sinks inward while melting — stop scraping once below the shell
      const radial = 0.25 + 0.7 * remain;
      const stickOut = Math.max(0, (radial - 0.5) / 0.45);
      p += s.mass * stickOut;
    }
    return p;
  }

  /**
   * Heavy mass kept for “presence,” but bonks use collisionMass so growth
   * does not turn the ball into an unstoppable plow.
   */
  get mass() {
    const { baseMass, massPerRadius, protrusionInertia } = this.game.tuning;
    return (
      baseMass +
      this.radius * massPerRadius +
      this.protrudingMass * protrusionInertia
    );
  }

  /** Mass used when shoving floor props — stays modest as you grow. */
  get collisionMass() {
    const {
      baseMass,
      collisionMassPerRadius = 0.2,
      protrusionInertia = 1.6,
    } = this.game.tuning;
    return (
      baseMass +
      this.radius * collisionMassPerRadius +
      this.protrudingMass * Math.min(0.35, protrusionInertia * 0.2)
    );
  }

  /** Mass that resists steering — growth & junk don't throttle the pusher. */
  get pushMass() {
    return this.game.tuning.baseMass;
  }

  _syncScale() {
    this.core.scale.setScalar(this.radius);
  }

  /** Apply packed volume into the core; radius follows cube root of total volume. */
  _addVolume(deltaV) {
    if (deltaV <= 0) return;
    this.volume += deltaV;
    this.radius = radiusFromVolume(this.volume);
  }

  addVolume(deltaV) {
    this._addVolume(deltaV);
    this._syncScale();
    this.position.y = this.radius + this._bumpY;
    this.group.position.y = this.position.y;
  }

  /** Battle steal — shrink without destroying stuck meshes. */
  removeVolume(deltaV) {
    if (deltaV <= 0) return;
    const minV = volumeFromRadius(Math.max(0.25, this.game.stage?.startRadius * 0.6 ?? 0.3));
    this.volume = Math.max(minV, this.volume - deltaV);
    this.radius = radiusFromVolume(this.volume);
    this._syncScale();
    this.position.y = this.radius + this._bumpY;
    this.group.position.y = this.position.y;
  }

  /** Guest: hard snap (large correction) with roll from displacement. */
  applyNetState(snap) {
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x = snap.x;
    this.position.z = snap.z;
    this.position.y = snap.y ?? snap.radius;
    this.velocity.x = snap.vx;
    this.velocity.z = snap.vz;
    this.radius = snap.radius;
    this.volume = snap.volume ?? volumeFromRadius(snap.radius);
    this.count = snap.count ?? this.count;
    this._syncScale();
    this._rollByDelta(this.position.x - prevX, this.position.z - prevZ);
    this.group.position.copy(this.position);
  }

  /** Remote balls: store host snapshot to chase smoothly. */
  setNetTarget(snap) {
    this._net = {
      x: snap.x,
      z: snap.z,
      y: snap.y ?? snap.radius,
      vx: snap.vx,
      vz: snap.vz,
      radius: snap.radius,
      volume: snap.volume ?? volumeFromRadius(snap.radius),
      count: snap.count ?? this.count,
      age: 0,
    };
    this.radius = this._net.radius;
    this.volume = this._net.volume;
    this.count = this._net.count;
    this._syncScale();
  }

  /** Soft-correct predicted local ball toward host without killing roll feel. */
  reconcileNet(snap) {
    this.radius = snap.radius;
    this.volume = snap.volume ?? volumeFromRadius(snap.radius);
    this.count = snap.count ?? this.count;
    this._syncScale();

    const err = Math.hypot(snap.x - this.position.x, snap.z - this.position.z);
    const velErr = Math.hypot(snap.vx - this.velocity.x, snap.vz - this.velocity.z);
    const velDot =
      snap.vx * this.velocity.x +
      snap.vz * this.velocity.z;
    const bonkReversal = velDot < 0 && velErr > 1.2;

    if (err > 3.5 || bonkReversal) {
      this.applyNetState(snap);
      return;
    }

    const blend = Math.min(0.55, 0.1 + err * 0.07 + velErr * 0.08);
    this.position.x += (snap.x - this.position.x) * blend;
    this.position.z += (snap.z - this.position.z) * blend;
    this.velocity.x += (snap.vx - this.velocity.x) * blend;
    this.velocity.z += (snap.vz - this.velocity.z) * blend;
    this.position.y = snap.y ?? this.radius + this._bumpY;
    this.group.position.copy(this.position);
  }

  /** Extrapolate + lerp remotes; roll from actual movement. */
  smoothToNet(dt) {
    if (!this._net) return;
    this._net.age += dt;
    const look = Math.min(0.12, this._net.age);
    const tx = this._net.x + this._net.vx * look;
    const tz = this._net.z + this._net.vz * look;
    const prevX = this.position.x;
    const prevZ = this.position.z;
    const alpha = 1 - Math.exp(-14 * dt);
    this.position.x += (tx - this.position.x) * alpha;
    this.position.z += (tz - this.position.z) * alpha;
    this.velocity.x = this._net.vx;
    this.velocity.z = this._net.vz;
    this.position.y = this._net.y;
    this._rollByDelta(this.position.x - prevX, this.position.z - prevZ);
    this.group.position.copy(this.position);
  }

  _rollByDelta(dx, dz) {
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-5 || this.radius < 1e-4) return;
    this._axis.set(-dz, 0, dx).normalize();
    const angle = -dist / this.radius;
    this._quat.setFromAxisAngle(this._axis, angle);
    this.group.quaternion.premultiply(this._quat);
  }

  /** Sink stuck meshes into the core; convert their volume into the ball. */
  _updateMelt(dt) {
    const { meltDuration } = this.game.tuning;
    const duration = Math.max(0.35, meltDuration);

    // Objects stay full-size on the surface until the final stretch, then
    // shrink + sink so they visibly melt away right at meltDuration.
    const MELT_VISUAL_START = 0.8;

    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      const rate = 1 / duration;
      const prev = s.melt;
      s.melt = Math.min(1, s.melt + rate * dt);
      const gained = s.melt - prev;

      if (gained > 0 && s.volumeLeft > 0 && prev < 1) {
        const drain = s.volumeLeft * (gained / (1 - prev));
        this._addVolume(drain);
        s.volumeLeft = Math.max(0, s.volumeLeft - drain);
      }

      // visRemain holds at 1 (visible on surface) then ramps to 0 near the end
      const visRemain =
        s.melt <= MELT_VISUAL_START
          ? 1
          : 1 - (s.melt - MELT_VISUAL_START) / (1 - MELT_VISUAL_START);
      const scaleMul = 0.2 + 0.8 * visRemain;
      s.mesh.scale.set(
        s.baseScale.x * scaleMul,
        s.baseScale.y * scaleMul,
        s.baseScale.z * scaleMul,
      );
      s.mesh.position.copy(s.dir).multiplyScalar(this.radius * (0.25 + 0.7 * visRemain));

      if (s.melt >= 1) {
        if (s.volumeLeft > 0) {
          this._addVolume(s.volumeLeft);
          s.volumeLeft = 0;
        }
        s.mesh.removeFromParent();
        s.mesh.geometry?.dispose?.();
        if (s.mesh.material) {
          if (Array.isArray(s.mesh.material)) s.mesh.material.forEach((m) => m.dispose());
          else s.mesh.material.dispose?.();
        }
        this.stuck.splice(i, 1);
      }
    }

    this._syncScale();
    this.position.y = this.radius;
  }

  /**
   * Lift the ball when a stuck lump rolls onto the floor.
   * Height comes from object size (not ball radius), so bumps stay visible as you grow.
   * Returns 0 when nothing is underfoot → ball settles back down until the next lump.
   */
  _protrusionBump() {
    let bump = 0;
    for (const s of this.stuck) {
      const remain = 1 - s.melt;
      if (remain < 0.1) continue;

      // Outward stick direction in world space after rolling
      this._tmp.copy(s.dir).applyQuaternion(this.group.quaternion);
      const downAlign = Math.max(0, -this._tmp.y); // 1 = directly under the ball
      if (downAlign < 0.15) continue;

      // How far this junk sticks past the shell (scales with object size + unmelted amount)
      const stickHeight = s.size * 0.75 * remain;
      // Sharper when more directly underneath
      const weight = downAlign * downAlign * downAlign;
      bump = Math.max(bump, stickHeight * weight);
    }
    return bump;
  }

  /**
   * Marble Madness–style tilt force, with lumpy-roll scrape from protrusions.
   * @param {number} dt
   * @param {{ x: number, z: number }} wish
   */
  update(dt, wish) {
    this._updateMelt(dt);

    const {
      pushForce,
      rollingFriction,
      airDrag,
      wallBounce,
      scrapeFriction,
      scrapeMassCap = 1.5,
      sizeSpeedGain = 0,
    } = this.game.tuning;
    const protrude = this.protrudingMass;

    if (wish.x !== 0 || wish.z !== 0) {
      // Pusher grows with the ball: flat accel + teeny size bonus (not / core mass)
      const startR = this.game.stage.startRadius;
      const sizeBoost = 1 + Math.max(0, this.radius - startR) * sizeSpeedGain;
      const a = (pushForce * sizeBoost) / Math.max(0.2, this.pushMass);
      this.velocity.x += wish.x * a * dt;
      this.velocity.z += wish.z * a * dt;
    }

    // Per-object scrape, soft-capped — binge scoops must not stack into a crawl
    const rawScrape = this.scrapeMass;
    const scrapeFeel = scrapeMassCap * rawScrape / (scrapeMassCap + rawScrape);
    const friction = rollingFriction + scrapeFeel * scrapeFriction;
    const roll = Math.exp(-friction * dt);
    this.velocity.x *= roll;
    this.velocity.z *= roll;

    let spd = Math.hypot(this.velocity.x, this.velocity.z);
    if (spd > 1e-4) {
      const drag = airDrag * spd;
      this.velocity.x -= (this.velocity.x / spd) * drag * dt;
      this.velocity.z -= (this.velocity.z / spd) * drag * dt;
      spd = Math.hypot(this.velocity.x, this.velocity.z);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const half = this.game.stage.floorSize * 0.5 - this.radius;
    if (this.position.x > half) {
      this.position.x = half;
      this.velocity.x *= -wallBounce;
    } else if (this.position.x < -half) {
      this.position.x = -half;
      this.velocity.x *= -wallBounce;
    }
    if (this.position.z > half) {
      this.position.z = half;
      this.velocity.z *= -wallBounce;
    } else if (this.position.z < -half) {
      this.position.z = -half;
      this.velocity.z *= -wallBounce;
    }

    // Effective rolling radius grows slightly while lumpy (junk pokes the ground)
    const rollRadius = this.radius + protrude * 0.04;
    if (spd > 1e-5) {
      this._axis.set(-this.velocity.z, 0, this.velocity.x).normalize();
      const angle = -(spd * dt) / rollRadius;
      this._quat.setFromAxisAngle(this._axis, angle);
      this.group.quaternion.premultiply(this._quat);
    }

    // Ride up over lumps, then settle back down until the next one
    const targetBump = this._protrusionBump();
    // Snap up onto a lump; fall back down a bit softer so the drop reads clearly
    const bumpRate = targetBump > this._bumpY ? 22 : 16;
    this._bumpY += (targetBump - this._bumpY) * (1 - Math.exp(-bumpRate * dt));
    if (targetBump < 0.001 && this._bumpY < 0.002) this._bumpY = 0;
    this.position.y = this.radius + this._bumpY;

    this.group.position.copy(this.position);
  }

  /**
   * Scoop: stick on the surface. Volume is granted as the object melts inward.
   * @param {THREE.Object3D} mesh
   * @param {object} typeDef
   * @param {{ visualOnly?: boolean }=} opts visualOnly = stickies without size (net guest)
   */
  absorb(mesh, typeDef, opts = {}) {
    this.group.attach(mesh);
    const local = mesh.position;
    if (local.lengthSq() < 1e-6) local.set(0, 1, 0);
    else local.normalize();
    const dir = local.clone();
    local.multiplyScalar(this.radius * 0.95);

    const baseScale = mesh.scale.clone();
    const packing = this.game.tuning.volumePacking ?? 0.45;
    const volumeLeft = opts.visualOnly ? 0 : objectPackedVolume(typeDef.size, packing);

    this.stuck.push({
      mesh,
      mass: typeDef.mass,
      size: typeDef.size,
      melt: 0,
      volumeLeft,
      baseScale,
      dir,
      propId: mesh.userData.propId ?? -1,
      typeId: typeDef.id,
      visualOnly: Boolean(opts.visualOnly),
      packedVolume: opts.visualOnly ? 0 : objectPackedVolume(typeDef.size, packing),
    });

    if (!opts.visualOnly) {
      this.count += 1;
      this.massCollected += typeDef.mass;
    }
  }

  hasAbsorbedProp(propId) {
    if (propId == null || propId < 0) return false;
    return this.stuck.some((s) => s.propId === propId);
  }

  /**
   * Knock loose stickies that are still mostly solid (melt &lt; 50%).
   * Faster impact → more pieces. Flies up to 5× ball radius.
   * @param {number} impact closing speed along collision normal
   * @param {number} awayNx outward X (away from other ball)
   * @param {number} awayNz outward Z
   * @returns {{ typeId: string, propId: number, x: number, z: number, vx: number, vz: number, mesh: THREE.Object3D, typeSize: number }[]}
   */
  scatterOnImpact(impact, awayNx, awayNz) {
    const eligible = [];
    for (let i = 0; i < this.stuck.length; i++) {
      // Still under halfway melted → can scatter; half-melted+ are immune
      if (this.stuck[i].melt < 0.5) eligible.push(i);
    }
    if (eligible.length === 0 || impact < 1.2) return [];

    const strength = Math.min(1, Math.max(0, (impact - 1.2) / 7));
    let count = Math.round(eligible.length * strength);
    if (strength > 0.12 && count < 1) count = 1;
    count = Math.min(count, eligible.length);
    if (count <= 0) return [];

    // Fisher–Yates pick of indices (highest index first when splicing)
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = eligible[i];
      eligible[i] = eligible[j];
      eligible[j] = tmp;
    }
    const pick = eligible.slice(0, count).sort((a, b) => b - a);
    const maxDist = this.radius * 5;
    const out = [];
    const len = Math.hypot(awayNx, awayNz) || 1;
    const basex = awayNx / len;
    const basez = awayNz / len;

    for (const idx of pick) {
      const s = this.stuck[idx];
      const mesh = s.mesh;
      mesh.removeFromParent();
      this.game.scene.add(mesh);
      mesh.scale.copy(s.baseScale);
      mesh.quaternion.identity();

      if (!s.visualOnly && s.packedVolume > 0) {
        const absorbed = Math.max(0, s.packedVolume - s.volumeLeft);
        if (absorbed > 0) this.removeVolume(absorbed);
        this.count = Math.max(0, this.count - 1);
        this.massCollected = Math.max(0, this.massCollected - s.mass);
      }

      const spread = (Math.random() - 0.5) * Math.PI * 0.95;
      const cx = Math.cos(spread);
      const cz = Math.sin(spread);
      const dx = basex * cx - basez * cz;
      const dz = basex * cz + basez * cx;
      const fly = (0.35 + 0.65 * Math.random()) * maxDist * (0.4 + 0.6 * strength);
      const speed = (2.2 + impact * 0.85) * (0.55 + 0.45 * Math.random());
      const x = this.position.x + dx * (this.radius + s.size * 0.5 + 0.15);
      const z = this.position.z + dz * (this.radius + s.size * 0.5 + 0.15);
      mesh.position.set(x, s.size * 0.35, z);
      mesh.userData.alive = true;
      mesh.userData.typeId = s.typeId;
      mesh.userData.size = s.size;

      this.stuck.splice(idx, 1);
      out.push({
        typeId: s.typeId,
        propId: s.propId,
        x,
        z,
        vx: dx * speed,
        vz: dz * speed,
        mesh,
        typeSize: s.size,
      });
    }

    this._syncScale();
    this.position.y = this.radius + this._bumpY;
    this.group.position.copy(this.position);
    return out;
  }

  /** Guest: drop a sticky by propId without touching volume (size comes from net). */
  dropStuckProp(propId) {
    if (propId == null || propId < 0) return null;
    const idx = this.stuck.findIndex((s) => s.propId === propId);
    if (idx < 0) return null;
    const s = this.stuck[idx];
    const mesh = s.mesh;
    mesh.removeFromParent();
    this.stuck.splice(idx, 1);
    return { mesh, typeId: s.typeId, size: s.size };
  }

  /** Advance melt / stuck visuals without motion (remote balls on guest). */
  tickVisuals(dt) {
    this._updateMelt(dt);
    this.position.y = this.radius + this._bumpY;
    this.group.position.y = this.position.y;
  }
}
