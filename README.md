# 3D Endless Runner Game (Temple Runner)

> **College Mini Project** | Semester VII &bull; Augmented Reality & Virtual Reality (AR/VR)  
> **Technologies:** Three.js (WebGL), Vanilla JavaScript (ES6+), HTML5, CSS3, Web Audio API  
> **Architecture:** Zero-build, Client-side Standalone Web Application  

---

## 1. Project Abstract

**Temple Runner** is an immersive, high-performance 3D Endless Runner web game inspired by *Subway Surfers* and *Temple Run*, developed using **Three.js** and **HTML5/CSS3**. Set along an ancient stone viaduct stretching deep into a lush tropical jungle, the player controls an authentic street runner navigating across three dynamic lanes. The objective is to survive as long as possible by dodging road barriers (jumping), sliding beneath ancient stone gates (baseball slide), and avoiding expedition crates, all while collecting golden power coins to maximize the score.

The game features real-time WebGL rendering, lush multi-layered jungle scenery (tropical palm groves, towering banyan giants, mossy boulders, hanging vines, rope suspension bridges, and monumental temple arches), dynamic hemisphere bounce lighting, warm golden sun rays, procedural sound effects synthesized directly in the browser via the Web Audio API, and fair-path obstacle generation at a constant 60 FPS.

---

## 2. Key Features

- **Lush 3D Adventure Environment:** Ancient elevated stone viaduct with golden lane runners, carved balustrades with burning torches, curved palm trees, giant banyan canopies, mossy boulders, hanging vines, overarching temple gates, high rope bridges, and distant mountain ridges in the tropical horizon.
- **Authentic Runner Character & Kinematics:** Signature Subway Surfers / Temple Run runner with backward cap, hoodie, explorer backpack, 2-joint leg kinematics with knee flexion, parkour tuck jumping, baseball slide, and dynamic banking.
- **3-Lane Smooth Movement:** Smooth horizontal lane switching with banking tilt, jumping arcs with gravity, and crouch/slide mechanics.
- **Multiple Obstacle Types:**
  - 🚧 **Low Road Barriers:** Must jump over or change lanes.
  - ⚡ **High Stone Gate Arches:** Elevated beam allowing the player to slide underneath or change lanes.
  - 📦 **Heavy Crates:** Solid obstacles that require changing lanes.
- **Fair-Path Spawner:** Ensures at least one lane is always open and navigable, avoiding impossible obstacle walls.
- **Rotating Collectible Coins:** Golden 3D coins spawned in arcs and lines with sparkle particle bursts and sound chimes upon collection.
- **Dynamic Difficulty Progression:** Gradually accelerates the running speed over distance, rewarding survival time and precision reflexes.
- **Built-in Procedural Audio:** Fully synthesized sound effects (Jump, Slide, Coin Chime, Crash Rumble) using the native HTML5 Web Audio API—no external `.mp3` or `.wav` files needed.
- **Modern Glassmorphic UI:** Polished arcade HUD displaying real-time Score, Distance, Coins (+1 popup on right of coin counter), Speed Multiplier, and local high score.
- **Fullscreen Support:** Dedicated Fullscreen buttons on menu and HUD, plus <kbd>F</kbd> shortcut.
- **Responsive & Touch Friendly:** Features keyboard support (Arrows, WASD, Space, Esc, F) plus on-screen touch controls for mobile/tablet screens.

---

## 3. Project File Structure

```
├── index.html       # HTML5 game structure, HUD elements, modals & Three.js CDN loader
├── style.css        # Modern arcade aesthetic, glassmorphism panels, HUD styling, responsive design
├── game.js          # Three.js 3D scene, physics, player controller, spawner, audio, state machine
└── README.md        # Complete project documentation and viva/presentation guide
```

### File Breakdown:
1. **[index.html](file:///c:/Users/Dell/OneDrive/Desktop/Delete/SEM-7/ARVR/Project/index.html)**: Contains the viewport configuration, Three.js CDN script import (`r128`), DOM overlays for the Heads-Up Display (HUD), Main Menu, Pause Menu, Game Over modal, and touch action buttons.
2. **[style.css](file:///c:/Users/Dell/OneDrive/Desktop/Delete/SEM-7/ARVR/Project/style.css)**: Implements a dark synthwave/arcade aesthetic with CSS custom properties (variables), backdrop filters (`blur`), keyframe animations for floating text and button pulses, and mobile breakpoints.
3. **[game.js](file:///c:/Users/Dell/OneDrive/Desktop/Delete/SEM-7/ARVR/Project/game.js)**: The core engine divided into clear classes:
   - `SoundSystem`: Generates real-time sound frequencies using the Web Audio API.
   - `ParticleSystem`: Handles 3D particle bursts for coin collection and crash impacts.
   - `Player`: 3D composite character with limb running cycles, lane lerping, jump arc, and slide hitbox scaling.
   - `RoadManager`: Endless highway chunks and stylized roadside buildings/trees.
   - `ObstacleManager`: Fair 3-lane obstacle spawning and 3D Axis-Aligned Bounding Box (AABB) collision checks.
   - `CoinManager`: Spawns, spins, bobs, and detects collection of golden coins.
   - `Game`: Manages the Three.js camera, lighting, renderer, game state machine, and animation loop.

---

## 4. Controls

| Action | Primary Keyboard | Secondary Keyboard | Mobile / Touch |
| :--- | :--- | :--- | :--- |
| **Move Left** | <kbd>A</kbd> | <kbd>◀ Left Arrow</kbd> | Left Button `◀` |
| **Move Right** | <kbd>D</kbd> | <kbd>▶ Right Arrow</kbd> | Right Button `▶` |
| **Jump** | <kbd>W</kbd> or <kbd>Space</kbd> | <kbd>▲ Up Arrow</kbd> | `▲ JUMP` Button |
| **Slide / Crouch** | <kbd>S</kbd> | <kbd>▼ Down Arrow</kbd> | `▼ SLIDE` Button |
| **Pause / Resume** | <kbd>Escape</kbd> | <kbd>P</kbd> | `⏸` HUD Button |
| **Toggle Fullscreen** | <kbd>F</kbd> | — | `⛶` HUD / Menu Button |

---

## 5. How to Run the Game

No build step, package installation, or backend is required. You can launch the game using any of the following simple methods:

### Option A: Using Vite (Already configured)
If you have a terminal open in the project folder:
```bash
npx vite
```
Then open: **`http://localhost:5173/`** in any modern web browser (Chrome, Edge, Firefox, Brave, Safari).

### Option B: Using VS Code Live Server
1. Open the project folder in VS Code.
2. Right-click on `index.html`.
3. Select **"Open with Live Server"**.

### Option C: Using Python Simple HTTP Server
Open your terminal in this directory and run:
```bash
python -m http.server 8000
```
Then open: **`http://localhost:8000/`**.

### Option D: Direct Browser Launch
Because Three.js is loaded via an external CDN script tag and there are no external asset files requiring CORS, you can double-click **`index.html`** directly in your file explorer.

---

---

## 7. License & Credits

- Developed for College SEM-7 AR/VR Mini Project.
- 3D Graphics Library: [Three.js](https://threejs.org/) (MIT License).
- Typography: Outfit & Space Grotesk via Google Fonts.
