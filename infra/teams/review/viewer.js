// The model view: orbit to look around, click the model to pick a spot for a comment, click a pin
// to open its comment. It draws only when something changes, never in a loop.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as pdfjs from "pdfjs";

pdfjs.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

const round = (n) => Math.round(n * 1000) / 1000;
const EDGE_ANGLE = 28;

/** The part's sharp edges as thin lines, as a CAD view draws them. */
export function addEdges(root) {
  const meshes = [];
  root.traverse((each) => {
    if (each.isMesh) meshes.push(each);
  });
  for (const mesh of meshes) {
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE),
      new THREE.LineBasicMaterial({ color: 0x2a3440, transparent: true, opacity: 0.38 }),
    );
    lines.raycast = () => {};
    mesh.add(lines);
  }
}

/** A model file as a three.js object, each glTF node tagged with its index for picking parts. */
export async function parseModel(buffer, ext) {
  let object;
  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xb9c3cf, metalness: 0.2, roughness: 0.5 }),
    );
  } else {
    object = await new Promise((resolve, reject) =>
      new GLTFLoader().parse(
        buffer,
        "",
        (gltf) => {
          // Which glTF node each object is, so the file panel can pick a part by it. Asked per node:
          // the loader's own associations are shared between copies of one mesh.
          const count = gltf.parser.json.nodes?.length ?? 0;
          Promise.all(
            Array.from({ length: count }, (_, index) =>
              gltf.parser.getDependency("node", index).then((object) => {
                object.userData.node = index;
              }),
            ),
          ).then(() => resolve(gltf.scene), reject);
        },
        reject,
      ),
    );
  }
  object.traverse((each) => {
    for (const material of [each.material ?? []].flat()) material.envMapIntensity = 0.45;
  });
  return object;
}

export function makeViewer(container, { onPick, onPin }) {
  let renderer = null;
  let scene;
  let camera;
  let controls;
  let model = null;
  let home = null;
  let pins = [];
  const stage = document.createElement("div");
  stage.className = "stage";
  const pinLayer = document.createElement("div");
  pinLayer.className = "pins";
  const note = document.createElement("div");
  note.className = "stage-note";

  const ensure3d = () => {
    if (renderer !== null) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    // A soft room for reflections, kept dim so the model's own colours read true.
    const room = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = room;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.5));
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100000);
    scene.add(camera);
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1, 1.6, 2);
    camera.add(key);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener("change", draw);
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
    });
    renderer.domElement.addEventListener("pointerup", (e) => {
      const moved = down === null || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4;
      down = null;
      if (moved || model === null || onPick === null) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObject(model, true)[0];
      if (!hit) return;
      const local = model.worldToLocal(hit.point.clone());
      onPick([round(local.x), round(local.y), round(local.z)]);
    });
    new ResizeObserver(resize).observe(container);
  };

  const resize = () => {
    if (renderer === null) return;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };

  function draw() {
    if (renderer === null) return;
    renderer.render(scene, camera);
    const rect = container.getBoundingClientRect();
    pinLayer.replaceChildren();
    if (model === null) return;
    for (const pin of pins) {
      const at = model.localToWorld(new THREE.Vector3(...pin.point)).project(camera);
      if (at.z > 1) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `pin${pin.pending ? " pending" : ""}${pin.resolved ? " resolved" : ""}${pin.active ? " active" : ""}`;
      el.style.setProperty("--pin", pin.color);
      el.style.left = `${((at.x + 1) / 2) * rect.width}px`;
      el.style.top = `${((1 - at.y) / 2) * rect.height}px`;
      el.setAttribute("aria-label", pin.pending ? "New comment here" : `Comment ${pin.label}`);
      el.textContent = pin.label;
      if (pin.id) el.addEventListener("click", () => onPin?.(pin.id));
      pinLayer.appendChild(el);
    }
  }

  const show = (...children) => {
    stage.replaceChildren(...children);
    if (!stage.isConnected) container.replaceChildren(stage);
  };

  const frame = () => {
    if (home === null) return;
    camera.position.copy(home.position);
    controls.target.set(0, 0, 0);
    controls.update();
    draw();
  };

  return {
    message(text) {
      if (model !== null) scene.remove(model);
      model = null;
      note.textContent = text;
      show(note);
    },
    async showModel(buffer, ext) {
      ensure3d();
      const object = await parseModel(buffer, ext);
      addEdges(object);
      if (model !== null) scene.remove(model);
      model = new THREE.Group();
      model.add(object);
      const box = new THREE.Box3().setFromObject(object);
      object.position.sub(box.getCenter(new THREE.Vector3()));
      scene.add(model);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      camera.near = size / 1000;
      camera.far = size * 100;
      camera.updateProjectionMatrix();
      home = { position: new THREE.Vector3(size * 1.05, size * 0.75, size * 1.15) };
      const fit = document.createElement("button");
      fit.type = "button";
      fit.className = "stage-fit";
      fit.textContent = "Fit";
      fit.title = "Fit the model in view";
      fit.addEventListener("click", frame);
      const hint = document.createElement("span");
      hint.className = "stage-hint";
      hint.textContent =
        onPick === null
          ? "Drag to turn · scroll to zoom"
          : "Drag to turn · scroll to zoom · click the model to comment on a spot";
      show(renderer.domElement, pinLayer, fit, hint);
      resize();
      frame();
    },
    /** One part of an assembly drawn solid and the rest faint, or all solid for null. */
    highlight(node) {
      if (model === null) return;
      let picked = null;
      model.traverse((each) => {
        if (picked === null && node !== null && each.userData.node === node) picked = each;
      });
      const inside = new Set();
      picked?.traverse((each) => inside.add(each));
      model.traverse((each) => {
        if (!each.isMesh && !each.isLineSegments) return;
        each.userData.solid ??= each.material;
        const faint = picked !== null && !inside.has(each) && !inside.has(each.parent);
        if (!faint) {
          each.material = each.userData.solid;
          return;
        }
        each.userData.faint ??= [each.userData.solid].flat().map((m) => {
          const copy = m.clone();
          copy.transparent = true;
          copy.opacity = each.isLineSegments ? 0.08 : 0.14;
          copy.depthWrite = false;
          return copy;
        });
        each.material = Array.isArray(each.userData.solid)
          ? each.userData.faint
          : each.userData.faint[0];
      });
      draw();
    },
    /** A drawing's pages drawn with pdf.js, so it looks the same in every browser. */
    async showFile(blob, ext, name = "") {
      if (model !== null) scene.remove(model);
      model = null;
      if (["png", "jpg", "jpeg"].includes(ext)) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(blob);
        img.alt = name;
        img.className = "stage-img";
        show(img);
        return;
      }
      if (ext === "mp4") {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(blob);
        video.controls = true;
        video.className = "stage-img";
        show(video);
        return;
      }
      if (ext !== "pdf") {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${name}.${ext}`;
        link.textContent = `No preview for this file. Download ${name}`;
        note.replaceChildren(link);
        show(note);
        return;
      }
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        .promise;
      const pages = document.createElement("div");
      pages.className = "stage-doc";
      const width = Math.max(320, container.getBoundingClientRect().width - 48);
      for (let n = 1; n <= Math.min(doc.numPages, 20); n += 1) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * Math.min(window.devicePixelRatio, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${width}px`;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        pages.appendChild(canvas);
      }
      show(pages);
    },
    setPins(next) {
      pins = next;
      draw();
    },
  };
}
