// Small pictures for the file panel, made in the browser from the files themselves: a model or one
// part of an assembly drawn as the viewer draws it, a drawing's first page, a picture, a video's
// first frame. Made one at a time, only for rows on screen, and kept for the page's life.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as pdfjs from "pdfjs";
import { download } from "./hub.js";
import { addEdges, parseModel } from "./viewer.js";

const W = 240;
const H = 180;
const made = new Map();
const scenes = new Map();
let queue = Promise.resolve();
let gl = null;

/** A finished thumbnail's URL, or undefined while none is made yet. */
export const thumbNow = (key) => made.get(key);

function renderer() {
  if (gl !== null) return gl;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(W, H, false);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.5));
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 100000);
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(1, 1.6, 2);
  camera.add(key);
  scene.add(camera);
  gl = { r, scene, camera };
  return gl;
}

/** Draws an object from the viewer's own corner, filling the frame. */
function shoot(object) {
  const { r, scene, camera } = renderer();
  const holder = new THREE.Group();
  holder.add(object);
  const box = new THREE.Box3().setFromObject(object);
  object.position.sub(box.getCenter(new THREE.Vector3()));
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  camera.near = size / 1000;
  camera.far = size * 100;
  camera.position.set(size * 0.82, size * 0.58, size * 0.9);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  scene.add(holder);
  r.render(scene, camera);
  scene.remove(holder);
  return r.domElement.toDataURL("image/png");
}

async function sceneOf(file, ext) {
  if (!scenes.has(file.object)) {
    scenes.set(
      file.object,
      download(file.object)
        .then((blob) => blob.arrayBuffer())
        .then((buffer) => parseModel(buffer, ext)),
    );
  }
  return scenes.get(file.object);
}

async function modelThumb(file, ext, node) {
  const whole = await sceneOf(file, ext);
  whole.updateMatrixWorld(true);
  let source = whole;
  if (node !== null) {
    whole.traverse((each) => {
      if (source === whole && each.userData.node === node) source = each;
    });
    if (source === whole) return null;
  }
  // A part keeps its place in the assembly; drawn alone it is moved to the middle.
  const copy = source.clone();
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(source.matrixWorld);
  const object = new THREE.Group();
  object.add(copy);
  addEdges(copy);
  return shoot(object);
}

async function drawingThumb(file) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await (await download(file.object)).arrayBuffer()),
  }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (W * 2) / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  doc.destroy();
  return canvas.toDataURL("image/png");
}

async function videoThumb(file) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(await download(file.object));
  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener("error", reject, { once: true });
  });
  video.currentTime = Math.min(0.5, video.duration / 2 || 0);
  await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = Math.round((W * 2 * video.videoHeight) / (video.videoWidth || 1)) || H * 2;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(video.src);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Makes the thumbnail for `file` (or for one part of it, `node`) and resolves to its URL, or null
 * when there is none to make. Requests wait their turn, so a long list never stalls the page.
 */
export function makeThumb(key, file, ext, node = null) {
  if (made.has(key)) return Promise.resolve(made.get(key));
  const job = queue.then(async () => {
    if (made.has(key)) return made.get(key);
    let url = null;
    try {
      if (ext === "stl" || ext === "glb") url = await modelThumb(file, ext, node);
      else if (ext === "pdf") url = await drawingThumb(file);
      else if (["png", "jpg", "jpeg"].includes(ext)) {
        url = URL.createObjectURL(await download(file.object));
      } else if (ext === "mp4") url = await videoThumb(file);
    } catch {
      url = null;
    }
    made.set(key, url);
    return url;
  });
  queue = job.catch(() => {});
  return job;
}
