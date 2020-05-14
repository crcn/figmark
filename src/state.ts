import * as fs from "fs";
import * as path from "path";
import { CONFIG_FILE_NAME } from "./constants";
const memoize = require("fast-memoize");
import {snakeCase} from "lodash";

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

export type Constraint = {
  type: "SCALE" | "WIDTH" | "HEIGHT",
  value: number,
}

export type ExportSettings = {
  suffix: string,
  format: string,
  constraint: Constraint
};

export type VectorNodeProps = {
  locked: boolean,
  blendMode: string,
  preserveRatio: boolean,
  exportSettings?: ExportSettings[],
  layoutAlign: "MIN" | "CENTER" | "MAX" | "STRETCH",
  constraints: LayoutConstraint,
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


export type Canvas = {
  backgroundColor: Color,
  exportSettings: ExportSettings[],
  children: Node[]
} & BaseNode<NodeType.Canvas>;


export type GroupNode = {
  children: Node[]
} & VectorNodeProps & BaseNode<NodeType.Group>;

export type VectorNode = {

} & VectorNodeProps & BaseNode<NodeType.Vector>;

export type RectangleNode = {
  cornerRadius: number,
  rectangleCornerRadii: number[]
} & VectorNodeProps & BaseNode<NodeType.Rectangle>;


export type Frame = {
  children: Node[]
} & VectorNodeProps & BaseNode<NodeType.Frame>;

type VectorLikeNode = Frame | VectorNode | RectangleNode;
export type Exportable = Frame | VectorNode | RectangleNode;
export type Node = Document | Canvas | GroupNode | Frame | VectorNode | RectangleNode;

export const hasVectorProps = (node: Node): node is VectorLikeNode => {
  return node.type === NodeType.Frame || node.type == NodeType.Rectangle || node.type == NodeType.Vector;
}

export const isExported = (node: Node): node is Exportable => {
  return node.type !== NodeType.Document && node.exportSettings?.length > 0;
}
export const readConfigSync = (cwd: string) => JSON.parse(fs.readFileSync(path.join(cwd, CONFIG_FILE_NAME), "utf8"));


export const flattenNodes = memoize((node: Node): Node[] => {
  return flattenNodes2(node)
}) as (node: Node) => Node[];

export const getNodeExportFileName = (nodeId: string, settings: ExportSettings) => `node-${nodeId.replace(":", "-")}@${settings.constraint.value}.${settings.constraint.type.toLowerCase()}`

const flattenNodes2 = (node: Node, allNodes: Node[] = []) => {
  allNodes.push(node);
  if ((node as any).children) {
    for (const child of (node as any).children) {
      flattenNodes2(child, allNodes);
    }
  }
  return allNodes;
};