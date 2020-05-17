import * as fs from "fs";
import * as path from "path";
import { CONFIG_FILE_NAME } from "./constants";
import {memoize} from "./memo";
import { camelCase } from "lodash";

export type FileConfig = {
  key: string;
  version?: string;
};

export type CompilerOptions = {
  includeAbsoluteLayout?: boolean;
  includePreviews?: boolean;
};

export type Config = {
  fileNameFormat?: FileNameFormat;
  teamId?: string;
  personalAccessToken: string;
  dest: string;
  fileVersions?: Record<string, string>;
  compilerOptions: CompilerOptions;
};

export type Project = {
  id: number;
  name: string;
  files: ProjectFile[];
};

export type ProjectFile = {
  key: string;
  name: string;
};

export enum FileNameFormat {
  Preserve = "preserve",
  CamelCase = "camel-case",
  PascalCase = "pascal-case",
  SnakeCase = "snake-case",
  KebabCase = "kebab-case",
}

// based on https://www.figma.com/developers/api
export enum NodeType {
  Document = "DOCUMENT",
  Rectangle = "RECTANGLE",
  Ellipse = "ELLIPSE",
  Star = "STAR",
  REGULAR_POLYGON = "REGULAR_POLYGON",
  Line = "LINE",
  Canvas = "CANVAS",
  Group = "GROUP",
  Frame = "FRAME",
  Vector = "VECTOR",
  Instance = "INSTANCE",
  Component = "COMPONENT",
  Text = "TEXT",
}

export type BaseNode<TType extends string> = {
  id: string;
  name: string;
  type: TType;
};

export type Color = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type Paint = {
  blendMode: string;
  type: string;
  color: Color;
};

export type LayoutConstraint = {};
export type EasingType = {};
export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Effect = any;
export type Vector = { x: number; y: number };
export type Transform = [number, number, number][];
export type Path = {};
export type StyleType = "FILL" | "TEXT" | "EFFECT" | "GRID";

export type Constraint = {
  type: "SCALE" | "WIDTH" | "HEIGHT";
  value: number;
};

export type ExportSettings = {
  suffix: string;
  format: string;
  constraint: Constraint;
};

export enum FillType {
  SOLID = "SOLID",
  GRADIENT_LINEAR = "GRADIENT_LINEAR",
  GRADIENT_RADIAL = "GRADIENT_RADIAL",
  GRADIENT_ANGULAR = "GRADIENT_ANGULAR",
  DIAMOND_GRADIENT = "DIAMOND_GRADIENT",
  IMAGE = "IMAGE",
}

type BaseFill<TType extends FillType> = {
  visible?: boolean;
  blendMode: string;
  type: TType;
};

export type SolidFill = {
  blendMode: string;
  color: Color;
} & BaseFill<FillType.SOLID>;

export type ImageFill = {
  blendMode: string;
  scaleMode: string;
  imageRef: string;
} & BaseFill<FillType.IMAGE>;

export type GradientStop = {
  color: Color;
  position: number;
};

export type LinearGradient = {
  gradientHandlePositions: Vector[];
  gradientStops: GradientStop[];
} & BaseFill<FillType.GRADIENT_LINEAR>;

export type RadialGradient = {
  gradientHandlePositions: Vector[];
  gradientStops: GradientStop[];
} & BaseFill<FillType.GRADIENT_RADIAL>;

export type AngularGradient = {
  gradientHandlePositions: Vector[];
  gradientStops: GradientStop[];
} & BaseFill<FillType.GRADIENT_ANGULAR>;

export type DiamondGradient = {
  gradientHandlePositions: Vector[];
  gradientStops: GradientStop[];
} & BaseFill<FillType.DIAMOND_GRADIENT>;

export type Fill =
  | SolidFill
  | LinearGradient
  | RadialGradient
  | AngularGradient
  | DiamondGradient
  | ImageFill;

export type VectorNodeProps = {
  locked: boolean;
  blendMode: string;
  preserveRatio: boolean;
  exportSettings?: ExportSettings[];
  layoutAlign: "MIN" | "CENTER" | "MAX" | "STRETCH";
  constraints: LayoutConstraint;
  transitionNodeID?: string;
  transitionDuration?: number;
  transitionEasing?: EasingType;
  opacity: number;
  absoluteBoundingBox: Rectangle;
  effects: Effect[];
  size: Vector;
  relativeTransform: Transform;
  isMask: boolean;
  fills: Fill[];
  fillGeometry: Path[];
  strokes: Fill[];
  strokeWeight: number;
  strokeCap: string;
  strokeJoin: string;
  strokeDashes: number[];
  strokeMiterAngle: number[];
  strokeGeometry: Path[];
  strokeAlign: string;
  styles: Record<StyleType, String>;
};

export type Document = {
  children: Node[];
} & BaseNode<NodeType.Document>;

export type Canvas = {
  backgroundColor: Color;
  exportSettings: ExportSettings[];
  children: Node[];
} & BaseNode<NodeType.Canvas>;

export type Text = {
  characters: string;
  style: Record<string, string | number>;
} & VectorNodeProps &
  BaseNode<NodeType.Text>;

export type GroupNode = {
  children: Node[];
} & VectorNodeProps &
  BaseNode<NodeType.Group>;

export type VectorNode = {} & VectorNodeProps & BaseNode<NodeType.Vector>;

export type RectangleNode = {
  cornerRadius: number;
  rectangleCornerRadii: number[];
} & VectorNodeProps &
  BaseNode<NodeType.Rectangle>;

export type EllipseNode = {} & VectorNodeProps & BaseNode<NodeType.Ellipse>;
export type StarNode = {} & VectorNodeProps & BaseNode<NodeType.Star>;
export type RegularPolygonNode = {} & VectorNodeProps &
  BaseNode<NodeType.REGULAR_POLYGON>;

export type LineNode = {} & VectorNodeProps & BaseNode<NodeType.Line>;

export type FrameProps = {
  children: Node[];
  clipsContent: boolean;
} & VectorNodeProps;

export type Frame = FrameProps & BaseNode<NodeType.Frame>;

export type Instance = {
  componentId: string;
} & FrameProps &
  BaseNode<NodeType.Instance>;

export type Component = {} & FrameProps & BaseNode<NodeType.Component>;

type VectorLikeNode = Frame | VectorNode | RectangleNode;
export type Exportable = Frame | VectorNode | RectangleNode;
export type Parent = Frame | GroupNode | Document | Canvas | Instance;
export type Node =
  | Document
  | Canvas
  | GroupNode
  | Frame
  | VectorNode
  | RectangleNode
  | RegularPolygonNode
  | StarNode
  | EllipseNode
  | LineNode
  | Instance
  | Text
  | Component;

export const hasVectorProps = (node: Node): node is VectorLikeNode => {
  return (
    node.type === NodeType.Frame ||
    node.type == NodeType.Rectangle ||
    node.type == NodeType.Vector ||
    node.type == NodeType.Instance
  );
};

export const isExported = (node: Node): node is Exportable => {
  return node.type !== NodeType.Document && node.exportSettings?.length > 0;
};
export const readConfigSync = (cwd: string) =>
  JSON.parse(fs.readFileSync(path.join(cwd, CONFIG_FILE_NAME), "utf8"));

export const flattenNodes = memoize((node: Node): Node[] => {
  return flattenNodes2(node);
}) as (node: Node) => Node[];

export const getNodeById = memoize(
  (nodeId: string, document: Document): Node => {
    return flattenNodes(document).find((node) => node.id === nodeId);
  }
);

export const getAllTextNodes = memoize((parent: Node): Text[] => {
  return flattenNodes(parent).filter(
    (node) => node.type === NodeType.Text
  ) as Text[];
}) as (parent: Node) => Text[];

export const hasChildren = (node: Node): node is Parent => {
  return (node as any).children?.length > 0;
};

export const getNodeExportFileName = (
  node: Node,
  document: Document,
  settings: ExportSettings
) =>
  `node-${getUniqueNodeName(node, document)}@${
    settings.constraint.value
  }.${settings.format.toLowerCase()}`;
export const getUniqueNodeName = (node: Node, document: Document) => {
  const nodesThatShareName = flattenNodes(document)
    .filter((child) => child.name === node.name)
    .sort((a, b) => {
      // move components to the
      if (a.type === NodeType.Component) return -1;
      if (b.type === NodeType.Component) return 1;
      return 0;
    });

  let prefix = '';
  const ownerComponent = getOwnerComponent(node, document);

  if (ownerComponent) {
    prefix = getUniqueNodeName(ownerComponent, document) + "_";
  }

  // don't allow numbers in node names
  prefix += !node.name || isNaN(Number(node.name.charAt(0))) ? "" : "_";

  // first instance doesn't use postfix
  const postfix =
    nodesThatShareName.length > 1 && nodesThatShareName[0] !== node
      ? nodesThatShareName.indexOf(node) + 1
      : "";

  return prefix + camelCase(node.name + postfix);
};

export const getNodePath = (node: Node, root: Node) => {
  return findNodePath(node, root);
};

export const getNodeByPath = (path: number[], root: any) => {
  let curr = root;
  for (const part of path) {
    curr = curr.children[part];
  }
  return curr;
};

const findNodePath = (node: Node, current: any, path: number[] = []) => {
  if (current === node) {
    return path;
  }
  if (current.children) {
    for (let i = 0, { length } = current.children; i < length; i++) {
      const child = current.children[i];
      const foundPath = findNodePath(node, child, [...path, i]);
      if (foundPath) {
        return foundPath;
      }
    }
  }
  return null;
};

export const getOwnerComponent = (node: Node, document: Document) => {
  if (node.type === NodeType.Component) {
    return null;
  }
  const ancestors = getNodeAncestors(node, document);
  for (const ancestor of ancestors) {
    if (ancestor.type === NodeType.Component) {
      return ancestor;
    }
  }
  return null;
};

export const cleanupNodeId = (nodeId: string) => nodeId.replace(/[:;]/g, "");

export const getNodeAncestors = (node: Node, document: Document): Node[] => {
  const childParentMap = getChildParentMap(document);
  const ancestors = [];
  let current = node;
  while(true) {
    current = childParentMap[current.id];
    if (!current) {
      break;
    }
    ancestors.push(current);
  }

  return ancestors;
};

const getChildParentMap = memoize((document: Document) => {
  const allNodes = flattenNodes(document);

  const childParentMap = {};
  for (const node of allNodes) {
    if ((node as any).children) {
      for (const child of (node as any).children) {
        childParentMap[child.id] = node;
      }
    }
  }

  return childParentMap;
});


const flattenNodes2 = (node: Node, allNodes: Node[] = []) => {
  allNodes.push(node);
  if ((node as any).children) {
    for (const child of (node as any).children) {
      flattenNodes2(child, allNodes);
    }
  }
  return allNodes;
};
