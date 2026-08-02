import * as THREE from 'three';

/**
 * Stage-specific floor, lighting, and visual dressing.
 */
export class World {
  /** @param {import('./Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.lights = new THREE.Group();
    this.floor = null;
  }

  init() {
    this.game.scene.add(this.root);
    this.game.scene.add(this.lights);
    this._setupLights();
  }

  buildStage(stage) {
    this._clearRoot();

    const scene = this.game.scene;
    const size = stage.floorSize;
    const theme = this._theme(stage.theme);

    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.sky, size * 0.35, size * 0.9);

    this._createFloor(size, theme);
    this._createRim(size, theme);
    this._createSetDressing(size, stage.theme);
  }

  _setupLights() {
    if (this.lights.children.length > 0) return;
    const hemi = new THREE.HemisphereLight(0xb8e0f0, 0x3d6b4f, 0.85);
    this.lights.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.lights.add(sun);
  }

  _clearRoot() {
    for (const child of this.root.children) {
      child.traverse((obj) => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material?.dispose?.();
      });
    }
    this.root.clear();
  }

  _theme(themeId) {
    const themes = {
      'tide-pool': {
        sky: 0x7eb8d4,
        sandA: [0.86, 0.8, 0.66],
        sandB: [0.78, 0.72, 0.58],
        rim: 0x4a9bb8,
      },
      'coral-reef': {
        sky: 0x63b7d6,
        sandA: [0.92, 0.74, 0.58],
        sandB: [0.78, 0.54, 0.66],
        rim: 0x9b5de5,
      },
      'beach-town': {
        sky: 0x8ecae6,
        sandA: [0.95, 0.88, 0.7],
        sandB: [0.9, 0.8, 0.62],
        rim: 0x219ebc,
      },
      harbor: {
        sky: 0x8aa1b5,
        sandA: [0.48, 0.47, 0.43],
        sandB: [0.36, 0.36, 0.34],
        rim: 0x5c6f7b,
      },
      boardwalk: {
        sky: 0xf4a261,
        sandA: [0.55, 0.42, 0.32],
        sandB: [0.42, 0.32, 0.26],
        rim: 0xe76f51,
      },
    };
    return themes[themeId] ?? themes['tide-pool'];
  }

  _createFloor(size, theme) {
    const floorGeo = new THREE.PlaneGeometry(size, size, 32, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.95,
      metalness: 0,
    });
    // Checker-ish sand via vertex colors
    const colors = [];
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const cell = (Math.floor(x / 4) + Math.floor(y / 4)) & 1;
      colors.push(...(cell ? theme.sandB : theme.sandA));
    }
    floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    floorMat.vertexColors = true;

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    this.floor = floor;
  }

  _createRim(size, theme) {
    // Soft rim of water-colored walls so the arena reads
    const wallH = 1.2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: theme.rim,
      transparent: true,
      opacity: 0.35,
      roughness: 0.4,
    });
    const rim = new THREE.Group();
    const half = size / 2;
    const sides = [
      { w: size, d: 0.4, x: 0, z: -half },
      { w: size, d: 0.4, x: 0, z: half },
      { w: 0.4, d: size, x: -half, z: 0 },
      { w: 0.4, d: size, x: half, z: 0 },
    ];
    for (const s of sides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, wallH, s.d), wallMat);
      m.position.set(s.x, wallH / 2, s.z);
      rim.add(m);
    }
    this.root.add(rim);
  }

  _createSetDressing(size, themeId) {
    if (themeId === 'coral-reef') {
      this._scatterCoral(size);
    } else if (themeId === 'beach-town') {
      this._buildBeachTown(size);
    } else if (themeId === 'harbor') {
      this._buildHarbor(size);
    } else if (themeId === 'boardwalk') {
      this._buildBoardwalk(size);
    } else {
      this._scatterTideRocks(size);
    }
  }

  _scatterTideRocks(size) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x718096, roughness: 0.9 });
    for (let i = 0; i < 22; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 4) * 0.18), mat.clone());
      const a = i * 2.399;
      const r = size * (0.28 + (i % 6) * 0.035);
      rock.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
      rock.scale.y = 0.45 + (i % 3) * 0.18;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.root.add(rock);
    }
  }

  _scatterCoral(size) {
    const colors = [0xff6b8a, 0xff8c69, 0x9b5de5, 0x00bbf9, 0xfee440];
    for (let i = 0; i < 46; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.7,
      });
      const branches = 2 + (i % 4);
      for (let b = 0; b < branches; b++) {
        const h = 0.8 + ((i + b) % 5) * 0.25;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, h, 7), mat);
        branch.position.set((b - branches / 2) * 0.18, h / 2, 0);
        branch.rotation.z = (b - 1) * 0.25;
        branch.castShadow = true;
        group.add(branch);
      }
      const a = i * 2.17;
      const r = size * (0.22 + (i % 10) * 0.028);
      group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.rotation.y = a;
      this.root.add(group);
    }
  }

  _buildHarbor(size) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.85 });
    const rope = new THREE.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.9 });
    for (let i = -3; i <= 3; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 1.1), wood.clone());
      plank.position.set(i * 1.25, 0.12, -size * 0.32);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.root.add(plank);
    }
    for (let i = -4; i <= 4; i += 2) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 10), wood.clone());
      post.position.set(i * 1.4, 1.1, -size * 0.32);
      post.castShadow = true;
      this.root.add(post);
    }
    for (let i = 0; i < 18; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24), rope.clone());
      const a = i * 2.01;
      const r = size * (0.22 + (i % 8) * 0.035);
      coil.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r);
      coil.rotation.x = Math.PI / 2;
      this.root.add(coil);
    }
  }

  _buildBeachTown(size) {
    const canvas = new THREE.MeshStandardMaterial({ color: 0xff8fab, roughness: 0.75 });
    const pole = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
    const towelColors = [0x00bbf9, 0xfee440, 0xff6b6b, 0x9b5de5];
    for (let i = 0; i < 14; i++) {
      const umb = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8), pole);
      stick.position.y = 1.2;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 10, 1, true), canvas.clone());
      shade.position.y = 2.35;
      shade.material.color.setHex(towelColors[i % towelColors.length]);
      umb.add(stick, shade);
      const a = i * 2.45;
      const r = size * (0.24 + (i % 5) * 0.04);
      umb.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.root.add(umb);
    }
    for (let i = 0; i < 20; i++) {
      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.05, 0.7),
        new THREE.MeshStandardMaterial({ color: towelColors[i % towelColors.length], roughness: 0.95 }),
      );
      const a = i * 1.9 + 0.4;
      const r = size * (0.2 + (i % 7) * 0.03);
      towel.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
      towel.rotation.y = a;
      this.root.add(towel);
    }
  }

  _buildBoardwalk(size) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e4f, roughness: 0.88 });
    const neon = [0xff006e, 0x8338ec, 0x3a86ff, 0xffbe0b];
    for (let row = 0; row < 5; row++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(size * 0.55, 0.16, 2.2), wood.clone());
      plank.position.set(0, 0.1, -size * 0.28 + row * 2.4);
      plank.receiveShadow = true;
      plank.castShadow = true;
      this.root.add(plank);
    }
    for (let i = 0; i < 12; i++) {
      const booth = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.4, 2.2),
        new THREE.MeshStandardMaterial({ color: neon[i % neon.length], roughness: 0.55 }),
      );
      const side = i % 2 === 0 ? -1 : 1;
      booth.position.set(side * size * 0.22, 1.2, -size * 0.18 + Math.floor(i / 2) * 3.2);
      booth.castShadow = true;
      this.root.add(booth);
    }
    for (let i = 0; i < 10; i++) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshStandardMaterial({
          color: neon[i % neon.length],
          emissive: neon[i % neon.length],
          emissiveIntensity: 0.55,
          roughness: 0.4,
        }),
      );
      light.position.set((i - 4.5) * 2.2, 3.2, -size * 0.3);
      this.root.add(light);
    }
  }
}
