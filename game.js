/**
 * ============================================================================
 * 3D ENDLESS RUNNER - CYBERDASH
 * Built with Three.js (WebGL), Vanilla JavaScript, HTML5 & CSS3
 * College Mini-Project Implementation
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. GAME CONFIGURATION & CONSTANTS
  // ==========================================================================
  const CONFIG = {
    // Road & Lanes
    LANE_WIDTH: 3.2,
    LANES: [-3.2, 0, 3.2], // 3 Lanes: Left (0), Center (1), Right (2)
    ROAD_LENGTH: 320,
    ROAD_SEGMENT_LENGTH: 45,
    TOTAL_SEGMENTS: 8,

    // Speeds & Physics
    INITIAL_SPEED: 28.0,
    MAX_SPEED: 62.0,
    SPEED_ACCELERATION: 0.35, // Added per 100 distance units
    LANE_SWITCH_SPEED: 14.0,  // Lerp speed
    JUMP_FORCE: 14.5,
    GRAVITY: -40.0,
    SLIDE_DURATION: 0.65,     // Seconds character stays crouched

    // Spawning
    SPAWN_Z_START: -220,
    SPAWN_INTERVAL_MIN: 18,
    SPAWN_INTERVAL_MAX: 32,
    DESPAWN_Z: 25,

    // Scoring
    COIN_SCORE_BONUS: 25,
  };

  // Game States
  const STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
  };

  // Obstacle Types
  const OBSTACLE_TYPE = {
    BARRIER: 'BARRIER', // Low hurdle: MUST jump or change lane
    LASER: 'LASER',     // High laser gate: MUST slide or change lane
    CRATE: 'CRATE',     // Solid shipping crate: MUST change lane
  };

  // ==========================================================================
  // 2. PROCEDURAL SOUND SYSTEM (Pure Web Audio API - Zero External Audio Files)
  // ==========================================================================
  class SoundSystem {
    constructor() {
      this.ctx = null;
      this.isMuted = false;
      this.bgmTimer = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      return this.isMuted;
    }

    playJump() {
      if (this.isMuted || !this.ctx) return;
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.18);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    playSlide() {
      if (this.isMuted || !this.ctx) return;
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    playCoin() {
      if (this.isMuted || !this.ctx) return;
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      // Crisp two-tone chime
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1320, now + 0.08); // E6
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    playCrash() {
      if (this.isMuted || !this.ctx) return;
      this.init();
      const now = this.ctx.currentTime;

      // Noise buffer for impact rumble
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      // Lowpass filter for punchy crash
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.35);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 0.4);
    }
  }

  // ==========================================================================
  // 3. PARTICLE EFFECTS SYSTEM
  // ==========================================================================
  class ParticleSystem {
    constructor(scene) {
      this.scene = scene;
      this.particles = [];

      // Shared geometries and materials for performance
      this.coinGeo = new THREE.SphereGeometry(0.12, 6, 6);
      this.coinMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

      this.crashGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      this.crashMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    }

    spawnCoinSparkle(position) {
      for (let i = 0; i < 10; i++) {
        const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
        mesh.position.copy(position);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 5 + 2,
          (Math.random() - 0.5) * 6
        );
        this.scene.add(mesh);
        this.particles.push({
          mesh,
          velocity,
          life: 0.45,
          maxLife: 0.45,
        });
      }
    }

    spawnCrashExplosion(position) {
      for (let i = 0; i < 24; i++) {
        const mesh = new THREE.Mesh(this.crashGeo, this.crashMat);
        mesh.position.copy(position);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          Math.random() * 8 + 3,
          (Math.random() - 0.5) * 12
        );
        this.scene.add(mesh);
        this.particles.push({
          mesh,
          velocity,
          life: 0.8,
          maxLife: 0.8,
        });
      }
    }

    update(delta) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= delta;

        p.mesh.position.addScaledVector(p.velocity, delta);
        p.velocity.y += CONFIG.GRAVITY * 0.4 * delta;

        // Shrink particle over time
        const scale = Math.max(0, p.life / p.maxLife);
        p.mesh.scale.set(scale, scale, scale);

        if (p.life <= 0) {
          this.scene.remove(p.mesh);
          this.particles.splice(i, 1);
        }
      }
    }

    clear() {
      for (const p of this.particles) {
        this.scene.remove(p.mesh);
      }
      this.particles = [];
    }
  }

  // ==========================================================================
  // 4. 3D PLAYER CHARACTER (Composite Geometry & Smooth Locomotion)
  // ==========================================================================
  class Player {
    constructor(scene) {
      this.scene = scene;
      this.mesh = new THREE.Group();

      // Gameplay Position & Lane
      this.laneIndex = 1; // 0: Left, 1: Center, 2: Right
      this.targetX = CONFIG.LANES[this.laneIndex];
      this.currentX = this.targetX;

      // Jump & Slide State
      this.isJumping = false;
      this.isSliding = false;
      this.verticalVelocity = 0;
      this.slideTimer = 0;

      // Base Heights
      this.groundY = 0.0;
      this.currentY = this.groundY;

      // Animation time
      this.runAnimTime = 0;

      this.buildMesh();
      this.scene.add(this.mesh);
      this.reset();
    }

    buildMesh() {
      // ----------------------------------------------------------------------
      // Subway Surfers / Temple Run Style Street Runner Materials
      // ----------------------------------------------------------------------
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0xf5be9e,
        roughness: 0.65,
        metalness: 0.05,
      });

      const hairMat = new THREE.MeshStandardMaterial({
        color: 0x3d2314,
        roughness: 0.8,
      });

      // Signature Red Streetwear Cap (Subway Surfers Jake Style)
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xd90429,
        roughness: 0.45,
        metalness: 0.1,
      });

      const capBrimMat = new THREE.MeshStandardMaterial({
        color: 0x1f2421,
        roughness: 0.6,
      });

      const capEmblemMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      // Vibrant Streetwear Cyan/Ocean Hoodie
      const hoodieMat = new THREE.MeshStandardMaterial({
        color: 0x0077b6,
        roughness: 0.5,
        metalness: 0.1,
      });

      const hoodieDetailMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
      });

      // Classic Leather Explorer Backpack (Temple Run / Subway Surfers)
      const backpackMat = new THREE.MeshStandardMaterial({
        color: 0x854d0e,
        roughness: 0.7,
        metalness: 0.1,
      });

      const backpackPocketMat = new THREE.MeshStandardMaterial({
        color: 0x713f12,
        roughness: 0.8,
      });

      const goldZipperMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.8,
        roughness: 0.3,
      });

      // DJ Headphones draped around the neck
      const headphoneBandMat = new THREE.MeshStandardMaterial({
        color: 0x1e2430,
        roughness: 0.3,
        metalness: 0.5,
      });

      const headphoneCushionMat = new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x004455,
        roughness: 0.3,
      });

      // Indigo Denim Joggers / Jeans
      const jeansMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.8,
        metalness: 0.05,
      });

      // High-Top Skate Sneakers (White soles, crimson & white body)
      const sneakerSoleMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.3,
      });

      const sneakerBodyMat = new THREE.MeshStandardMaterial({
        color: 0xd90429,
        roughness: 0.5,
      });

      const sneakerToeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
      });

      // Expressive eyes
      const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

      // ----------------------------------------------------------------------
      // Hierarchical Rig Assembly (Facing Forward Down the Highway, 180° Reversed)
      // ----------------------------------------------------------------------
      this.rootGroup = new THREE.Group();
      this.rootGroup.rotation.y = Math.PI;
      this.mesh.add(this.rootGroup);

      // 1. Pelvis / Belt (Waist Anchor)
      this.pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.42), jeansMat);
      this.pelvis.position.y = 0.82;
      this.pelvis.castShadow = true;
      this.rootGroup.add(this.pelvis);

      // Belt Buckle
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), goldZipperMat);
      buckle.position.set(0, 0, 0.22);
      this.pelvis.add(buckle);

      // 2. Torso Group (Pivots at waist for forward lean & natural stride twist)
      this.torsoGroup = new THREE.Group();
      this.torsoGroup.position.set(0, 0.88, 0);
      this.rootGroup.add(this.torsoGroup);

      // Hoodie Body (Athletic taper)
      const torsoGeo = new THREE.BoxGeometry(0.66, 0.62, 0.44);
      this.torsoMesh = new THREE.Mesh(torsoGeo, hoodieMat);
      this.torsoMesh.position.y = 0.31;
      this.torsoMesh.castShadow = true;
      this.torsoGroup.add(this.torsoMesh);

      // White Center Zipper Line
      const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.02), hoodieDetailMat);
      zipper.position.set(0, 0.31, 0.23);
      this.torsoGroup.add(zipper);

      // White Hoodie Drawstrings
      const stringGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6);
      const strLeft = new THREE.Mesh(stringGeo, hoodieDetailMat);
      strLeft.position.set(-0.08, 0.42, 0.24);
      const strRight = new THREE.Mesh(stringGeo, hoodieDetailMat);
      strRight.position.set(0.08, 0.42, 0.24);
      this.torsoGroup.add(strLeft, strRight);

      // Folded Fabric Hood Ring draped behind neck
      const hoodGeo = new THREE.TorusGeometry(0.22, 0.08, 8, 16, Math.PI * 1.2);
      hoodGeo.rotateX(Math.PI / 2.3);
      const hoodRing = new THREE.Mesh(hoodGeo, hoodieMat);
      hoodRing.position.set(0, 0.58, -0.14);
      this.torsoGroup.add(hoodRing);

      // Leather Backpack on Back
      const packGeo = new THREE.BoxGeometry(0.48, 0.54, 0.24);
      const backpack = new THREE.Mesh(packGeo, backpackMat);
      backpack.position.set(0, 0.33, -0.32);
      backpack.castShadow = true;
      this.torsoGroup.add(backpack);

      // Backpack Front Pocket with Brass Pull
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.08), backpackPocketMat);
      pocket.position.set(0, 0.23, -0.47);
      const pocketZip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), goldZipperMat);
      pocketZip.position.set(0, 0.31, -0.52);
      this.torsoGroup.add(pocket, pocketZip);

      // Backpack Straps Wrapping Over Shoulders
      const strapGeo = new THREE.BoxGeometry(0.08, 0.5, 0.03);
      const strapL = new THREE.Mesh(strapGeo, backpackPocketMat);
      strapL.position.set(-0.24, 0.35, 0.23);
      const strapR = new THREE.Mesh(strapGeo, backpackPocketMat);
      strapR.position.set(0.24, 0.35, 0.23);
      this.torsoGroup.add(strapL, strapR);

      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12), skinMat);
      neck.position.y = 0.68;
      this.torsoGroup.add(neck);

      // DJ Headphones draped around neck
      const headphoneBandGeo = new THREE.TorusGeometry(0.24, 0.045, 8, 20, Math.PI * 1.3);
      headphoneBandGeo.rotateX(Math.PI / 2);
      const headphoneBand = new THREE.Mesh(headphoneBandGeo, headphoneBandMat);
      headphoneBand.position.set(0, 0.67, 0.03);
      this.torsoGroup.add(headphoneBand);

      // Headphone Earcups
      const earcupGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.07, 12);
      earcupGeo.rotateZ(Math.PI / 2);
      const cupL = new THREE.Mesh(earcupGeo, headphoneCushionMat);
      cupL.position.set(-0.25, 0.68, 0.05);
      const cupR = new THREE.Mesh(earcupGeo, headphoneCushionMat);
      cupR.position.set(0.25, 0.68, 0.05);
      this.torsoGroup.add(cupL, cupR);

      // 3. Head Group (Pivots for looking ahead)
      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 0.82, 0);
      this.torsoGroup.add(this.headGroup);

      // Head Sphere
      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 20), skinMat);
      headMesh.position.y = 0.12;
      headMesh.castShadow = true;
      this.headGroup.add(headMesh);

      // Stylized Ears
      const earGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const earL = new THREE.Mesh(earGeo, skinMat);
      earL.position.set(-0.26, 0.12, 0);
      const earR = new THREE.Mesh(earGeo, skinMat);
      earR.position.set(0.26, 0.12, 0);
      this.headGroup.add(earL, earR);

      // Hair Tuft Peeking Under Cap
      const hairGeo = new THREE.BoxGeometry(0.32, 0.1, 0.12);
      const hairTuft = new THREE.Mesh(hairGeo, hairMat);
      hairTuft.position.set(0, 0.28, 0.18);
      this.headGroup.add(hairTuft);

      // Expressive Eyes (Looking forward into the sprint)
      const eyeWhiteGeo = new THREE.SphereGeometry(0.055, 10, 10);
      const eyePupilGeo = new THREE.SphereGeometry(0.032, 10, 10);

      const eyeWL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      eyeWL.position.set(-0.09, 0.13, 0.22);
      const eyeWR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      eyeWR.position.set(0.09, 0.13, 0.22);

      const eyePL = new THREE.Mesh(eyePupilGeo, eyePupilMat);
      eyePL.position.set(-0.09, 0.13, 0.26);
      const eyePR = new THREE.Mesh(eyePupilGeo, eyePupilMat);
      eyePR.position.set(0.09, 0.13, 0.26);

      this.headGroup.add(eyeWL, eyeWR, eyePL, eyePR);

      // Backward Baseball Cap (Subway Surfers signature style!)
      const capDomeGeo = new THREE.SphereGeometry(0.265, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
      const capDome = new THREE.Mesh(capDomeGeo, capMat);
      capDome.position.set(0, 0.15, -0.02);
      this.headGroup.add(capDome);

      // Cap Button on Top
      const capButton = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), capEmblemMat);
      capButton.position.set(0, 0.42, -0.02);
      this.headGroup.add(capButton);

      // Cap Front Emblem / Logo
      const capEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), capEmblemMat);
      capEmblem.position.set(0, 0.32, 0.24);
      this.headGroup.add(capEmblem);

      // Curved Cap Brim / Visor Pointing Backward and Slightly Tilted Up
      const brimGeo = new THREE.BoxGeometry(0.34, 0.035, 0.26);
      const capBrim = new THREE.Mesh(brimGeo, capBrimMat);
      capBrim.position.set(0, 0.16, -0.26);
      capBrim.rotation.x = -0.22; // Signature street runner angle
      this.headGroup.add(capBrim);

      // 4. Articulated Left Arm (Shoulder -> Upper Arm -> Elbow -> Forearm -> Fist)
      this.leftArmGroup = new THREE.Group();
      this.leftArmGroup.position.set(-0.46, 0.54, 0);
      this.torsoGroup.add(this.leftArmGroup);

      const upperArmGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.32, 10);
      upperArmGeo.translate(0, -0.16, 0);
      const upperArmL = new THREE.Mesh(upperArmGeo, hoodieMat);
      upperArmL.castShadow = true;
      this.leftArmGroup.add(upperArmL);

      this.leftForearmGroup = new THREE.Group();
      this.leftForearmGroup.position.set(0, -0.32, 0);
      this.leftArmGroup.add(this.leftForearmGroup);

      const forearmGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.28, 10);
      forearmGeo.translate(0, -0.14, 0);
      const forearmL = new THREE.Mesh(forearmGeo, skinMat);
      this.leftForearmGroup.add(forearmL);

      // Wristband
      const wristbandL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10), capMat);
      wristbandL.position.y = -0.24;
      this.leftForearmGroup.add(wristbandL);

      // Clenched Fist
      const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
      fistL.position.y = -0.32;
      this.leftForearmGroup.add(fistL);

      // 5. Articulated Right Arm
      this.rightArmGroup = new THREE.Group();
      this.rightArmGroup.position.set(0.46, 0.54, 0);
      this.torsoGroup.add(this.rightArmGroup);

      const upperArmR = new THREE.Mesh(upperArmGeo, hoodieMat);
      upperArmR.castShadow = true;
      this.rightArmGroup.add(upperArmR);

      this.rightForearmGroup = new THREE.Group();
      this.rightForearmGroup.position.set(0, -0.32, 0);
      this.rightArmGroup.add(this.rightForearmGroup);

      const forearmR = new THREE.Mesh(forearmGeo, skinMat);
      this.rightForearmGroup.add(forearmR);

      // Wristband
      const wristbandR = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10), capMat);
      wristbandR.position.y = -0.24;
      this.rightForearmGroup.add(wristbandR);

      // Clenched Fist
      const fistR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
      fistR.position.y = -0.32;
      this.rightForearmGroup.add(fistR);

      // 6. Articulated Left Leg (Hip -> Thigh -> Knee -> Calf -> Sneaker)
      this.leftThighGroup = new THREE.Group();
      this.leftThighGroup.position.set(-0.20, 0.80, 0);
      this.rootGroup.add(this.leftThighGroup);

      const thighGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.38, 10);
      thighGeo.translate(0, -0.19, 0);
      const thighL = new THREE.Mesh(thighGeo, jeansMat);
      thighL.castShadow = true;
      this.leftThighGroup.add(thighL);

      this.leftCalfGroup = new THREE.Group();
      this.leftCalfGroup.position.set(0, -0.38, 0);
      this.leftThighGroup.add(this.leftCalfGroup);

      const calfGeo = new THREE.CylinderGeometry(0.095, 0.085, 0.34, 10);
      calfGeo.translate(0, -0.17, 0);
      const calfL = new THREE.Mesh(calfGeo, jeansMat);
      calfL.castShadow = true;
      this.leftCalfGroup.add(calfL);

      // High-Top Skate Sneaker (Left)
      this.leftSneaker = this.createSkateSneaker(sneakerSoleMat, sneakerBodyMat, sneakerToeMat);
      this.leftSneaker.position.set(0, -0.34, 0.04);
      this.leftCalfGroup.add(this.leftSneaker);

      // 7. Articulated Right Leg
      this.rightThighGroup = new THREE.Group();
      this.rightThighGroup.position.set(0.20, 0.80, 0);
      this.rootGroup.add(this.rightThighGroup);

      const thighR = new THREE.Mesh(thighGeo, jeansMat);
      thighR.castShadow = true;
      this.rightThighGroup.add(thighR);

      this.rightCalfGroup = new THREE.Group();
      this.rightCalfGroup.position.set(0, -0.38, 0);
      this.rightThighGroup.add(this.rightCalfGroup);

      const calfR = new THREE.Mesh(calfGeo, jeansMat);
      calfR.castShadow = true;
      this.rightCalfGroup.add(calfR);

      // High-Top Skate Sneaker (Right)
      this.rightSneaker = this.createSkateSneaker(sneakerSoleMat, sneakerBodyMat, sneakerToeMat);
      this.rightSneaker.position.set(0, -0.34, 0.04);
      this.rightCalfGroup.add(this.rightSneaker);

      // 8. Ground Drop Shadow Blob
      const shadowGeo = new THREE.CircleGeometry(0.72, 18);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
      });
      this.shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
      this.shadowBlob.position.y = 0.04;
      this.scene.add(this.shadowBlob);
    }

    createSkateSneaker(soleMat, bodyMat, toeMat) {
      const shoeGroup = new THREE.Group();

      // White Rubber Sole
      const soleGeo = new THREE.BoxGeometry(0.20, 0.08, 0.44);
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(0, -0.04, 0.04);
      shoeGroup.add(sole);

      // Red Canvas Sneaker Upper Body
      const bodyGeo = new THREE.BoxGeometry(0.19, 0.16, 0.36);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0.06, 0.01);
      body.castShadow = true;
      shoeGroup.add(body);

      // White Toe Box
      const toeGeo = new THREE.BoxGeometry(0.19, 0.10, 0.14);
      const toe = new THREE.Mesh(toeGeo, toeMat);
      toe.position.set(0, 0.03, 0.17);
      shoeGroup.add(toe);

      return shoeGroup;
    }

    moveLeft() {
      if (this.laneIndex > 0) {
        this.laneIndex--;
        this.targetX = CONFIG.LANES[this.laneIndex];
      }
    }

    moveRight() {
      if (this.laneIndex < CONFIG.LANES.length - 1) {
        this.laneIndex++;
        this.targetX = CONFIG.LANES[this.laneIndex];
      }
    }

    jump(soundSystem) {
      if (!this.isJumping) {
        this.isJumping = true;
        this.verticalVelocity = CONFIG.JUMP_FORCE;
        this.isSliding = false;
        this.slideTimer = 0;
        soundSystem.playJump();
      }
    }

    slide(soundSystem) {
      if (!this.isSliding) {
        this.isSliding = true;
        this.slideTimer = CONFIG.SLIDE_DURATION;
        soundSystem.playSlide();

        if (this.isJumping && this.verticalVelocity > 0) {
          this.verticalVelocity = -8;
        }
      }
    }

    update(delta, currentSpeed) {
      // 1. Horizontal Lane Smooth Interpolation (Lerp)
      this.currentX += (this.targetX - this.currentX) * (CONFIG.LANE_SWITCH_SPEED * delta);
      this.mesh.position.x = this.currentX;

      // Dynamic Banking & Torso Lean when changing lanes
      const laneDelta = this.targetX - this.currentX;
      this.rootGroup.rotation.z = laneDelta * 0.18;
      this.rootGroup.rotation.y = Math.PI + laneDelta * 0.14;

      // 2. Vertical Jump Physics
      if (this.isJumping) {
        this.verticalVelocity += CONFIG.GRAVITY * delta;
        this.currentY += this.verticalVelocity * delta;

        if (this.currentY <= this.groundY) {
          this.currentY = this.groundY;
          this.isJumping = false;
          this.verticalVelocity = 0;
        }
      } else {
        this.currentY = this.groundY;
      }
      this.mesh.position.y = this.currentY;

      // 3. Subway Surfers / Temple Run Animation States
      if (this.isSliding) {
        this.slideTimer -= delta;

        // Drop player down towards asphalt for a dynamic baseball slide
        this.mesh.position.y = this.groundY; // Stay on ground while sliding

        // Torso leans backward
        this.torsoGroup.rotation.x = -0.56;
        this.torsoGroup.rotation.y = 0.15;
        this.torsoGroup.position.y = 0.72;

        // Leading leg (Right) extends forward along the road
        this.rightThighGroup.rotation.x = -1.45;
        this.rightCalfGroup.rotation.x = 0.15;

        // Trailing leg (Left) folds underneath
        this.leftThighGroup.rotation.x = 0.85;
        this.leftCalfGroup.rotation.x = 1.65;

        // Right arm stabilizes behind, Left arm reaches forward
        this.rightArmGroup.rotation.x = 0.85;
        this.rightForearmGroup.rotation.x = -0.4;
        this.leftArmGroup.rotation.x = -0.85;
        this.leftForearmGroup.rotation.x = -0.7;

        if (this.slideTimer <= 0) {
          this.isSliding = false;
        }
      } else if (this.isJumping) {
        // Parkour leap pose (Subway Surfers jump)
        this.torsoGroup.rotation.x = 0.28;
        this.torsoGroup.rotation.y = 0;
        this.torsoGroup.position.y = 0.88;

        // Both knees tuck up towards the chest
        this.leftThighGroup.rotation.x = -0.85;
        this.leftCalfGroup.rotation.x = 1.35;
        this.rightThighGroup.rotation.x = -0.65;
        this.rightCalfGroup.rotation.x = 1.15;

        // Arms reach out and back for aerodynamic balance
        this.leftArmGroup.rotation.x = 0.85;
        this.leftArmGroup.rotation.z = 0.35;
        this.leftForearmGroup.rotation.x = -0.4;

        this.rightArmGroup.rotation.x = 0.85;
        this.rightArmGroup.rotation.z = -0.35;
        this.rightForearmGroup.rotation.x = -0.4;
      } else {
        // 4. Authentic Running Gait Kinematics (Subway Surfers / Temple Run)
        this.runAnimTime += delta * (currentSpeed * 0.48);
        const swing = Math.sin(this.runAnimTime);
        const cosSwing = Math.cos(this.runAnimTime);

        // Athletic Forward Sprint Lean
        this.torsoGroup.rotation.x = 0.20;

        // Dynamic Torso & Shoulder Counter-Rotation
        this.torsoGroup.rotation.y = -swing * 0.16;
        this.torsoGroup.rotation.z = cosSwing * 0.05;

        // Rhythmic Torso & Head Vertical Bounce
        this.torsoGroup.position.y = 0.88 + Math.abs(Math.sin(this.runAnimTime * 2)) * 0.08;

        // Head tracks forward to look down the road
        this.headGroup.rotation.y = swing * 0.12;
        this.headGroup.rotation.x = -0.10;

        // Thigh Kinematics
        this.leftThighGroup.rotation.x = swing * 0.95;
        this.rightThighGroup.rotation.x = -swing * 0.95;

        // Dynamic Knee Flexion (Knee bends backward when leg sweeps back)
        // Left Knee
        if (swing < 0) {
          this.leftCalfGroup.rotation.x = Math.abs(swing) * 1.5 + 0.12;
        } else {
          this.leftCalfGroup.rotation.x = 0.08;
        }

        // Right Knee
        if (swing > 0) {
          this.rightCalfGroup.rotation.x = swing * 1.5 + 0.12;
        } else {
          this.rightCalfGroup.rotation.x = 0.08;
        }

        // Arm Pumping with Elbows Bent at ~80 Degrees
        this.leftArmGroup.rotation.x = -swing * 0.85;
        this.leftArmGroup.rotation.z = 0.14;
        this.leftForearmGroup.rotation.x = -1.15 + swing * 0.25;

        this.rightArmGroup.rotation.x = swing * 0.85;
        this.rightArmGroup.rotation.z = -0.14;
        this.rightForearmGroup.rotation.x = -1.15 - swing * 0.25;
      }

      // 5. Update Ground Shadow Blob
      this.shadowBlob.position.x = this.mesh.position.x;
      this.shadowBlob.position.z = this.mesh.position.z;
      const heightAboveGround = this.currentY - this.groundY;
      const shadowScale = Math.max(0.4, 1.0 - heightAboveGround * 0.25);
      this.shadowBlob.scale.set(shadowScale, shadowScale, shadowScale);
      this.shadowBlob.material.opacity = Math.max(0.15, 0.55 - heightAboveGround * 0.12);
    }

    getHitbox() {
      // Return accurate 3D bounding box for collision detection
      const halfWidth = 0.38;
      const height = this.isSliding ? 0.65 : 1.75;
      const halfDepth = 0.38;

      return {
        minX: this.mesh.position.x - halfWidth,
        maxX: this.mesh.position.x + halfWidth,
        minY: this.mesh.position.y,
        maxY: this.mesh.position.y + height,
        minZ: this.mesh.position.z - halfDepth,
        maxZ: this.mesh.position.z + halfDepth,
      };
    }

    reset() {
      this.laneIndex = 1;
      this.targetX = CONFIG.LANES[1];
      this.currentX = this.targetX;
      this.mesh.position.set(this.currentX, this.groundY, 0);
      this.mesh.rotation.set(0, 0, 0);
      this.rootGroup.rotation.set(0, Math.PI, 0);
      this.torsoGroup.rotation.set(0.20, 0, 0);
      this.torsoGroup.position.set(0, 0.88, 0);
      this.leftThighGroup.rotation.set(0, 0, 0);
      this.rightThighGroup.rotation.set(0, 0, 0);
      this.leftCalfGroup.rotation.set(0, 0, 0);
      this.rightCalfGroup.rotation.set(0, 0, 0);
      this.leftArmGroup.rotation.set(0, 0, 0);
      this.rightArmGroup.rotation.set(0, 0, 0);
      this.leftForearmGroup.rotation.set(-1.15, 0, 0);
      this.rightForearmGroup.rotation.set(-1.15, 0, 0);
      this.isJumping = false;
      this.isSliding = false;
      this.verticalVelocity = 0;
      this.slideTimer = 0;
      this.currentY = this.groundY;
      this.runAnimTime = 0;
      this.shadowBlob.position.set(0, 0.04, 0);
    }
  }

  // ==========================================================================
  // 5. ENDLESS ROAD & SCENERY GENERATOR (Segment Recycling)
  // ==========================================================================
  // ==========================================================================
  // 5. LUSH ADVENTURE JUNGLE & TEMPLE HIGHWAY GENERATOR (Segment Recycling)
  // ==========================================================================
  class RoadManager {
    constructor(scene) {
      this.scene = scene;
      this.segments = [];
      this.roadWidth = CONFIG.LANE_WIDTH * 3 + 2.4; // 3 lanes + shoulders

      this.createMaterials();
      this.initSegments();
    }

    createMaterials() {
      // ----------------------------------------------------------------------
      // Rich Adventurous Materials (Jungle, Ancient Stone & Golden Inlays)
      // ----------------------------------------------------------------------
      this.groundMat = new THREE.MeshStandardMaterial({
        color: 0x14341b,
        roughness: 0.9,
      });

      // Ancient Weathered Stone Flagstone Pavement
      this.trackPavingMat = new THREE.MeshStandardMaterial({
        color: 0x48524b,
        roughness: 0.8,
        metalness: 0.05,
      });

      // Weathered Bronze & Temple Guide Rails
      this.trackBorderMat = new THREE.MeshStandardMaterial({
        color: 0xb48a48,
        metalness: 0.55,
        roughness: 0.35,
      });

      // Glowing Golden Engraved Lane Dividers
      this.laneRunnerMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        emissive: 0x553d00,
        roughness: 0.3,
        metalness: 0.4,
      });

      // Viaduct Arches & Heavy Stone Foundations
      this.viaductPierMat = new THREE.MeshStandardMaterial({
        color: 0x333b35,
        roughness: 0.85,
      });

      // Mossy Stone Balustrades & Railings
      this.stoneRailingMat = new THREE.MeshStandardMaterial({
        color: 0x4a554d,
        roughness: 0.8,
      });

      // Towering Jungle Rock Cliffs
      this.cliffMat = new THREE.MeshStandardMaterial({
        color: 0x242d27,
        roughness: 0.9,
      });

      // Mossy Boulders & River Rocks
      this.mossyBoulderMat = new THREE.MeshStandardMaterial({
        color: 0x37453b,
        roughness: 0.85,
      });

      // Tropical Palm Trees
      this.palmBarkMat = new THREE.MeshStandardMaterial({
        color: 0x4a341d,
        roughness: 0.85,
      });

      this.palmFrondMat = new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        roughness: 0.55,
      });

      this.coconutMat = new THREE.MeshStandardMaterial({
        color: 0x52361d,
        roughness: 0.8,
      });

      // Ancient Banyan & Redwood Forest Giants
      this.banyanBarkMat = new THREE.MeshStandardMaterial({
        color: 0x3d2516,
        roughness: 0.9,
      });

      this.foliageDeepMat = new THREE.MeshStandardMaterial({
        color: 0x14532d,
        roughness: 0.65,
      });

      this.foliageLushMat = new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        roughness: 0.6,
      });

      this.foliageSunlitMat = new THREE.MeshStandardMaterial({
        color: 0x65a30d,
        roughness: 0.55,
      });

      // Exotic Tropical Flowers & Ferns
      this.flowerMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.5,
      });

      this.fernMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        roughness: 0.6,
      });

      // Carved Temple Stone Gate & Ancient Pillars
      this.ancientStoneMat = new THREE.MeshStandardMaterial({
        color: 0x4b564e,
        roughness: 0.75,
        metalness: 0.1,
      });

      // Rope & Timber Suspension Bridge
      this.ropeMat = new THREE.MeshStandardMaterial({
        color: 0x856641,
        roughness: 0.9,
      });

      this.woodPlankMat = new THREE.MeshStandardMaterial({
        color: 0x452b19,
        roughness: 0.85,
      });

      // Flaming Torches & Brass Braziers
      this.torchPoleMat = new THREE.MeshStandardMaterial({
        color: 0x2a1c14,
        roughness: 0.8,
      });

      this.torchFlameMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
      });

      // Hanging Creeping Jungle Vines
      this.hangingVineMat = new THREE.MeshStandardMaterial({
        color: 0x1e5631,
        roughness: 0.7,
      });
    }

    createSegment(zOffset, segmentIndex = 0) {
      const segmentGroup = new THREE.Group();
      segmentGroup.position.z = zOffset;

      const segLen = CONFIG.ROAD_SEGMENT_LENGTH;

      // ----------------------------------------------------------------------
      // 1. Lush Jungle Ground Canopy Below (Canyon floor & mossy earth)
      // ----------------------------------------------------------------------
      const groundGeo = new THREE.PlaneGeometry(160, segLen);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMesh = new THREE.Mesh(groundGeo, this.groundMat);
      groundMesh.position.y = -6.5;
      groundMesh.receiveShadow = true;
      segmentGroup.add(groundMesh);

      // ----------------------------------------------------------------------
      // 2. Elevated Ancient Stone Viaduct Highway (The Track)
      // ----------------------------------------------------------------------
      const trackPavingGeo = new THREE.BoxGeometry(this.roadWidth, 0.6, segLen);
      const trackMesh = new THREE.Mesh(trackPavingGeo, this.trackPavingMat);
      trackMesh.position.y = -0.3;
      trackMesh.receiveShadow = true;
      segmentGroup.add(trackMesh);

      // Massive Stone Arch Viaduct Pillars descending into canyon
      const pierGeo = new THREE.BoxGeometry(this.roadWidth * 0.85, 6.0, 4.0);
      const pier1 = new THREE.Mesh(pierGeo, this.viaductPierMat);
      pier1.position.set(0, -3.3, -segLen / 4);
      const pier2 = new THREE.Mesh(pierGeo, this.viaductPierMat);
      pier2.position.set(0, -3.3, segLen / 4);
      segmentGroup.add(pier1, pier2);

      // ----------------------------------------------------------------------
      // 3. Track Edge Stone Balustrades & Weathered Bronze Rails
      // ----------------------------------------------------------------------
      const railGeo = new THREE.BoxGeometry(0.35, 0.28, segLen);
      const leftRail = new THREE.Mesh(railGeo, this.trackBorderMat);
      leftRail.position.set(-this.roadWidth / 2 + 0.18, 0.14, 0);
      const rightRail = new THREE.Mesh(railGeo, this.trackBorderMat);
      rightRail.position.set(this.roadWidth / 2 - 0.18, 0.14, 0);
      segmentGroup.add(leftRail, rightRail);

      // Balustrade Posts & Flaming Torches along road edges
      const postGeo = new THREE.BoxGeometry(0.45, 0.65, 0.45);
      const postSpacing = 11.25;
      const numPosts = segLen / postSpacing;

      for (let i = 0; i < numPosts; i++) {
        const postZ = -segLen / 2 + i * postSpacing + 5.5;

        // Left & Right posts
        [-1, 1].forEach((side) => {
          const post = new THREE.Mesh(postGeo, this.stoneRailingMat);
          post.position.set(side * (this.roadWidth / 2 - 0.18), 0.32, postZ);
          post.castShadow = true;
          segmentGroup.add(post);

          // Add a burning torch every other post
          if (i % 2 === 0) {
            const torchPole = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8),
              this.torchPoleMat
            );
            torchPole.position.set(side * (this.roadWidth / 2 + 0.15), 0.9, postZ);
            const flame = new THREE.Mesh(
              new THREE.ConeGeometry(0.14, 0.35, 8),
              this.torchFlameMat
            );
            flame.position.set(side * (this.roadWidth / 2 + 0.15), 1.6, postZ);
            segmentGroup.add(torchPole, flame);
          }
        });
      }

      // ----------------------------------------------------------------------
      // 4. Golden Engraved Lane Inlays (Guiding perspective to the horizon)
      // ----------------------------------------------------------------------
      const laneLineGeo = new THREE.PlaneGeometry(0.16, 6);
      laneLineGeo.rotateX(-Math.PI / 2);
      const dashSpacing = 9;
      const numDashes = Math.floor(segLen / dashSpacing);

      // Between Lane 0 & 1, and Lane 1 & 2
      [-CONFIG.LANE_WIDTH / 2, CONFIG.LANE_WIDTH / 2].forEach((laneX) => {
        for (let i = 0; i < numDashes; i++) {
          const dash = new THREE.Mesh(laneLineGeo, this.laneRunnerMat);
          dash.position.set(laneX, 0.02, -segLen / 2 + i * dashSpacing + 4.5);
          segmentGroup.add(dash);
        }
      });

      // ----------------------------------------------------------------------
      // 5. Lush Jungle Scenery, Ancient Rocks & Boulders
      // ----------------------------------------------------------------------
      this.populateJungleScenery(segmentGroup, segLen);

      // ----------------------------------------------------------------------
      // 6. Signature Adventurous Landmark (Arch, Bridge, or Colonnade)
      // ----------------------------------------------------------------------
      const landmarkType = segmentIndex % 3;
      if (landmarkType === 0) {
        this.buildTempleArch(segmentGroup);
      } else if (landmarkType === 1) {
        this.buildSuspensionBridge(segmentGroup);
      } else {
        this.buildOvergrownColonnade(segmentGroup, segLen);
      }

      return segmentGroup;
    }

    populateJungleScenery(segmentGroup, segLen) {
      // Flank both sides of the viaduct with dense, multi-layered jungle life
      [-1, 1].forEach((side) => {
        const sideSign = side;

        // 1. Tropical Palm Trees (leaning gracefully over the jungle canyon)
        for (let i = 0; i < 3; i++) {
          const palm = this.createPalmTree();
          palm.position.set(
            sideSign * (this.roadWidth / 2 + 3.2 + Math.random() * 2.5),
            -2.5 + Math.random() * 1.5,
            -segLen / 2 + i * 14 + 4 + Math.random() * 4
          );
          palm.rotation.y = Math.random() * Math.PI * 2;
          palm.rotation.z = -sideSign * (0.08 + Math.random() * 0.12); // Lean towards track
          segmentGroup.add(palm);
        }

        // 2. Towering Ancient Banyan & Redwood Forest Giants
        for (let i = 0; i < 2; i++) {
          const banyan = this.createBanyanTree();
          banyan.position.set(
            sideSign * (this.roadWidth / 2 + 8.5 + Math.random() * 5.0),
            -3.5,
            -segLen / 2 + i * 20 + 8 + Math.random() * 4
          );
          banyan.rotation.y = Math.random() * Math.PI * 2;
          segmentGroup.add(banyan);
        }

        // 3. Mossy Boulders & Jungle Rock Outcrops
        for (let i = 0; i < 4; i++) {
          const boulder = this.createMossyRock();
          boulder.position.set(
            sideSign * (this.roadWidth / 2 + 1.8 + Math.random() * 3.5),
            -0.8 + Math.random() * 0.6,
            -segLen / 2 + i * 10 + 3 + Math.random() * 4
          );
          boulder.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
          segmentGroup.add(boulder);
        }

        // 4. Tropical Ferns & Hibiscus Flower Clusters
        for (let i = 0; i < 4; i++) {
          const fern = this.createFernCluster();
          fern.position.set(
            sideSign * (this.roadWidth / 2 + 1.2 + Math.random() * 1.8),
            0.1,
            -segLen / 2 + i * 11 + 5 + Math.random() * 3
          );
          segmentGroup.add(fern);
        }

        // 5. Dramatic Stepped Jungle Canyon Cliffs in the Midground
        const cliffGeo = new THREE.BoxGeometry(14, 18 + Math.random() * 8, 18);
        const cliff = new THREE.Mesh(cliffGeo, this.cliffMat);
        cliff.position.set(
          sideSign * (this.roadWidth / 2 + 20 + Math.random() * 4),
          4.0,
          -segLen / 2 + Math.random() * segLen
        );
        cliff.castShadow = true;
        segmentGroup.add(cliff);
      });
    }

    createPalmTree() {
      const palmGroup = new THREE.Group();

      // Curved Segmented Trunk
      const trunkSegments = 5;
      let currY = 0;
      let currX = 0;
      for (let s = 0; s < trunkSegments; s++) {
        const segH = 1.4;
        const radiusTop = 0.22 - s * 0.02;
        const radiusBottom = 0.26 - s * 0.02;
        const trunkMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radiusTop, radiusBottom, segH, 8),
          this.palmBarkMat
        );
        trunkMesh.position.set(currX, currY + segH / 2, 0);
        trunkMesh.rotation.z = -0.06;
        trunkMesh.castShadow = true;
        palmGroup.add(trunkMesh);

        currY += segH * 0.95;
        currX += 0.12;
      }

      // Coconut Cluster at crown
      for (let c = 0; c < 3; c++) {
        const coconut = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          this.coconutMat
        );
        const ang = (c / 3) * Math.PI * 2;
        coconut.position.set(currX + Math.cos(ang) * 0.25, currY - 0.1, Math.sin(ang) * 0.25);
        palmGroup.add(coconut);
      }

      // Crown of Drooping Tropical Palm Fronds
      const numFronds = 8;
      for (let f = 0; f < numFronds; f++) {
        const angle = (f / numFronds) * Math.PI * 2;
        const frondGroup = new THREE.Group();
        frondGroup.position.set(currX, currY, 0);
        frondGroup.rotation.y = angle;

        // Curved palm leaf frond
        const frondGeo = new THREE.BoxGeometry(0.35, 0.04, 2.4);
        frondGeo.translate(0, 0, 1.2);
        const frondMesh = new THREE.Mesh(frondGeo, this.palmFrondMat);
        frondMesh.rotation.x = 0.45; // Droop down
        frondMesh.castShadow = true;
        frondGroup.add(frondMesh);

        palmGroup.add(frondGroup);
      }

      return palmGroup;
    }

    createBanyanTree() {
      const treeGroup = new THREE.Group();

      // Massive Gnarled Trunk with Buttress Roots
      const trunkH = 8.0;
      const trunkMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.6, trunkH, 10),
        this.banyanBarkMat
      );
      trunkMesh.position.y = trunkH / 2;
      trunkMesh.castShadow = true;
      treeGroup.add(trunkMesh);

      // Sprawling Buttress Roots at Base
      for (let r = 0; r < 4; r++) {
        const angle = (r / 4) * Math.PI * 2;
        const root = new THREE.Mesh(
          new THREE.ConeGeometry(0.65, 3.2, 6),
          this.banyanBarkMat
        );
        root.position.set(Math.cos(angle) * 1.5, 1.4, Math.sin(angle) * 1.5);
        root.rotation.x = Math.sin(angle) * 0.4;
        root.rotation.z = Math.cos(angle) * 0.4;
        treeGroup.add(root);
      }

      // Multi-Tiered Dense Canopy Foliage Clusters (Temple Run giant jungle canopies)
      const foliageMats = [this.foliageDeepMat, this.foliageLushMat, this.foliageSunlitMat];
      const foliageOffsets = [
        { x: 0, y: trunkH + 1.5, z: 0, s: 3.8, mat: 1 },
        { x: -1.6, y: trunkH + 0.5, z: 1.2, s: 2.8, mat: 0 },
        { x: 1.8, y: trunkH + 0.8, z: -1.0, s: 3.1, mat: 2 },
        { x: 0.8, y: trunkH + 2.2, z: 1.6, s: 2.6, mat: 1 },
        { x: -1.4, y: trunkH + 1.8, z: -1.4, s: 2.4, mat: 0 },
      ];

      for (const fo of foliageOffsets) {
        const folSphere = new THREE.Mesh(
          new THREE.DodecahedronGeometry(fo.s, 1),
          foliageMats[fo.mat]
        );
        folSphere.position.set(fo.x, fo.y, fo.z);
        folSphere.castShadow = true;
        treeGroup.add(folSphere);
      }

      return treeGroup;
    }

    createMossyRock() {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.0 + Math.random() * 0.8, 1),
        this.mossyBoulderMat
      );
      rock.scale.set(1.0 + Math.random() * 0.4, 0.7 + Math.random() * 0.5, 1.2 + Math.random() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      return rock;
    }

    createFernCluster() {
      const fernGroup = new THREE.Group();

      // Radial Arching Fern Fronds
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 1.2, 5),
          this.fernMat
        );
        frond.position.set(Math.cos(angle) * 0.4, 0.35, Math.sin(angle) * 0.4);
        frond.rotation.z = Math.cos(angle) * 0.6;
        frond.rotation.x = Math.sin(angle) * 0.6;
        fernGroup.add(frond);
      }

      // Exotic Tropical Flower in Center
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 6),
        this.flowerMat
      );
      flower.position.y = 0.5;
      fernGroup.add(flower);

      return fernGroup;
    }

    buildTempleArch(segmentGroup) {
      // ----------------------------------------------------------------------
      // Monumental Ancient Temple Arch (Overarching across all 3 lanes)
      // ----------------------------------------------------------------------
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 0, 0);

      const archClearanceY = 5.2; // High clearance: player never collides!
      const archSpan = this.roadWidth + 3.2;

      // Left Pillar
      const leftPillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, archClearanceY + 1.5, 1.6),
        this.ancientStoneMat
      );
      leftPillar.position.set(-archSpan / 2, (archClearanceY + 1.5) / 2, 0);
      leftPillar.castShadow = true;
      archGroup.add(leftPillar);

      // Right Pillar
      const rightPillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, archClearanceY + 1.5, 1.6),
        this.ancientStoneMat
      );
      rightPillar.position.set(archSpan / 2, (archClearanceY + 1.5) / 2, 0);
      rightPillar.castShadow = true;
      archGroup.add(rightPillar);

      // Carved Capital Blocks
      const capGeo = new THREE.BoxGeometry(2.1, 0.45, 2.1);
      const capL = new THREE.Mesh(capGeo, this.ancientStoneMat);
      capL.position.set(-archSpan / 2, archClearanceY + 0.2, 0);
      const capR = new THREE.Mesh(capGeo, this.ancientStoneMat);
      capR.position.set(archSpan / 2, archClearanceY + 0.2, 0);
      archGroup.add(capL, capR);

      // Massive Arch Header Beam spanning over track
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(archSpan + 2.0, 1.1, 1.8),
        this.ancientStoneMat
      );
      header.position.set(0, archClearanceY + 0.9, 0);
      header.castShadow = true;
      archGroup.add(header);

      // Ornate Carved Temple Crest on Top
      const crest = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 1.2, 4),
        this.ancientStoneMat
      );
      crest.position.set(0, archClearanceY + 2.0, 0);
      crest.rotation.y = Math.PI / 4;
      archGroup.add(crest);

      // Hanging Creeping Vines Draping Down from Arch Header
      for (let v = 0; v < 5; v++) {
        const vineH = 1.4 + Math.random() * 1.2;
        const vine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.05, vineH, 6),
          this.hangingVineMat
        );
        const vineX = -this.roadWidth / 2 + 1.2 + v * (this.roadWidth / 4);
        vine.position.set(vineX, archClearanceY + 0.3 - vineH / 2, 0.8);
        archGroup.add(vine);
      }

      // Two Golden Flaming Braziers on the Pillars
      [-archSpan / 2, archSpan / 2].forEach((px) => {
        const brazier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.2, 0.4, 8),
          this.trackBorderMat
        );
        brazier.position.set(px, 2.6, 1.0);
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.5, 8),
          this.torchFlameMat
        );
        flame.position.set(px, 3.0, 1.0);
        archGroup.add(brazier, flame);
      });

      segmentGroup.add(archGroup);
    }

    buildSuspensionBridge(segmentGroup) {
      // ----------------------------------------------------------------------
      // Jungle Rope Suspension Footbridge Crossing High Overhead
      // ----------------------------------------------------------------------
      const bridgeGroup = new THREE.Group();
      const bridgeY = 7.5; // Far above track
      const bridgeSpan = this.roadWidth + 8;

      // Heavy Side Cliff Towers supporting bridge
      [-bridgeSpan / 2, bridgeSpan / 2].forEach((tx) => {
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, bridgeY + 2, 2.0),
          this.woodPlankMat
        );
        tower.position.set(tx, (bridgeY + 2) / 2, 0);
        tower.castShadow = true;
        bridgeGroup.add(tower);
      });

      // Suspended Wooden Footbridge Deck
      const numPlanks = 14;
      for (let p = 0; p < numPlanks; p++) {
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(bridgeSpan / numPlanks + 0.1, 0.12, 1.6),
          this.woodPlankMat
        );
        const px = -bridgeSpan / 2 + p * (bridgeSpan / numPlanks) + 0.5;
        // Natural rope catenary sag curve
        const sag = Math.sin((p / (numPlanks - 1)) * Math.PI) * 0.7;
        plank.position.set(px, bridgeY - sag, 0);
        bridgeGroup.add(plank);
      }

      // Handrail Ropes
      [-0.8, 0.8].forEach((rz) => {
        const rope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, bridgeSpan, 8),
          this.ropeMat
        );
        rope.rotateZ(Math.PI / 2);
        rope.position.set(0, bridgeY + 0.8, rz);
        bridgeGroup.add(rope);
      });

      segmentGroup.add(bridgeGroup);
    }

    buildOvergrownColonnade(segmentGroup, segLen) {
      // ----------------------------------------------------------------------
      // Ancient Ruin Overgrown Colonnade / Open Aqueduct Canopy
      // ----------------------------------------------------------------------
      const colGroup = new THREE.Group();
      const colY = 6.2;
      const colSpan = this.roadWidth + 2.4;

      // Series of 3 Elegant Stone Gate Openings along the segment
      for (let c = 0; c < 2; c++) {
        const cz = -segLen / 4 + c * (segLen / 2);

        // Flanking carved square columns
        [-colSpan / 2, colSpan / 2].forEach((cx) => {
          const col = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, colY, 1.2),
            this.ancientStoneMat
          );
          col.position.set(cx, colY / 2, cz);
          col.castShadow = true;
          colGroup.add(col);
        });

        // Overhead Stone Crossbeam
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(colSpan + 1.8, 0.75, 1.4),
          this.ancientStoneMat
        );
        beam.position.set(0, colY + 0.35, cz);
        beam.castShadow = true;
        colGroup.add(beam);

        // Hanging Ivy Foliage Tufts
        for (let v = 0; v < 3; v++) {
          const ivy = new THREE.Mesh(
            new THREE.ConeGeometry(0.35, 1.4, 6),
            this.hangingVineMat
          );
          ivy.position.set(-colSpan / 4 + v * (colSpan / 4), colY - 0.5, cz + 0.6);
          ivy.rotation.x = Math.PI;
          colGroup.add(ivy);
        }
      }

      segmentGroup.add(colGroup);
    }

    initSegments() {
      // Place segments seamlessly from behind the camera to the far horizon
      for (let i = 0; i < CONFIG.TOTAL_SEGMENTS; i++) {
        const z = 20 - i * CONFIG.ROAD_SEGMENT_LENGTH;
        const seg = this.createSegment(z, i);
        this.scene.add(seg);
        this.segments.push(seg);
      }
    }

    update(delta, speed) {
      const moveDistance = speed * delta;

      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i];
        seg.position.z += moveDistance;

        // When a segment passes far behind camera, loop it to the front
        if (seg.position.z > 35) {
          let minZ = 0;
          for (let j = 0; j < this.segments.length; j++) {
            if (this.segments[j].position.z < minZ) {
              minZ = this.segments[j].position.z;
            }
          }
          seg.position.z = minZ - CONFIG.ROAD_SEGMENT_LENGTH + 0.1; // 0.1 overlap prevents seams
        }
      }
    }

    reset() {
      for (let i = 0; i < this.segments.length; i++) {
        this.segments[i].position.z = 20 - i * CONFIG.ROAD_SEGMENT_LENGTH;
      }
    }
  }

  // ==========================================================================
  // 6. OBSTACLE MANAGER (Fair 3-Lane Spawner & Collisions)
  // ==========================================================================
  class ObstacleManager {
    constructor(scene) {
      this.scene = scene;
      this.obstacles = [];
      this.nextSpawnZ = -50;

      this.createMaterials();
    }

    createMaterials() {
      // Weathered Timber & Gold Tribal Hazard Barrier
      this.barrierMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.65,
        metalness: 0.1,
      });
      this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

      // Ancient Stone Arch Frame with Glowing Mystical Energy Beam
      this.gateFrameMat = new THREE.MeshStandardMaterial({
        color: 0x3d4740,
        roughness: 0.8,
        metalness: 0.1,
      });
      this.laserBeamMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });

      // Heavy Expedition Cargo Crate with Iron Reinforcement Bands
      this.crateMat = new THREE.MeshStandardMaterial({
        color: 0x854d0e,
        roughness: 0.75,
        metalness: 0.15,
      });
    }

    createBarrierMesh() {
      // Low barrier: jumpable (height ~1.1m)
      const group = new THREE.Group();

      // Horizontal Bar
      const barGeo = new THREE.BoxGeometry(2.4, 0.45, 0.3);
      const bar = new THREE.Mesh(barGeo, this.barrierMat);
      bar.position.y = 0.8;
      bar.castShadow = true;
      group.add(bar);

      // Warning stripes
      const stripeGeo = new THREE.BoxGeometry(0.35, 0.46, 0.32);
      const s1 = new THREE.Mesh(stripeGeo, this.stripeMat);
      s1.position.set(-0.6, 0.8, 0);
      const s2 = new THREE.Mesh(stripeGeo, this.stripeMat);
      s2.position.set(0.6, 0.8, 0);
      group.add(s1, s2);

      // Legs / Stands
      const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0);
      const l1 = new THREE.Mesh(legGeo, this.barrierMat);
      l1.position.set(-0.95, 0.5, 0);
      const l2 = new THREE.Mesh(legGeo, this.barrierMat);
      l2.position.set(0.95, 0.5, 0);
      group.add(l1, l2);

      return group;
    }

    createLaserMesh() {
      // High laser arch: slidable underneath (clearance under beam is ~1.5m)
      const group = new THREE.Group();

      // Vertical Support Pillars
      const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2);
      const p1 = new THREE.Mesh(pillarGeo, this.gateFrameMat);
      p1.position.set(-1.15, 1.6, 0);
      const p2 = new THREE.Mesh(pillarGeo, this.gateFrameMat);
      p2.position.set(1.15, 1.6, 0);
      group.add(p1, p2);

      // Top Crossbar
      const topGeo = new THREE.BoxGeometry(2.4, 0.25, 0.25);
      const topBar = new THREE.Mesh(topGeo, this.gateFrameMat);
      topBar.position.set(0, 3.1, 0);
      group.add(topBar);

      // Glowing Cyan Laser Beam (at height 1.85m -> player must slide under!)
      const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.3, 12);
      beamGeo.rotateZ(Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, this.laserBeamMat);
      beam.position.set(0, 1.85, 0);
      group.add(beam);

      return group;
    }

    createCrateMesh() {
      // Triple-stacked crate tower: tall wall that cannot be jumped over or slid under!
      // Total height ~3.3m — player MUST dodge to another lane.
      const group = new THREE.Group();

      // Vibrant yellow/amber crate material
      const yellowMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.7,
        metalness: 0.15,
      });
      const darkFrameMat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.8,
        metalness: 0.3,
      });

      const BOX_W = 2.1;
      const BOX_H = 1.1; // Each box is 1.1m tall → 3 boxes = 3.3m total
      const BOX_D = 2.1;

      for (let i = 0; i < 3; i++) {
        const centerY = BOX_H * 0.5 + i * BOX_H; // 0.55, 1.65, 2.75

        // Main yellow box body
        const boxGeo = new THREE.BoxGeometry(BOX_W, BOX_H - 0.04, BOX_D);
        const box = new THREE.Mesh(boxGeo, yellowMat);
        box.position.y = centerY;
        box.castShadow = true;
        group.add(box);

        // Dark metal corner/edge band at the joint between boxes
        const bandGeo = new THREE.BoxGeometry(BOX_W + 0.05, 0.12, BOX_D + 0.05);
        const topBand = new THREE.Mesh(bandGeo, darkFrameMat);
        topBand.position.y = centerY + BOX_H * 0.5 - 0.06;
        group.add(topBand);

        const botBand = new THREE.Mesh(bandGeo, darkFrameMat);
        botBand.position.y = centerY - BOX_H * 0.5 + 0.06;
        group.add(botBand);

        // Vertical corner posts on each box
        const postGeo = new THREE.BoxGeometry(0.12, BOX_H, 0.12);
        const corners = [
          [-BOX_W * 0.5 + 0.06, centerY, -BOX_D * 0.5 + 0.06],
          [BOX_W * 0.5 - 0.06, centerY, -BOX_D * 0.5 + 0.06],
          [-BOX_W * 0.5 + 0.06, centerY, BOX_D * 0.5 - 0.06],
          [BOX_W * 0.5 - 0.06, centerY, BOX_D * 0.5 - 0.06],
        ];
        for (const [cx, cy, cz] of corners) {
          const post = new THREE.Mesh(postGeo, darkFrameMat);
          post.position.set(cx, cy, cz);
          group.add(post);
        }
      }

      return group;
    }

    spawnRow(z) {
      // FAIR SPAWNING LOGIC:
      // Randomly pick 1 or 2 lanes out of 3.
      // NEVER block all 3 lanes, guaranteeing a valid escape path at all times!
      const availableLanes = [0, 1, 2];
      const count = Math.random() < 0.65 ? 1 : 2; // 65% chance of 1 obstacle, 35% chance of 2

      // Shuffle available lanes
      for (let i = availableLanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableLanes[i], availableLanes[j]] = [availableLanes[j], availableLanes[i]];
      }

      for (let i = 0; i < count; i++) {
        const lane = availableLanes[i];
        const laneX = CONFIG.LANES[lane];

        // Pick obstacle type
        const rand = Math.random();
        let type, mesh, hitboxYMin, hitboxYMax, halfWidth, halfDepth;

        if (rand < 0.45) {
          type = OBSTACLE_TYPE.BARRIER;
          mesh = this.createBarrierMesh();
          hitboxYMin = 0.0;
          hitboxYMax = 1.15; // Low barrier -> clear if player Y > 1.15
          halfWidth = 1.15;
          halfDepth = 0.3;
        } else if (rand < 0.75) {
          type = OBSTACLE_TYPE.LASER;
          mesh = this.createLaserMesh();
          hitboxYMin = 1.45; // High beam -> clear if player is sliding!
          hitboxYMax = 2.4;
          halfWidth = 1.15;
          halfDepth = 0.25;
        } else {
          type = OBSTACLE_TYPE.CRATE;
          mesh = this.createCrateMesh();
          hitboxYMin = 0.0;
          hitboxYMax = 3.3; // Triple-stacked tower — impossible to jump over; must dodge lane!
          halfWidth = 1.05;
          halfDepth = 1.05;
        }

        mesh.position.set(laneX, 0, z);
        this.scene.add(mesh);

        this.obstacles.push({
          mesh,
          type,
          lane,
          x: laneX,
          hitboxYMin,
          hitboxYMax,
          halfWidth,
          halfDepth,
        });
      }
    }

    update(delta, speed) {
      const moveDistance = speed * delta;

      // Move existing obstacles toward player
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.mesh.position.z += moveDistance;

        // Despawn once well behind camera
        if (obs.mesh.position.z > CONFIG.DESPAWN_Z) {
          this.scene.remove(obs.mesh);
          this.obstacles.splice(i, 1);
        }
      }

      // Spawn ahead at continuous intervals
      this.nextSpawnZ += moveDistance;
      if (this.nextSpawnZ > -CONFIG.ROAD_LENGTH) {
        const interval =
          CONFIG.SPAWN_INTERVAL_MIN +
          Math.random() * (CONFIG.SPAWN_INTERVAL_MAX - CONFIG.SPAWN_INTERVAL_MIN);
        this.nextSpawnZ -= interval;
        this.spawnRow(this.nextSpawnZ);
      }
    }

    checkCollision(playerHitbox, isSliding) {
      for (let i = 0; i < this.obstacles.length; i++) {
        const obs = this.obstacles[i];
        const oz = obs.mesh.position.z;

        // Fast Z-axis prune (only check if close to player)
        if (oz < -3 || oz > 3) continue;

        const obsMinX = obs.x - obs.halfWidth;
        const obsMaxX = obs.x + obs.halfWidth;
        const obsMinZ = oz - obs.halfDepth;
        const obsMaxZ = oz + obs.halfDepth;

        // Check AABB 3D overlap
        const xOverlap = playerHitbox.minX < obsMaxX && playerHitbox.maxX > obsMinX;
        const zOverlap = playerHitbox.minZ < obsMaxZ && playerHitbox.maxZ > obsMinZ;

        if (xOverlap && zOverlap) {
          // Specific vertical checks based on obstacle type:
          if (obs.type === OBSTACLE_TYPE.BARRIER) {
            // Player clears barrier if jumped above barrier top
            if (playerHitbox.minY >= obs.hitboxYMax - 0.15) {
              continue; // Jumped over successfully!
            }
            return { collided: true, position: obs.mesh.position };
          } else if (obs.type === OBSTACLE_TYPE.LASER) {
            // Laser beam is elevated: safe if sliding, or if jumped entirely above beam top
            if (isSliding && playerHitbox.maxY <= obs.hitboxYMin + 0.1) {
              continue; // Slid safely under the beam!
            }
            return { collided: true, position: obs.mesh.position };
          } else {
            // Crate: unavoidable in same lane
            return { collided: true, position: obs.mesh.position };
          }
        }
      }

      return { collided: false };
    }

    clear() {
      for (const obs of this.obstacles) {
        this.scene.remove(obs.mesh);
      }
      this.obstacles = [];
      this.nextSpawnZ = -50;
    }
  }

  // ==========================================================================
  // 7. COIN MANAGER (Animated Golden Collectibles & Sound Trigger)
  // ==========================================================================
  class CoinManager {
    constructor(scene) {
      this.scene = scene;
      this.coins = [];
      this.nextSpawnZ = -40;

      // Shared coin geometry & glowing material
      this.coinGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.14, 18);
      this.coinGeo.rotateZ(Math.PI / 2); // Stand upright facing player

      this.coinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xaa8800,
      });
    }

    spawnCoinPattern(z) {
      // Pick a random lane (or arc)
      const lane = Math.floor(Math.random() * 3);
      const laneX = CONFIG.LANES[lane];

      // Spawn a trail of 3 to 5 coins
      const patternLength = 4;
      const spacing = 3.5;

      for (let i = 0; i < patternLength; i++) {
        const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
        const coinZ = z - i * spacing;

        // Subtle arc height
        const coinY = 0.9 + Math.sin((i / (patternLength - 1)) * Math.PI) * 0.8;
        mesh.position.set(laneX, coinY, coinZ);

        this.scene.add(mesh);
        this.coins.push({
          mesh,
          x: laneX,
          baseY: coinY,
          collected: false,
        });
      }
    }

    update(delta, speed) {
      const moveDistance = speed * delta;

      // Animate and advance coins
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        c.mesh.position.z += moveDistance;

        // Continuous spinning animation
        c.mesh.rotation.y += delta * 4.5;
        // Gentle bobbing
        c.mesh.position.y = c.baseY + Math.sin(Date.now() * 0.006 + c.x) * 0.12;

        // Despawn once behind camera
        if (c.mesh.position.z > CONFIG.DESPAWN_Z) {
          this.scene.remove(c.mesh);
          this.coins.splice(i, 1);
        }
      }

      // Periodically spawn coin batches
      this.nextSpawnZ += moveDistance;
      if (this.nextSpawnZ > -CONFIG.ROAD_LENGTH) {
        this.nextSpawnZ -= 22 + Math.random() * 15;
        this.spawnCoinPattern(this.nextSpawnZ);
      }
    }

    checkCollection(playerMesh, onCollectCallback) {
      const px = playerMesh.position.x;
      const py = playerMesh.position.y;
      const pz = playerMesh.position.z;

      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        if (c.collected) continue;

        const cz = c.mesh.position.z;
        if (Math.abs(cz - pz) < 1.3) {
          const dx = px - c.mesh.position.x;
          const dy = py - c.mesh.position.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 1.5) {
            c.collected = true;
            onCollectCallback(c.mesh.position);
            this.scene.remove(c.mesh);
            this.coins.splice(i, 1);
          }
        }
      }
    }

    clear() {
      for (const c of this.coins) {
        this.scene.remove(c.mesh);
      }
      this.coins = [];
      this.nextSpawnZ = -40;
    }
  }

  // ==========================================================================
  // 8. MAIN GAME CONTROLLER & SCENE RENDERER
  // ==========================================================================
  class Game {
    constructor() {
      this.state = STATE.MENU;
      this.clock = new THREE.Clock();

      // Gameplay metrics
      this.score = 0;
      this.coins = 0;
      this.distance = 0;
      this.currentSpeed = CONFIG.INITIAL_SPEED;
      this.highScore = parseInt(localStorage.getItem('cyberdash_highscore') || '0', 10);

      // Camera shake
      this.cameraShakeIntensity = 0;

      // Subsystems
      this.sound = new SoundSystem();

      this.initThree();
      this.initSubsystems();
      this.initUI();
      this.initInput();

      // Start main animation loop
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }

    // ------------------------------------------------------------------------
    // Three.js Scene, Camera, Lighting & Renderer Setup
    // ------------------------------------------------------------------------
    initThree() {
      const container = document.getElementById('game-container');
      const width = window.innerWidth;
      const height = window.innerHeight;

      // 1. Scene with Rich Tropical Jungle Atmosphere & Fog
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x184237);
      this.scene.fog = new THREE.FogExp2(0x184237, 0.0052);

      // 2. Perspective Camera (Third-Person Chase Cam)
      this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 950);
      this.cameraBasePos = new THREE.Vector3(0, 4.6, 7.5);
      this.cameraTarget = new THREE.Vector3(0, 1.2, -6);
      this.camera.position.copy(this.cameraBasePos);
      this.camera.lookAt(this.cameraTarget);

      // 3. WebGL Renderer with Soft Shadow Mapping
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(this.renderer.domElement);

      // 4. Realistic Adventurous Lighting Rig (Hemisphere bounce & warm golden sunlight)
      const ambientLight = new THREE.HemisphereLight(0xbbe8ff, 0x14532d, 0.95);
      this.scene.add(ambientLight);

      // Main Directional Sun Light (Warm golden rays casting shadows)
      this.dirLight = new THREE.DirectionalLight(0xfff3db, 1.45);
      this.dirLight.position.set(25, 45, 10);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 5;
      this.dirLight.shadow.camera.far = 160;
      this.dirLight.shadow.camera.left = -22;
      this.dirLight.shadow.camera.right = 22;
      this.dirLight.shadow.camera.top = 22;
      this.dirLight.shadow.camera.bottom = -22;
      this.scene.add(this.dirLight);

      // Golden Sun Rim Light on Foliage & Runner
      const sunRim = new THREE.DirectionalLight(0xfde047, 0.45);
      sunRim.position.set(-25, 20, -40);
      this.scene.add(sunRim);

      // Lush Jungle Green Reflected Fill Light
      const jungleFill = new THREE.DirectionalLight(0x22c55e, 0.35);
      jungleFill.position.set(25, 15, -40);
      this.scene.add(jungleFill);

      // Distant Horizon Mountain Ridges
      this.createDistantMountains();

      // Handle Window Resize
      window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      });
    }

    createDistantMountains() {
      const mountainMat = new THREE.MeshStandardMaterial({
        color: 0x173a2e,
        roughness: 0.95,
      });

      const mountainGroup = new THREE.Group();

      // Flanking mountain ridges on left and right far horizon
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 5; i++) {
          const peakH = 65 + Math.random() * 40;
          const peakR = 35 + Math.random() * 20;
          const peak = new THREE.Mesh(
            new THREE.ConeGeometry(peakR, peakH, 5),
            mountainMat
          );
          peak.position.set(
            side * (95 + Math.random() * 50),
            peakH / 2 - 12,
            -180 - i * 55 + (Math.random() - 0.5) * 30
          );
          peak.rotation.y = Math.random() * Math.PI;
          mountainGroup.add(peak);
        }
      });

      this.scene.add(mountainGroup);
    }

    initSubsystems() {
      this.particles = new ParticleSystem(this.scene);
      this.player = new Player(this.scene);
      this.road = new RoadManager(this.scene);
      this.obstacles = new ObstacleManager(this.scene);
      this.coinsManager = new CoinManager(this.scene);
    }

    // ------------------------------------------------------------------------
    // UI Elements Binding
    // ------------------------------------------------------------------------
    initUI() {
      // Screens
      this.hudEl = document.getElementById('hud');
      this.mainMenuEl = document.getElementById('main-menu');
      this.pauseMenuEl = document.getElementById('pause-menu');
      this.gameOverEl = document.getElementById('game-over-menu');

      // Metric Displays
      this.scoreDisplay = document.getElementById('score-display');
      this.coinsDisplay = document.getElementById('coins-display');
      this.distanceDisplay = document.getElementById('distance-display');
      this.speedText = document.getElementById('speed-text');
      this.menuHighScore = document.getElementById('menu-high-score');
      this.finalScore = document.getElementById('final-score');
      this.finalCoins = document.getElementById('final-coins');
      this.finalDistance = document.getElementById('final-distance');
      this.finalHighScore = document.getElementById('final-high-score');
      this.newHighScoreBanner = document.getElementById('new-high-score-banner');

      // Notifications & Coin Gain containers
      this.notificationsEl = document.getElementById('floating-notifications');
      this.coinsCard = document.getElementById('coins-card');
      this.coinGainContainer = document.getElementById('coin-gain-container');

      // Set initial high score display
      this.menuHighScore.textContent = this.highScore.toLocaleString();

      // Buttons
      document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
      document.getElementById('pause-btn').addEventListener('click', () => this.pauseGame());
      document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
      document.getElementById('pause-restart-btn').addEventListener('click', () => this.restartGame());
      document.getElementById('pause-quit-btn').addEventListener('click', () => this.returnToMenu());
      document.getElementById('restart-game-btn').addEventListener('click', () => this.restartGame());
      document.getElementById('return-menu-btn').addEventListener('click', () => this.returnToMenu());

      // Audio Toggle Button
      const soundBtn = document.getElementById('sound-toggle-btn');
      soundBtn.addEventListener('click', () => {
        const isMuted = this.sound.toggleMute();
        soundBtn.textContent = isMuted ? '🔇' : '🔊';
        soundBtn.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
      });

      // Fullscreen Buttons
      const fsBtn = document.getElementById('fullscreen-btn');
      const menuFsBtn = document.getElementById('menu-fullscreen-btn');
      if (fsBtn) fsBtn.addEventListener('click', () => this.toggleFullscreen());
      if (menuFsBtn) menuFsBtn.addEventListener('click', () => this.toggleFullscreen());

      // Update fullscreen UI on state change
      document.addEventListener('fullscreenchange', () => this.updateFullscreenUI());
      document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenUI());

      // Mobile Touch Buttons
      document.getElementById('btn-touch-left').addEventListener('click', () => this.player.moveLeft());
      document.getElementById('btn-touch-right').addEventListener('click', () => this.player.moveRight());
      document.getElementById('btn-touch-jump').addEventListener('click', () => this.player.jump(this.sound));
      document.getElementById('btn-touch-slide').addEventListener('click', () => this.player.slide(this.sound));
    }

    // ------------------------------------------------------------------------
    // Fullscreen API Helper
    // ------------------------------------------------------------------------
    toggleFullscreen() {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => { });
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => { });
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }

    updateFullscreenUI() {
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      const fsBtn = document.getElementById('fullscreen-btn');
      const menuFsBtn = document.getElementById('menu-fullscreen-btn');

      if (fsBtn) {
        fsBtn.textContent = isFs ? '🗗' : '⛶';
        fsBtn.title = isFs ? 'Exit Fullscreen (F)' : 'Toggle Fullscreen (F)';
      }
      if (menuFsBtn) {
        menuFsBtn.innerHTML = isFs
          ? '<span class="btn-icon">🗗</span> EXIT FULLSCREEN'
          : '<span class="btn-icon">⛶</span> FULLSCREEN';
      }
    }

    // ------------------------------------------------------------------------
    // Keyboard Controls Setup
    // ------------------------------------------------------------------------
    initInput() {
      window.addEventListener('keydown', (e) => {
        // Prevent default browser scrolling for arrow keys & spacebar
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }

        // Initialize audio context on first user action
        this.sound.init();

        // Handle Escape / P for Pause
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.state === STATE.PLAYING) {
            this.pauseGame();
          } else if (this.state === STATE.PAUSED) {
            this.resumeGame();
          }
          return;
        }

        // Handle Fullscreen (F)
        if (e.code === 'KeyF') {
          this.toggleFullscreen();
          return;
        }

        // Gameplay controls
        if (this.state === STATE.PLAYING) {
          switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':
              this.player.moveLeft();
              break;

            case 'ArrowRight':
            case 'KeyD':
              this.player.moveRight();
              break;

            case 'ArrowUp':
            case 'KeyW':
            case 'Space':
              this.player.jump(this.sound);
              break;

            case 'ArrowDown':
            case 'KeyS':
              this.player.slide(this.sound);
              break;
          }
        }
      });
    }

    // ------------------------------------------------------------------------
    // Game State Transitions
    // ------------------------------------------------------------------------
    startGame() {
      this.sound.init();
      this.resetMetrics();
      this.state = STATE.PLAYING;

      this.mainMenuEl.classList.remove('active');
      this.mainMenuEl.classList.add('hidden');
      this.hudEl.classList.remove('hidden');
      this.hudEl.classList.add('active');
      this.pauseMenuEl.classList.add('hidden');
      this.gameOverEl.classList.add('hidden');
    }

    pauseGame() {
      if (this.state !== STATE.PLAYING) return;
      this.state = STATE.PAUSED;
      this.pauseMenuEl.classList.remove('hidden');
      this.pauseMenuEl.classList.add('active');
    }

    resumeGame() {
      if (this.state !== STATE.PAUSED) return;
      this.state = STATE.PLAYING;
      this.pauseMenuEl.classList.remove('active');
      this.pauseMenuEl.classList.add('hidden');
    }

    gameOver() {
      this.state = STATE.GAMEOVER;
      this.sound.playCrash();
      this.cameraShakeIntensity = 0.55;

      // Particle explosion at player
      this.particles.spawnCrashExplosion(this.player.mesh.position);

      // Check for new high score
      let isNewRecord = false;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('cyberdash_highscore', this.highScore.toString());
        isNewRecord = true;
      }

      // Update Game Over UI
      this.finalScore.textContent = this.score.toLocaleString();
      this.finalCoins.textContent = this.coins.toLocaleString();
      this.finalDistance.textContent = `${Math.floor(this.distance)}m`;
      this.finalHighScore.textContent = this.highScore.toLocaleString();

      if (isNewRecord) {
        this.newHighScoreBanner.classList.remove('hidden');
      } else {
        this.newHighScoreBanner.classList.add('hidden');
      }

      setTimeout(() => {
        this.hudEl.classList.remove('active');
        this.hudEl.classList.add('hidden');
        this.gameOverEl.classList.remove('hidden');
        this.gameOverEl.classList.add('active');
      }, 700);
    }

    restartGame() {
      this.resetMetrics();
      this.player.reset();
      this.obstacles.clear();
      this.coinsManager.clear();
      this.particles.clear();
      this.road.reset();

      this.gameOverEl.classList.remove('active');
      this.gameOverEl.classList.add('hidden');
      this.pauseMenuEl.classList.remove('active');
      this.pauseMenuEl.classList.add('hidden');

      this.hudEl.classList.remove('hidden');
      this.hudEl.classList.add('active');

      this.state = STATE.PLAYING;
    }

    returnToMenu() {
      this.state = STATE.MENU;
      this.resetMetrics();
      this.player.reset();
      this.obstacles.clear();
      this.coinsManager.clear();
      this.particles.clear();
      this.road.reset();

      this.hudEl.classList.remove('active');
      this.hudEl.classList.add('hidden');
      this.pauseMenuEl.classList.remove('active');
      this.pauseMenuEl.classList.add('hidden');
      this.gameOverEl.classList.remove('active');
      this.gameOverEl.classList.add('hidden');

      this.menuHighScore.textContent = this.highScore.toLocaleString();
      this.mainMenuEl.classList.remove('hidden');
      this.mainMenuEl.classList.add('active');
    }

    resetMetrics() {
      this.score = 0;
      this.coins = 0;
      this.distance = 0;
      this.currentSpeed = CONFIG.INITIAL_SPEED;
      this.cameraShakeIntensity = 0;
      this.updateHUD();
    }

    // ------------------------------------------------------------------------
    // Coin Gain & HUD Updates
    // ------------------------------------------------------------------------
    showCoinGain(text = '+1') {
      if (this.coinGainContainer) {
        const badge = document.createElement('span');
        badge.className = 'coin-gain-badge';
        badge.textContent = text;
        this.coinGainContainer.appendChild(badge);

        // Bump animation on the total coins card
        if (this.coinsCard) {
          this.coinsCard.classList.remove('coin-bump');
          void this.coinsCard.offsetWidth; // Force reflow
          this.coinsCard.classList.add('coin-bump');
        }

        setTimeout(() => {
          if (badge.parentNode) {
            badge.parentNode.removeChild(badge);
          }
        }, 900);
      }
    }

    showToast(text, type = 'coin') {
      const toast = document.createElement('div');
      toast.className = `floating-toast ${type === 'coin' ? 'toast-coin' : 'toast-speed'}`;
      toast.textContent = text;
      this.notificationsEl.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 1200);
    }

    updateHUD() {
      this.scoreDisplay.textContent = this.score.toLocaleString();
      this.coinsDisplay.textContent = this.coins.toLocaleString();
      this.distanceDisplay.textContent = `${Math.floor(this.distance)}m`;

      const speedMultiplier = (this.currentSpeed / CONFIG.INITIAL_SPEED).toFixed(1);
      this.speedText.textContent = `${speedMultiplier}x SPEED`;
    }

    // ------------------------------------------------------------------------
    // Main Game Animation & Physics Loop
    // ------------------------------------------------------------------------
    animate() {
      requestAnimationFrame(this.animate);

      // Delta time calculation with safety clamp for tab switching
      const delta = Math.min(this.clock.getDelta(), 0.08);

      // 1. Particle System updates in all active states
      this.particles.update(delta);

      if (this.state === STATE.PLAYING) {
        // Difficulty Progression: Accelerate running speed gradually over distance
        if (this.currentSpeed < CONFIG.MAX_SPEED) {
          this.currentSpeed += CONFIG.SPEED_ACCELERATION * delta;
        }

        // Distance & Base Score
        this.distance += this.currentSpeed * delta;
        this.score = Math.floor(this.distance) + this.coins * CONFIG.COIN_SCORE_BONUS;

        // Subsystems updates
        this.road.update(delta, this.currentSpeed);
        this.player.update(delta, this.currentSpeed);
        this.obstacles.update(delta, this.currentSpeed);
        this.coinsManager.update(delta, this.currentSpeed);

        // Coin Collection Check
        this.coinsManager.checkCollection(this.player.mesh, (coinPos) => {
          this.coins++;
          this.sound.playCoin();
          this.particles.spawnCoinSparkle(coinPos);
          this.showCoinGain('+1');
        });

        // Obstacle Collision Check
        const collisionResult = this.obstacles.checkCollision(
          this.player.getHitbox(),
          this.player.isSliding
        );

        if (collisionResult.collided) {
          this.gameOver();
        }

        this.updateHUD();

        // Dynamic Camera Follow
        const targetCamX = this.player.mesh.position.x * 0.45;
        this.camera.position.x += (targetCamX - this.camera.position.x) * (delta * 6);
        this.camera.position.y = this.cameraBasePos.y + (this.player.mesh.position.y - this.player.groundY) * 0.3;
        this.camera.position.z = this.cameraBasePos.z;
        this.camera.lookAt(this.player.mesh.position.x * 0.3, 1.3, -8);
      } else if (this.state === STATE.MENU) {
        // Slow cinematic orbit around runner on main menu
        const menuTime = Date.now() * 0.0006;
        this.camera.position.x = Math.sin(menuTime) * 3.5;
        this.camera.position.y = 4.2 + Math.cos(menuTime) * 0.4;
        this.camera.position.z = 8.5;
        this.camera.lookAt(0, 1.2, 0);

        // Idle road & player animation
        this.road.update(delta, CONFIG.INITIAL_SPEED * 0.6);
        this.player.update(delta, CONFIG.INITIAL_SPEED * 0.6);
      }

      // Camera Shake Effect (on crash or heavy events)
      if (this.cameraShakeIntensity > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity;
        this.cameraShakeIntensity -= delta * 1.5;
        if (this.cameraShakeIntensity < 0) this.cameraShakeIntensity = 0;
      }

      // Render 3D Scene
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ==========================================================================
  // 9. GAME LAUNCHER
  // ==========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
      alert('Error: Three.js library failed to load from CDN. Please check your internet connection.');
      return;
    }

    // Launch game instance
    window.gameInstance = new Game();
  });
})();
