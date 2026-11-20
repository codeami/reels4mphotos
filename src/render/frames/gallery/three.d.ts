// three.js ships no type declarations, and @types/three would pull in six more packages. This
// declares only the part of three the gallery stage uses, loosely typed, and on purpose none of
// the loaders (FileLoader, TextureLoader, ImageBitmapLoader): they are the only parts of three
// that can make a network request, and with this file a call to one cannot type-check.
declare module 'three' {
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  export class Color {
    constructor(color?: number | string);
    r: number;
    g: number;
    b: number;
  }
  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    children: Object3D[];
    add(...objects: Object3D[]): this;
    lookAt(x: number, y: number, z: number): void;
    traverse(callback: (object: Object3D) => void): void;
  }
  export class Group extends Object3D {}
  export class Scene extends Object3D {
    background: Color | null;
  }
  export class Camera extends Object3D {}
  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    updateProjectionMatrix(): void;
  }
  export class BufferGeometry {
    dispose(): void;
  }
  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, segments?: number);
  }
  export class Path {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    closePath(): this;
  }
  export class Shape extends Path {
    holes: Path[];
  }
  export class ExtrudeGeometry extends BufferGeometry {
    constructor(shape: Shape, options: { depth: number; bevelEnabled: boolean });
  }
  export interface MaterialParameters {
    color?: number;
    map?: Texture | null;
    toneMapped?: boolean;
    emissive?: number;
    shininess?: number;
    specular?: number;
  }
  export class Material {
    dispose(): void;
  }
  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }
  export class MeshLambertMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }
  export class MeshPhongMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }
  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material);
    geometry: BufferGeometry;
    material: Material;
  }
  export class Texture {
    constructor(image?: ImageBitmap | OffscreenCanvas | HTMLCanvasElement);
    needsUpdate: boolean;
    flipY: boolean;
    colorSpace: string;
    anisotropy: number;
    wrapS: number;
    wrapT: number;
    repeat: { set(x: number, y: number): void };
    dispose(): void;
  }
  export class CanvasTexture extends Texture {}
  export class Light extends Object3D {}
  export class HemisphereLight extends Light {
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
  }
  export class SpotLight extends Light {
    constructor(
      color?: number,
      intensity?: number,
      distance?: number,
      angle?: number,
      penumbra?: number,
      decay?: number,
    );
    target: Object3D;
  }
  export class WebGLRenderer {
    constructor(parameters: {
      canvas: OffscreenCanvas | HTMLCanvasElement;
      antialias?: boolean;
      preserveDrawingBuffer?: boolean;
      powerPreference?: 'high-performance' | 'low-power' | 'default';
    });
    toneMapping: number;
    capabilities: { getMaxAnisotropy(): number };
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Object3D, camera: Camera): void;
    initTexture(texture: Texture): void;
    dispose(): void;
    forceContextLoss(): void;
  }
  export const SRGBColorSpace: string;
  export const RepeatWrapping: number;
  export const ACESFilmicToneMapping: number;
}
