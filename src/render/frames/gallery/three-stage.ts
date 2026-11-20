import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  Shape,
  SpotLight,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { ReelPlan } from '../../../types/reel-plan';
import { RenderError } from '../../errors';
import { createScratchCanvas, type RenderCanvas } from '../canvas';
import type { DecodedPhoto } from '../draw';
import {
  FRAME,
  MAT,
  ROOM,
  WALLS,
  add,
  cameraPoseAt,
  galleryPhotoIds,
  layoutGallery,
  scale,
  type GalleryLayout,
  type GalleryShot,
  type HungPhoto,
  type Slot,
} from './layout';
import type { GalleryStage, GalleryStageOptions } from './index';

// One fixed gallery room drawn with three.js: wood floor, pale walls with a dark accent wall at the
// back, a rug and a bench, and the user's photos in dark frames with a picture light each. Loaded
// only through loadGallery() (gallery/index.ts). Nothing here reads a clock or a random number, so
// a frame is a pure function of (plan, photos, shot, progress) like every other look. It uses no
// loader of three's: textures are made from the decoded photos and from canvases drawn here.

const { width: W, depth: D, height: H } = ROOM;
// A photo is uploaded no larger than this on its long edge: a texture size every phone GPU takes.
const MAX_TEXTURE_EDGE = 2048;

const lambert = (color: number, extra: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) =>
  new MeshLambertMaterial({ color, ...extra });

// Wood planks, drawn once from arithmetic (no randomness), tiled over the floor.
function woodTexture(makeCanvas: typeof createScratchCanvas): CanvasTexture {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const g = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!g) throw new RenderError('unsupported', '2d canvas context unavailable for the gallery');
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 173) % 256);
    while (x < size) {
      const len = 180 + ((((r * 97 + x * 13) % 140) + 140) % 140);
      const light = 34 + ((((r * 31 + x * 7) % 12) + 12) % 12);
      g.fillStyle = `hsl(28 38% ${light}%)`;
      g.fillRect(x, r * rowH, len, rowH);
      g.strokeStyle = 'rgba(40,22,8,0.12)';
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.moveTo(x, r * rowH + 8 + k * 12);
        g.lineTo(x + len, r * rowH + 10 + k * 12);
        g.stroke();
      }
      g.fillStyle = 'rgba(25,14,6,0.55)';
      g.fillRect(x, r * rowH, 2, rowH);
      x += len;
    }
    g.fillStyle = 'rgba(25,14,6,0.55)';
    g.fillRect(0, r * rowH, size, 2);
  }
  const texture = new CanvasTexture(canvas as OffscreenCanvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(W / 2, D / 2);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const rect = (path: Path, w: number, h: number): Path => {
  path.moveTo(-w / 2, -h / 2);
  path.lineTo(w / 2, -h / 2);
  path.lineTo(w / 2, h / 2);
  path.lineTo(-w / 2, h / 2);
  path.closePath();
  return path;
};

class ThreeGalleryStage implements GalleryStage {
  readonly canvas: RenderCanvas;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly textures = new Map<string, { texture: Texture; aspect: number }>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly frameMaterial = new MeshPhongMaterial({
    color: 0x17120e,
    shininess: 30,
    specular: 0x333333,
  });
  private readonly matMaterial = lambert(0xfbfaf6);
  private readonly fixtureMaterial = lambert(0x1c1c1e);
  private layout: GalleryLayout | null = null;
  private shots: GalleryShot[] = [];

  constructor(private readonly options: GalleryStageOptions) {
    const { width, height, look } = options;
    this.canvas = createScratchCanvas(width, height);
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      // The frame is read back right after render(), from a canvas nothing composites: keep it.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.camera = new PerspectiveCamera(look.fov, width / height, 0.05, 60);
    this.scene.background = new Color(0x14161a);
    this.materials.push(this.frameMaterial, this.matMaterial, this.fixtureMaterial);
    this.buildRoom();
  }

  private mesh(geometry: BufferGeometry, material: Material, parent: Object3D = this.scene): Mesh {
    const mesh = new Mesh(geometry, material);
    this.geometries.push(geometry);
    parent.add(mesh);
    return mesh;
  }

  private material<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private buildRoom(): void {
    const wood = woodTexture(createScratchCanvas);
    const floor = this.mesh(
      new PlaneGeometry(W, D),
      this.material(lambert(0xffffff, { map: wood })),
    );
    floor.rotation.set(-Math.PI / 2, 0, 0);
    const ceiling = this.mesh(new PlaneGeometry(W, D), this.material(lambert(0xf4f2ee)));
    ceiling.position.set(0, H, 0);
    ceiling.rotation.set(Math.PI / 2, 0, 0);
    // a lit panel in the ceiling, so looking up is not a grey void
    const panel = this.mesh(
      new PlaneGeometry(2.6, 1.2),
      this.material(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    );
    panel.position.set(0, H - 0.005, 0);
    panel.rotation.set(Math.PI / 2, 0, 0);

    const trim = this.material(lambert(0xf7f5f0));
    WALLS.forEach((wall, w) => {
      const group = new Group();
      group.position.set(wall.origin.x, 0, wall.origin.z);
      group.rotation.set(0, wall.rotationY, 0);
      this.scene.add(group);
      const colour = w === 0 ? 0x3f5560 : 0xe9e4da;
      this.mesh(
        new PlaneGeometry(wall.length, H),
        this.material(lambert(colour)),
        group,
      ).position.set(0, H / 2, 0);
      this.mesh(new BoxGeometry(wall.length, 0.12, 0.02), trim, group).position.set(0, 0.06, 0.01);
      this.mesh(new BoxGeometry(wall.length, 0.06, 0.03), trim, group).position.set(
        0,
        H - 0.03,
        0.015,
      );
    });

    const rug = this.mesh(new PlaneGeometry(3.6, 2.4), this.material(lambert(0x7d2f2a)));
    rug.rotation.set(-Math.PI / 2, 0, 0);
    rug.position.set(0, 0.006, 0);
    const rugInner = this.mesh(new PlaneGeometry(3.2, 2), this.material(lambert(0xc9b79a)));
    rugInner.rotation.set(-Math.PI / 2, 0, 0);
    rugInner.position.set(0, 0.011, 0);

    const wood2 = this.material(lambert(0x8a5a33));
    this.mesh(new BoxGeometry(1.6, 0.08, 0.45), wood2).position.set(0, 0.45, 0);
    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-0.17, 0.17]) {
        this.mesh(new BoxGeometry(0.05, 0.41, 0.05), this.fixtureMaterial).position.set(
          sx,
          0.205,
          sz,
        );
      }
    }

    this.scene.add(new HemisphereLight(0xffffff, 0x8a7560, 1.6));
    const key = new SpotLight(0xfff4e2, 30, 0, 1.1, 0.6, 2);
    key.position.set(0, H - 0.05, 0);
    key.target.position.set(0, 0, 0);
    this.scene.add(key, key.target);
  }

  async addPhoto(photoId: string, photo: DecodedPhoto): Promise<void> {
    const longEdge = Math.max(photo.width, photo.height);
    const k = Math.min(1, MAX_TEXTURE_EDGE / longEdge);
    // WebGL's own flip on upload (texture.flipY) is not applied to an ImageBitmap in every browser
    // (Chromium ignores it), so the bitmap is flipped here, where every browser honours it, and the
    // texture is told not to flip again. The same call shrinks a photo past the texture cap.
    const image = await createImageBitmap(photo.image as ImageBitmap, {
      imageOrientation: 'flipY',
      resizeWidth: Math.round(photo.width * k),
      resizeHeight: Math.round(photo.height * k),
      resizeQuality: 'high',
    });
    const texture = new Texture(image);
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    // Upload now, then the bitmap can go: the GPU holds the photo from here on.
    this.renderer.initTexture(texture);
    image.close();
    this.textures.set(photoId, { texture, aspect: photo.width / photo.height });
  }

  build(plan: ReelPlan): void {
    const ids = galleryPhotoIds(plan);
    const hung: HungPhoto[] = ids.map((photoId) => {
      const entry = this.textures.get(photoId);
      if (!entry) throw new RenderError('missing-photo', `no photo added for "${photoId}"`);
      return { photoId, aspect: entry.aspect };
    });
    this.layout = layoutGallery(hung, this.options.look);
    for (const slot of this.layout.slots) {
      const entry = this.textures.get(slot.photoId);
      if (entry) this.hang(slot, entry.texture);
    }
    this.shots = plan.shots.map((shot) => ({
      durationMs: shot.durationMs,
      slot: ids.indexOf(shot.photoId),
    }));
  }

  // The photo in its mat and dark frame, a plaque below, and its picture light on the ceiling.
  private hang(slot: Slot, texture: Texture): void {
    const wall = WALLS[slot.wall];
    if (!wall) throw new RangeError(`slot on wall ${slot.wall}, which does not exist`);
    const innerW = slot.width + 2 * MAT;
    const innerH = slot.height + 2 * MAT;
    const outerW = innerW + 2 * FRAME;
    const outerH = innerH + 2 * FRAME;
    const group = new Group();
    const on = add(slot.centre, scale(wall.normal, 0.003));
    group.position.set(on.x, on.y, on.z);
    group.rotation.set(0, wall.rotationY, 0);
    this.scene.add(group);

    const shape = rect(new Shape(), outerW, outerH) as Shape;
    shape.holes.push(rect(new Path(), innerW, innerH));
    this.mesh(
      new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }),
      this.frameMaterial,
      group,
    );
    this.mesh(new PlaneGeometry(innerW, innerH), this.matMaterial, group).position.set(0, 0, 0.028);
    this.mesh(
      new PlaneGeometry(slot.width, slot.height),
      this.material(new MeshBasicMaterial({ map: texture, toneMapped: false })),
      group,
    ).position.set(0, 0, 0.033);
    this.mesh(
      new BoxGeometry(0.16, 0.05, 0.008),
      this.material(new MeshPhongMaterial({ color: 0xd8c9a0, shininess: 60, specular: 0x555555 })),
      group,
    ).position.set(0, -outerH / 2 - 0.1, 0.004);

    const spot = new SpotLight(0xfff1dc, 14, 9, 0.5, 0.75, 2);
    const at = add(slot.centre, scale(wall.normal, 1.6));
    spot.position.set(at.x, H - 0.12, at.z);
    spot.target.position.set(slot.centre.x, slot.centre.y, slot.centre.z);
    this.scene.add(spot, spot.target);
    this.mesh(new CylinderGeometry(0.045, 0.06, 0.14, 12), this.fixtureMaterial).position.set(
      at.x,
      H - 0.07,
      at.z,
    );
  }

  render(shotIndex: number, progress: number): void {
    if (!this.layout) throw new RenderError('invalid-plan', 'the gallery stage was not built');
    const pose = cameraPoseAt(this.layout, this.shots, shotIndex, progress, this.options.look);
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const { texture } of this.textures.values()) texture.dispose();
    this.textures.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function createGalleryStage(options: GalleryStageOptions): GalleryStage {
  return new ThreeGalleryStage(options);
}
