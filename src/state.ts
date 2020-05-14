import * as fs from "fs";
import * as path from "path";
import { CONFIG_FILE_NAME } from "./constants";

export type Config = {
  fileKeys: string[],
  personalAccessToken: string,
  dest: string,

  // figmark-compiler-react, figmark-compiler-vue.
  // Is this is undefined, then Figmark will automatically pick an already installed compiler
  compiler?: string
};

// based on https://www.figma.com/developers/api
export enum NodeType {
  Document = "DOCUMENT",
  Rectangle = "RECTANGLE",
  Canvas = "CANVAS",
  Group = "GROUP",
  Frame = "FRAME",
  Vector = "VECTOR"
};

export type BaseNode<TType extends string> = {
  id: string,
  name: string,
  type: TType,
};

export type Color = {};
export type Paint = {};
export type LayoutConstraint = {};
export type EasingType = {};
export type Rectangle = {
  x: number,
  y: number,
  width: number,
  height: number
}
export type Effect = {};
export type Vector = { x: number, y: number };
export type Transform = [number, number, number][];
export type Path = {};
export type StyleType = "FILL" | "TEXT" | "EFFECT" | "GRID";

export type VectorNodeProps = {
  locked: boolean,
  exportSettings: ExportSettings[],
  blendMode: string,
  preserveRatio: boolean,
  layoutAlign: "MIN" | "CENTER" | "MAX" | "STRETCH",
  contraints: LayoutConstraint,
  transitionNodeID?: string,
  transitionDuration?: number,
  transitionEasing?: EasingType,
  opacity: number,
  absoluteBoundingBox: Rectangle,
  effects: Effect[],
  size: Vector,
  relativeTransformTransform: Transform,
  isMask: boolean,
  fills: Paint[],
  fillGeometry: Path[],
  strokes: Paint[],
  strokeWeight: number,
  strokeCap: string,
  strokeJoin: string,
  strokeDashes: number[],
  strokeMiterAngle: number[],
  strokeGeometry: Path[],
  strokeAlign: string,
  styles: Record<StyleType, String>
};

export type Document = {
  children: Node[]
} & BaseNode<NodeType.Document>;

export type ExportSettings = {

};

export type Canvas = {
  backgroundColor: Color,
  exportSettings: ExportSettings[],
  children: Node[]
} & BaseNode<NodeType.Canvas>;


export type GroupNode = {
  children: Node[]
} & BaseNode<NodeType.Group>;

export type VectorNode = {

} & VectorNodeProps & BaseNode<NodeType.Vector>;

export type RectangleNode = {
  cornerRadius: number,
  rectangleCornerRadii: number[]
} & VectorNodeProps & BaseNode<NodeType.Rectangle>;


export type Frame = {
  children: Node[]
} & VectorNodeProps & BaseNode<NodeType.Frame>;

export type Node = Document | Canvas | GroupNode | Frame | VectorNode | RectangleNode;

export const readConfigSync = (cwd: string) => JSON.parse(fs.readFileSync(path.join(cwd, CONFIG_FILE_NAME), "utf8"));
