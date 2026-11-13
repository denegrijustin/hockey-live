// The 3D ice preparation scene (Three.js). One route and one timeline (lib/ice-plan.mjs) drive three things from the same numbers:
//   1. the vehicle's position and heading (poseAt), its steered front wheels, rolling wheels and the lift of the conditioner (bladeDown);
//   2. the persistent clean-ice mask: a GPU render target the blade paints into, quad by quad, exactly where its two ends travelled (sweptQuads);
//   3. a short film of wash water laid behind the blade.
// The ice shader mixes the worn and the fresh texture (and roughness) through that mask, so the cleaning boundary IS the blade's path.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { canvasOf, cleanTexture, dirtyTexture, type Look } from "./ice-textures";

export type Pt = { x: number; y: number };
export type Pose = { x: number; y: number; heading: number; bx: number; by: number };
/** What the scene needs from a plan: where the machine is at route distance s, and the ground the blade covered between two distances. */
export type PlanApi = { poseAt(s: number): Pose; sweptQuads(from: number, to: number, step?: number): Pt[][]; enterEnd: number };
export type Frame = { phase: string; s: number; clean: number; bladeDown: number };
export type Quality = "high" | "low";

const W = 200, H = 85, R = 28, GATE = { x: 181, y: 83.5, half: 6.5 };
const FT = 1; // one scene unit = one foot

function rounded(w: number, h: number, r: number, inset = 0) {
  const s = new THREE.Shape(), x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset, rr = Math.max(0.01, r - inset);
  // shape y runs the other way: ground Y south = scene z, and the rotation below puts shape (x, -Y) on the ground
  s.moveTo(x0 + rr, -y0); s.lineTo(x1 - rr, -y0); s.absarc(x1 - rr, -(y0 + rr), rr, Math.PI / 2, 0, true);
  s.lineTo(x1, -(y1 - rr)); s.absarc(x1 - rr, -(y1 - rr), rr, 0, -Math.PI / 2, true);
  s.lineTo(x0 + rr, -y1); s.absarc(x0 + rr, -(y1 - rr), rr, -Math.PI / 2, -Math.PI, true);
  s.lineTo(x0, -(y0 + rr)); s.absarc(x0 + rr, -(y0 + rr), rr, Math.PI, Math.PI / 2, true);
  return s;
}

/** The boards' centre line as a closed polyline of ground points (x, Y), clockwise as seen from above (north up). */
function perimeter(step = 2): Pt[] {
  const out: Pt[] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 12; i++) { const a = a0 + (i / 12) * (Math.PI / 2); out.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); } };
  arc(R, R, Math.PI); arc(W - R, R, -Math.PI / 2); arc(W - R, H - R, 0); arc(R, H - R, Math.PI / 2);
  void step;
  return out;
}

/** A ribbon along the perimeter between heights y0..y1, pushed out by `off`; segments near the gate are left out when `gap` is set. */
function wall(y0: number, y1: number, off: number, material: THREE.Material, gap = false, flip = false) {
  const pts = perimeter(), pos: number[] = [], nor: number[] = [], idx: number[] = [], uv: number[] = [];
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (gap && Math.hypot(mx - GATE.x, my - GATE.y) < GATE.half + 2.5) continue;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l; // outward
    const s = flip ? -1 : 1;
    const ax = a.x + nx * off, ay = a.y + ny * off, bx = b.x + nx * off, by = b.y + ny * off;
    pos.push(ax, y0, ay, bx, y0, by, bx, y1, by, ax, y1, ay);
    for (let k = 0; k < 4; k++) nor.push(nx * s, 0, ny * s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return new THREE.Mesh(g, material);
}

const hex = (c: string) => new THREE.Color(c);

export class Ice3D {
  readonly canvas: HTMLCanvasElement;
  private look: Look; private plan: PlanApi; private quality: Quality;
  /** The WebGL renderer (exposed for profiling tools). */
  renderer!: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(30, 2, 5, 2000);
  private maskRT!: THREE.WebGLRenderTarget; private maskScene = new THREE.Scene(); private maskCam = new THREE.OrthographicCamera(0, W, H, 0, -1, 1);
  private maskMesh!: THREE.Mesh; private maskCap = 0;
  private iceMat!: THREE.MeshStandardMaterial; private dirtyTex!: THREE.CanvasTexture; private cleanTex!: THREE.CanvasTexture;
  private vehicle = new THREE.Group(); private parts: Record<string, THREE.Object3D> = {}; private ready = false; private shadow!: THREE.Mesh;
  private wet!: THREE.Mesh; private wetCap = 0;
  private cleaned: number; private lastS = 0; private odo = 0;
  private cssW = 0; private cssH = 0; private disposed = false;
  // the camera: the whole rink while the machine is off the ice, a close follow shot while it works (so its artwork can be read)
  private overview = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 };
  /** "follow": the close shot that tracks the machine while it works; "overview": the whole rink at all times (the progress of the whole sheet in one view). */
  private viewMode: "follow" | "overview" = "follow";
  setView(v: "follow" | "overview") { this.viewMode = v; }
  private zoom = 0; private follow = new THREE.Vector3(); private followReady = false; private camClock = 0;
  /** The camera, for tools that want a different view (the app uses the fixed one set by resize()). */
  get cam() { return this.camera; }
  readonly stats = { frames: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(canvas: HTMLCanvasElement, look: Look, plan: PlanApi, quality: Quality = "high") {
    this.canvas = canvas; this.look = look; this.plan = plan; this.quality = quality; this.cleaned = plan.enterEnd;
  }

  /** Builds the scene and loads the vehicle model. Resolves when it can render. */
  async init(modelUrl = "/models/zamboni.glb") {
    // setup is the heavy part (environment map, big textures, the model): each step yields to the browser so the page stays responsive while it builds
    const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance", alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.setClearColor(0x0a1322, 1);
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environment = env; this.scene.environmentIntensity = 0.5; pmrem.dispose();
    await yieldNow(); if (this.disposed) return;
    this.buildIce(); await yieldNow(); if (this.disposed) return;
    this.buildRink(); this.buildLights(); await yieldNow(); if (this.disposed) return;
    this.maskRT = new THREE.WebGLRenderTarget(this.quality === "high" ? 2048 : 1024, this.quality === "high" ? 870 : 435, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, format: THREE.RGBAFormat });
    this.maskRT.texture.generateMipmaps = false;
    this.maskMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    this.maskMesh.frustumCulled = false; this.maskScene.add(this.maskMesh);
    (this.iceMat.userData.shader as { uniforms: Record<string, { value: unknown }> } | undefined)?.uniforms && void 0;
    this.clearMask();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(modelUrl);
    if (this.disposed) return;
    const model = gltf.scene;
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) { mat.map.anisotropy = 8; } mat.envMapIntensity = 0.7; } });
    for (const n of ["body", "conditioner", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"]) { const o = model.getObjectByName(n); if (o) { this.parts[n] = o; if (n.startsWith("wheel")) o.rotation.order = "YZX"; } }
    this.vehicle.add(model); this.scene.add(this.vehicle);
    // a soft, restrained contact shadow under the machine
    const sc = canvasOf(256, 128), sx = sc.getContext("2d")!; const g = sx.createRadialGradient(128, 64, 8, 128, 64, 120); g.addColorStop(0, "rgba(10,20,40,0.5)"); g.addColorStop(1, "rgba(10,20,40,0)"); sx.fillStyle = g; sx.scale(1, 0.5); sx.fillRect(0, 0, 256, 256);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.04; this.scene.add(this.shadow);
    // the film of wash water behind the blade
    const wg = new THREE.BufferGeometry(); this.wetCap = 8 * 64;
    wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.wetCap * 3), 3)); wg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.wetCap * 4), 4));
    this.wet = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending }));
    this.wet.frustumCulled = false; this.wet.position.y = 0.05; this.scene.add(this.wet);
    this.ready = true;
  }

  // --------------------------------------------------------------------------------------------------------------- ice
  private buildIce() {
    const k = this.quality === "high" ? 8 : 5;
    this.dirtyTex = new THREE.CanvasTexture(dirtyTexture(W * k, H * k, k, this.look)); this.cleanTex = new THREE.CanvasTexture(cleanTexture(W * k, H * k, k, this.look));
    for (const t of [this.dirtyTex, this.cleanTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
    const geo = new THREE.ShapeGeometry(rounded(W, H, R), 40);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W, 1 - -p.getY(i) / H);
    geo.rotateX(-Math.PI / 2);
    const m = this.iceMat = new THREE.MeshStandardMaterial({ map: this.dirtyTex, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.22 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.cleanMap = { value: this.cleanTex }; sh.uniforms.maskMap = { value: this.maskRT?.texture ?? null };
      m.userData.shader = sh;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D cleanMap; uniform sampler2D maskMap;")
        .replace("#include <map_fragment>", "float cleanM = texture2D(maskMap, vMapUv).r; cleanM = smoothstep(0.35, 0.65, cleanM); vec4 dirtyC = texture2D(map, vMapUv); dirtyC.rgb = mix(dirtyC.rgb, vec3(dot(dirtyC.rgb, vec3(0.3, 0.55, 0.15))), 0.35) * vec3(0.80, 0.83, 0.87); vec4 cleanC = texture2D(cleanMap, vMapUv); cleanC.rgb *= vec3(0.98, 1.0, 1.04); diffuseColor *= mix(dirtyC, cleanC, cleanM);")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.9, 0.32, cleanM);")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n// the worn surface is slightly pitted, the fresh one is flat\n");
    };
    const ice = new THREE.Mesh(geo, m); ice.position.y = 0; ice.receiveShadow = false; this.scene.add(ice);
  }

  private clearMask() {
    const r = this.renderer; const prev = r.getRenderTarget();
    r.setRenderTarget(this.maskRT); r.setClearColor(0x000000, 1); r.clear(); r.setRenderTarget(prev); r.setClearColor(0x0a1322, 1);
    this.cleaned = this.plan.enterEnd;
    const sh = this.iceMat.userData.shader as { uniforms: Record<string, { value: unknown }> } | undefined; if (sh) sh.uniforms.maskMap.value = this.maskRT.texture;
  }
  /** Drops the clean ice: a new intermission starts. */
  reset() { if (this.ready) this.clearMask(); this.odo = 0; this.lastS = 0; }
  get cleanedDistance() { return this.cleaned; }

  /** The blade lays fresh ice from route distance `from` to `to`: the quads it swept are drawn into the persistent mask. */
  private paint(from: number, to: number) {
    const quads = this.plan.sweptQuads(Math.max(this.plan.enterEnd, from - 1.5), to, 0.75);
    if (!quads.length) return;
    const pos = new Float32Array(quads.length * 6 * 3);
    let o = 0;
    for (const q of quads) {
      const v = q.map((p) => [p.x, H - p.y]);
      for (const i of [0, 1, 2, 0, 2, 3]) { pos[o++] = v[i][0]; pos[o++] = v[i][1]; pos[o++] = 0; }
    }
    this.maskMesh.geometry.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); this.maskMesh.geometry = g;
    const r = this.renderer, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.maskRT); r.render(this.maskScene, this.maskCam); r.setRenderTarget(prev); r.autoClear = ac;
  }

  // --------------------------------------------------------------------------------------------------------------- arena
  private buildRink() {
    const look = this.look, team = hex(look.color || "#1d428a");
    // boards: white faces, a team-coloured band, the yellow kick plate; glass above with stanchions
    const face = new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
    this.scene.add(wall(0, 4, 0, face, true));
    this.scene.add(wall(2.6, 3.6, 0.04, new THREE.MeshStandardMaterial({ color: team, roughness: 0.4, side: THREE.DoubleSide }), true));
    this.scene.add(wall(0, 0.55, 0.05, new THREE.MeshStandardMaterial({ color: 0xe8b92d, roughness: 0.5, side: THREE.DoubleSide }), true));
    this.scene.add(wall(4, 4.4, 0.0, new THREE.MeshStandardMaterial({ color: 0xb5bfc9, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }), true));
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd8f5, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    this.scene.add(wall(4.4, 8.4, 0, glass, true));
    // the team's name on the far boards and on the outside of the near boards (flat signs on the wall)
    const label = (text: string, w: number, h: number) => {
      const c = canvasOf(2048, Math.round(2048 * (h / w))), x = c.getContext("2d")!; x.fillStyle = "rgba(255,255,255,0)"; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `italic 800 ${c.height * 0.72}px system-ui, "Segoe UI", Roboto, sans-serif`; x.shadowColor = "rgba(0,0,0,0.35)"; x.shadowBlur = 8; x.fillText(text.toUpperCase(), c.width / 2, c.height / 2);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(110, 1.6), new THREE.MeshBasicMaterial({ map: label(look.homeName, 110, 1.6), transparent: true, depthWrite: false }));
    sign.position.set(100, 3.1, 0.2); this.scene.add(sign);
    const sign2 = sign.clone(); sign2.position.set(70, 3.1, H + 0.3); sign2.scale.set(0.9, 1, 1); this.scene.add(sign2);
    // no stands: the picture is the ice and the boards, on a plain dark floor
    // the floor beyond the boards, with the dark rubber mat leading to the service gate
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.MeshStandardMaterial({ color: 0x0c1019, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.position.set(100, -0.1, 100); this.scene.add(floor);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(16, 60), new THREE.MeshStandardMaterial({ color: 0x090b0f, roughness: 0.95 })); mat.rotation.x = -Math.PI / 2; mat.position.set(GATE.x, 0, 105); this.scene.add(mat);
    // gate frame
    const post = new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.5, roughness: 0.4 });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), post); p.position.set(GATE.x + sx * GATE.half, 2.2, 86.5); this.scene.add(p); }
    this.scene.background = hex("#0a1322");
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x1a2540, 0.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(40, 160, 170); key.target.position.set(100, 0, 42); this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7); rim.position.set(180, 60, -40); this.scene.add(rim);
  }

  // --------------------------------------------------------------------------------------------------------------- frame
  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = cssW; this.cssH = cssH;
    this.renderer.setPixelRatio(Math.min(dpr, 2)); // the picture is small, and the vehicle's lettering needs the sharpness this.renderer.setSize(cssW, cssH, false);
    this.camera.aspect = cssW / cssH; this.fit();
  }
  /** The fixed camera: raised and set back on the near side, looking across the rink, its field of view set so the rink fills 96% of the width. */
  /** Where the fixed camera sits and what it looks at (feet); a tool may change it before resize(). */
  pose = { pos: [100, 142, 125] as [number, number, number], look: [100, 0, 42.5] as [number, number, number], shift: 0, fill: 0.97 };
  private fit() {
    const c = this.camera; c.position.set(...this.pose.pos); c.up.set(0, 1, 0); c.lookAt(...this.pose.look);
    let lo = 8, hi = 70;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; c.fov = mid; c.updateProjectionMatrix(); c.updateMatrixWorld(true); const v = new THREE.Vector3(0, 0, H).project(c); if (Math.abs(v.x) > this.pose.fill) lo = mid; else hi = mid; }
    c.fov = (lo + hi) / 2; c.updateProjectionMatrix();
    this.overview.pos.copy(c.position); this.overview.look.set(...this.pose.look); this.overview.fov = c.fov;
    // shift the picture so the far glass sits near the top and the gate's floor stays in view
    c.setViewOffset(this.cssW, this.cssH, 0, -this.cssH * this.pose.shift, this.cssW, this.cssH);
  }

  /**
   * Places the camera for this frame: the overview, or (while the machine is on the ice) a follow shot about 38 ft wide with the machine in the middle, blended
   * smoothly in and out. Time passes by the clock, so a frame skipped on a slow device does not make the camera lurch.
   */
  private placeCamera(machineOn: boolean, x: number, z: number, heading: number) {
    const on = machineOn && this.viewMode === "follow";
    const now = performance.now(), dt = this.camClock ? Math.min(0.5, (now - this.camClock) / 1000) : 1; this.camClock = now;
    this.zoom += ((on ? 1 : 0) - this.zoom) * (1 - Math.exp(-dt * 2.4));
    if (this.zoom < 0.002) this.zoom = 0;
    if (on) {
      // lead a little along the heading so the blade's boundary and the ice ahead are both in view
      const tx = x - Math.cos(heading) * 4, tz = z - Math.sin(heading) * 4 - 3; // and aim a little past it so the whole roof stays in frame
      if (!this.followReady || dt >= 0.5) { this.follow.set(tx, 0, tz); this.followReady = true; }
      else { const k = 1 - Math.exp(-dt * 4.5); this.follow.x += (tx - this.follow.x) * k; this.follow.z += (tz - this.follow.z) * k; }
    } else this.followReady = false;
    const e = this.zoom * this.zoom * (3 - 2 * this.zoom), c = this.camera;
    const fov = 28, aspect = this.cssW / Math.max(1, this.cssH), hf = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    const dist = 19 / Math.tan(hf / 2);                            // half the 38 ft window
    const el = (40 * Math.PI) / 180;
    const fp = new THREE.Vector3(this.follow.x, Math.sin(el) * dist, this.follow.z + Math.cos(el) * dist), fl = new THREE.Vector3(this.follow.x, 0, this.follow.z);
    c.position.lerpVectors(this.overview.pos, fp, e); const look = new THREE.Vector3().lerpVectors(this.overview.look, fl, e);
    c.up.set(0, 1, 0); c.lookAt(look);
    c.fov = this.overview.fov + (fov - this.overview.fov) * e; c.aspect = aspect; c.updateProjectionMatrix();
    c.setViewOffset(this.cssW, this.cssH, 0, -this.cssH * this.pose.shift * (1 - e), this.cssW, this.cssH);
  }

  render(state: Frame) {
    if (!this.ready) return;
    const shader = this.iceMat.userData.shader as { uniforms: Record<string, { value: unknown }> } | undefined;
    if (shader && shader.uniforms.maskMap.value !== this.maskRT.texture) shader.uniforms.maskMap.value = this.maskRT.texture;
    const target = Math.max(this.cleaned, state.clean);
    if (target > this.cleaned) { this.paint(this.cleaned, target); this.cleaned = target; }
    const pose = this.plan.poseAt(state.s);
    const on = state.phase === "enter" || state.phase === "clean" || state.phase === "exit";
    this.vehicle.visible = on; this.shadow.visible = on;
    if (on) {
      this.vehicle.position.set(pose.x, 0, pose.y); this.vehicle.rotation.y = -pose.heading;
      this.shadow.position.set(pose.x, 0.04, pose.y); this.shadow.rotation.z = pose.heading;
      // steering from the path's curvature, wheels rolling with the distance driven, conditioner lifted when the blade is up
      const a = this.plan.poseAt(state.s - 0.8), b = this.plan.poseAt(state.s + 0.8);
      let dh = b.heading - a.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-0.6, Math.min(0.6, Math.atan((9.4 * dh) / 1.6)));
      this.odo += state.s - this.lastS; this.lastS = state.s;
      for (const n of ["wheel_FL", "wheel_FR"]) { const w = this.parts[n]; if (w) { w.rotation.y = -steer; w.rotation.z = -this.odo / 1.5; } }
      for (const n of ["wheel_RL", "wheel_RR"]) { const w = this.parts[n]; if (w) w.rotation.z = -this.odo / 1.5; }
      const cond = this.parts.conditioner; if (cond) cond.rotation.z = -(1 - Math.max(0, Math.min(1, state.bladeDown))) * 0.28;
      this.updateWet(state);
    } else this.wet.visible = false;
    this.placeCamera(on, pose.x, pose.y, pose.heading);
    this.renderer.render(this.scene, this.camera);
    const i = this.renderer.info; this.stats.frames++; this.stats.drawCalls = i.render.calls; this.stats.triangles = i.render.triangles; this.stats.geometries = i.memory.geometries; this.stats.textures = i.memory.textures;
  }

  private updateWet(state: Frame) {
    const g = this.wet.geometry as THREE.BufferGeometry;
    if (state.phase !== "clean" || state.bladeDown < 0.5) { this.wet.visible = false; return; }
    const pos = g.attributes.position as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute;
    const parts = 7, len = 7; let n = 0;
    for (let i = 0; i < parts; i++) {
      const quads = this.plan.sweptQuads(Math.max(this.plan.enterEnd, state.s - len * ((i + 1) / parts)), Math.max(this.plan.enterEnd, state.s - len * (i / parts)), 1);
      const alpha = 0.22 * (1 - i / parts);
      for (const q of quads) for (const k of [0, 1, 2, 0, 2, 3]) { if (n >= this.wetCap) break; pos.setXYZ(n, q[k].x, 0, q[k].y); col.setXYZW(n, 0.92, 0.97, 1, alpha); n++; }
    }
    g.setDrawRange(0, n); pos.needsUpdate = true; col.needsUpdate = true; this.wet.visible = n > 0;
  }

  /** Swap the home logo on the sheet (and the boards) without touching the cleaned ice. */
  setLook(look: Look) {
    this.look = look;
    const k = this.quality === "high" ? 8 : 5;
    this.dirtyTex.image = dirtyTexture(W * k, H * k, k, look); this.cleanTex.image = cleanTexture(W * k, H * k, k, look);
    this.dirtyTex.needsUpdate = true; this.cleanTex.needsUpdate = true;
  }

  dispose() { this.disposed = true; this.renderer?.dispose(); this.maskRT?.dispose(); }
}
void FT;
