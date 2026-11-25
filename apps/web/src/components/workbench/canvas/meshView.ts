import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Where every card's camera looks from: one turn of any card turns them all, for comparing. */
export interface ViewAngle {
  /** Around the vertical, in radians. */
  readonly azimuth: number;
  /** Above the horizon, in radians. */
  readonly elevation: number;
}

export const START_ANGLE: ViewAngle = { azimuth: (-3 * Math.PI) / 4, elevation: Math.PI / 5 };

/** An option's mesh as read: its overall size in millimetres along X, Y and Z (Z up). */
export interface MeshSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The radius of the sphere around it, in millimetres, for drawing options at one scale. */
  readonly radius: number;
}

const FIELD_OF_VIEW = 30;

/**
 * One card's 3D view: a GLB the CAD tools exported (glTF, metres, Y up), drawn with its parts'
 * colours and its sharp edges. It draws only when asked (`draw`), never in a loop: the board can
 * hold many cards, and a view that repaints every frame would keep the GPU busy for nothing.
 */
export class MeshView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 100_000);
  private readonly model = new Group();
  private center = new Vector3();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1.4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.8);
    rim.position.set(-1.5, 0.6, -1);
    this.scene.add(rim);
    // glTF is Y up in metres; the board shows Z up in millimetres, as the CAD view does.
    this.model.scale.setScalar(1000);
    this.scene.add(this.model);
  }

  /** Reads the GLB's bytes and puts its parts on the stage; its size, measured from the mesh. */
  async load(bytes: ArrayBuffer, dark: boolean): Promise<MeshSize> {
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    if (this.disposed) throw new Error("The view was closed.");
    this.model.clear();
    const edges = new LineBasicMaterial({
      color: dark ? 0xe6e8ec : 0x1d2027,
      transparent: true,
      opacity: dark ? 0.32 : 0.38,
    });
    gltf.scene.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      const material = object.material;
      if (material instanceof MeshStandardMaterial) {
        material.metalness = Math.min(material.metalness, 0.35);
        material.roughness = Math.max(material.roughness, 0.45);
      } else {
        object.material = new MeshStandardMaterial({ color: new Color(0xb9bec7), roughness: 0.55 });
      }
      object.add(new LineSegments(new EdgesGeometry(object.geometry, 28), edges));
    });
    this.model.add(gltf.scene);
    this.model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(this.model);
    const sphere = box.getBoundingSphere(new Sphere());
    this.center = sphere.center;
    const size = box.getSize(new Vector3());
    // Y up in the scene is Z up on the part.
    return { x: size.x, y: size.z, z: size.y, radius: sphere.radius };
  }

  /** Draws the stage from `angle`, framing a sphere of `radius` millimetres around the part. */
  draw(angle: ViewAngle, radius: number, width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const half = (FIELD_OF_VIEW * Math.PI) / 360;
    const fit = Math.min(1, this.camera.aspect);
    const distance = (radius * 1.12) / Math.sin(half * fit);
    const { azimuth, elevation } = angle;
    this.camera.position.set(
      this.center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      this.center.y + distance * Math.sin(elevation),
      this.center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.near = Math.max(distance / 100, 0.1);
    this.camera.far = distance * 10;
    this.camera.lookAt(this.center);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.model.traverse((object) => {
      if (object instanceof Mesh || object instanceof LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** A drag of `dx`, `dy` pixels turns the view this far, the elevation kept off the poles. */
export function turned(angle: ViewAngle, dx: number, dy: number): ViewAngle {
  const limit = Math.PI / 2 - 0.05;
  return {
    azimuth: angle.azimuth - dx * 0.01,
    elevation: Math.max(-limit, Math.min(limit, angle.elevation + dy * 0.01)),
  };
}
