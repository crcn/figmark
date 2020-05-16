// inspired by https://github.com/KarlRombauts/Figma-SCSS-Generator/blob/master/gradients.js
// https://github.com/figma/figma-api-demo/blob/533d556c853fad731f65c5c264dd8adc0eaf1b1b/figma-to-react/lib/figma.js
import {
  createTranslateContext,
  TranslateContext,
  addBuffer,
  startBlock,
  endBlock,
} from "./translate-utils";
import {
  Node,
  NodeType,
  Text,
  flattenNodes,
  getUniqueNodeName,
  RadialGradient,
  LinearGradient,
  Vector,
  hasChildren,
  Document,
  FrameProps,
  cleanupNodeId,
  Rectangle,
  getNodeById,
  getAllTextNodes,
  Color,
  FillType,
  Fill,
  SolidFill,
  VectorNodeProps,
  BaseNode,
  Effect,
} from "./state";
import { pascalCase, logWarn } from "./utils";
import * as chalk from "chalk";
const memoize = require("fast-memoize");

export const translateFigmaProjectToPaperclip = (file) => {
  let context = createTranslateContext();

  context = addBuffer(`\n<!--\n`, context);
  context = startBlock(context);
  context = addBuffer(`!! AUTO GENERATED, EDIT WITH CAUTION !!\n`, context);
  context = endBlock(context);
  context = addBuffer(`-->`, context);

  context = addBuffer(`\n\n<!-- STYLES -->\n\n`, context);
  context = translateStyles(file.document, context);

  context = addBuffer(`\n<!-- ALL LAYERS & COMPONENTS -->\n\n`, context);
  context = translateComponents(file.document, file.document, context);

  context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
  context = translatePreviews(file.document, context);
  // console.log(JSON.stringify(file, null, 2));
  console.log(context.buffer);
  // console.log(JSON.stringify(file, null, 2));
  return context.buffer;
};

const translateComponents = (
  node: Node,
  document: Document,
  context: TranslateContext
) => {
  context = translateComponent(node, document, context);

  if (!hasChildren(node) || node.type === NodeType.Instance) {
    return context;
  }

  for (const child of node.children) {
    context = translateComponents(child, document, context);
  }
  return context;
};

const translateComponent = (
  node: Node,
  document: Document,
  context: TranslateContext
) => {
  if (
    node.type === NodeType.Document ||
    node.type === NodeType.Canvas ||
    node.type === NodeType.Instance
  ) {
    return context;
  }

  const componentName = getNodeComponentName(node);
  if (node.type === NodeType.Vector) {
    context = addBuffer(
      `<svg export component as="${componentName}" data-with-absolute-layout={withAbsoluteLayout} className="${getNodeClassName(
        node,
        document
      )} {className?}">\n`,
      context
    );
    context = startBlock(context);
    // context = addBuffer(``)
    context = endBlock(context);
    context = addBuffer(`</svg>\n\n`, context);
  } else {
    const tagName = node.type === NodeType.Text ? `span` : `div`;

    context = addBuffer(
      `<${tagName} export component as="${componentName}" data-with-absolute-layout={withAbsoluteLayout} className="${getNodeClassName(
        node,
        document
      )} {className?}">\n`,
      context
    );
    context = startBlock(context);
    context = addBuffer(`{children}\n`, context);
    context = endBlock(context);
    context = addBuffer(`</${tagName}>\n\n`, context);
  }
  return context;
};
const translatePreviews = (document: Document, context: TranslateContext) => {
  const canvas = document.children[0];

  if (!hasChildren(canvas)) {
    return;
  }

  for (const child of canvas.children) {
    context = translatePreview(child, document, context);

    // some space between previews
    context = addBuffer(`\n`, context);
  }

  return context;
};

const getPreviewComponentName = (nodeId: string, document: Document) =>
  "_" +
  pascalCase(getNodeById(nodeId, document).name + "_" + cleanupNodeId(nodeId));

const translatePreview = (
  node: Node,
  document: Document,
  context: TranslateContext,
  inComponent?: boolean
) => {
  if (node.type === NodeType.Instance) {
    context = translateInstancePreview(
      node,
      document,
      node.componentId,
      context
    );
  } else {
    context = addBuffer(
      `<${getNodeComponentName(node)} withAbsoluteLayout`,
      context
    );
    const isComponent = node.type === NodeType.Component;

    if (isComponent) {
      context = addBuffer(
        ` component as="${getPreviewComponentName(node.id, document)}"`,
        context
      );
      inComponent = true;
    }

    context = addBuffer(`>\n`, context);
    context = startBlock(context);
    if (node.type === NodeType.Text) {
      if (inComponent) {
        context = addBuffer(
          `{_${getUniqueNodeName(node, document)}_text}\n`,
          context
        );
      } else {
        context = addBuffer(
          `${translateTextCharacters(node.characters)}\n`,
          context
        );
      }
    } else if (hasChildren(node)) {
      for (const child of node.children) {
        context = translatePreview(child, document, context, inComponent);
      }
    }
    context = endBlock(context);
    context = addBuffer(`</${getNodeComponentName(node)}>\n`, context);

    if (isComponent) {
      context = addBuffer(`\n`, context);
      context = translateInstancePreview(
        node,
        document,
        node.id,
        context,
        false
      );
    }
  }
  return context;
};

const translateTextCharacters = (characters: string) => {
  return characters.replace(/[\n\r]+/g, " <br /> ");
};

const translateInstancePreview = (
  node: Node,
  document: Document,
  componentId: string,
  context: TranslateContext,
  includeClasses: boolean = true
) => {
  context = addBuffer(
    `<${getPreviewComponentName(componentId, document)} withAbsoluteLayout`,
    context
  );
  if (includeClasses) {
    context = addBuffer(
      ` className="${getNodeClassName(node, document)}"`,
      context
    );
  }
  for (const textNode of getAllTextNodes(node)) {
    context = addBuffer(
      ` ${getUniqueNodeName(
        textNode,
        document
      )}_text={<>${translateTextCharacters(textNode.characters)}</>}`,
      context
    );
  }
  context = addBuffer(` />\n`, context);
  return context;
};

const translateStyles = (document: Document, context: TranslateContext) => {
  const allNodes: Node[] = flattenNodes(document);
  context = addBuffer(`<style>\n`, context);
  context = startBlock(context);
  for (const node of document.children) {
    context = translateClassNames(
      getNestedCSSStyles(
        node,
        document,
        node.type === NodeType.Instance ? node.componentId : null
      ),
      document,
      context,
      false
    );
  }
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context;
};

const translateClassNames = (
  info: ComputedNestedStyleInfo,
  document: Document,
  context: TranslateContext,
  isNested: boolean,
  instanceOfId?: string
) => {
  if (info.node.type === NodeType.Canvas) {
    return info.children.reduce(
      (context, childInfo) =>
        translateClassNames(childInfo, document, context, false),
      context
    );
  }

  if (!containsStyle(info)) {
    return context;
  }

  const nodeSelector = `.${getNodeClassName(info.node, document)}`;

  if (isNested) {
    context = addBuffer(`& > :global(${nodeSelector}) {\n`, context);
  } else {
    context = addBuffer(`:global(${nodeSelector}) {\n`, context);
  }

  context = startBlock(context);

  // TODO - for component instances, filter out props that match
  // component props

  // TODO - get CSS props ins
  for (const key in info.style) {
    if (isLayoutDeclaration(key)) {
      continue;
    }
    context = addBuffer(`${key}: ${info.style[key]};\n`, context);
  }

  // ABS layout should be opt-in since it's non-responsive.
  context = addBuffer(`&[data-with-absolute-layout] {\n`, context);
  context = startBlock(context);
  for (const key in info.style) {
    if (isLayoutDeclaration(key)) {
      context = addBuffer(`${key}: ${info.style[key]};\n`, context);
    }
  }

  context = endBlock(context);
  context = addBuffer(`}\n`, context);

  context = info.children.reduce(
    (context, child) => translateClassNames(child, document, context, true),
    context
  );
  context = endBlock(context);
  context = addBuffer(`}\n\n`, context);
  return context;
};

const isLayoutDeclaration = (key: string) =>
  /position|left|top|width|height/.test(key);

// TODO - need to use compoennt name
const getNodeClassName = (node: Node, document: Document) => {
  const nodeName = getUniqueNodeName(node, document);
  return (isNaN(Number(nodeName.charAt(0))) ? "" : "_") + nodeName;
};

// TODO - need to use compoennt name
const getNodeComponentName = (node: Node) => {
  return pascalCase(node.name);
};

export type ComputedNestedStyleInfo = {
  node: Node;
  style: Record<string, string | number>;
  children: ComputedNestedStyleInfo[];
};

const getNestedCSSStyles = (
  node: Node,
  document: Document,
  instanceOfId?: string
): ComputedNestedStyleInfo => {
  const nodeStyle = getCSSStyle(node, document, instanceOfId);
  return {
    node,
    style: nodeStyle,
    children: hasChildren(node)
      ? node.children.map((child) => {
          return getNestedCSSStyles(child, document, instanceOfId);
        })
      : [],
  };
};

const containsStyle = memoize(
  (
    info: ComputedNestedStyleInfo,
    document: Document,
    instanceOfId?: string
  ) => {
    if (Object.keys(info.style).length > 0) {
      return true;
    }
    for (const child of info.children) {
      if (containsStyle(child, document, instanceOfId)) {
        return true;
      }
    }
    return false;
  }
);

const getCSSStyle = (node: Node, document: Document, instanceOfId?: string) => {
  const style: Record<string, string | number> = {};

  console.log(JSON.stringify(node, null, 2));

  if (node.type === NodeType.Text) {
    Object.assign(style, getPositionStyle(node));
    Object.assign(style, getTextStyle(node));

    const containsNonSolifFill = node.fills.some(
      (fill) => fill.type !== FillType.SOLID
    );

    if (containsNonSolifFill) {
      logNodeWarning(node, `cannot translate non-solid text color to CSS`);
    }

    // text color must be solid, so search for one
    const solidFill = node.fills.find(
      (fill) => fill.type === FillType.SOLID
    ) as SolidFill;
    if (solidFill) {
      style.color = getCSSRGBAColor(solidFill.color);
    }
  } else if (node.type === NodeType.Group) {
  } else if (node.type === NodeType.Rectangle) {
    Object.assign(style, getPositionStyle(node));
    Object.assign(style, getVectorStyle(node));
  } else if (node.type === NodeType.Frame) {
    Object.assign(style, getPositionStyle(node));
    Object.assign(style, getFrameStyle(node));
  } else {
    logWarn(`Can't generate styles for ${node.type}`);
  }

  return style;
};

const getVectorStyle = (node: VectorNodeProps & BaseNode<any>) => {
  const style: any = {};
  if (node.fills.length) {
    const value = getFillStyleValue(node, node.fills);
    if (value) {
      style.background = value;
      const containsBlendModes = node.fills.some((fill) => {
        return fill.blendMode !== "NORMAL";
      });

      if (containsBlendModes) {
        style["background-blend-mode"] = node.fills
          .map((fill) => {
            return BLEND_MODE_MAP[fill.blendMode];
          })
          .join(", ");
      }
    }
  }
  if (node.blendMode && BLEND_MODE_MAP[node.blendMode]) {
    style["mix-blend-mode"] = BLEND_MODE_MAP[node.blendMode];
  }
  if (node.strokes.length) {
    const containsInvalidStroke =
      node.strokes.some((stroke) => {
        return stroke.type !== FillType.SOLID;
      }) || node.strokes.length > 1;

    const solidStroke = node.strokes.find(
      (stroke) => stroke.type === FillType.SOLID
    ) as SolidFill;

    if (containsInvalidStroke) {
      logNodeWarning(node, `Only one solid fill stroke is suppoered`);
    }

    if (solidStroke) {
      style.border = `${node.strokeWeight}px solid ${getCSSRGBAColor(
        solidStroke.color
      )}`;
    }
  }

  if (node.effects.length) {
    Object.assign(style, getEffectsStyle(node, node.effects));
  }

  if (node.opacity != null) {
    style.opacity = node.opacity;
  }

  return style;
};

const getEffectsStyle = (node: Node, effects: Effect[]) => {
  const newStyle = {};
  const visibleEffects = effects.filter((effect) => effect.visible !== false);
  const dropShadows = visibleEffects.filter(
    (effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW"
  );

  if (dropShadows.length) {
    newStyle["box-shadow"] = dropShadows
      .map(({ type, offset, radius, color }) => {
        return `${type === "INNER_SHADOW" ? "inset" : ""} ${offset.x}px ${
          offset.y
        }px ${radius}px ${getCSSRGBAColor(color)}`;
      })
      .join(", ");
  }

  const layerBlur = visibleEffects.find(
    (effect) => effect.type === "LAYER_BLUR"
  );

  if (layerBlur) {
    newStyle["filter"] = `blur(${layerBlur.radius}px)`;
  }

  const backgroundBlur = visibleEffects.find(
    (effect) => effect.type === "BACKGROUND_BLUR"
  );

  if (layerBlur) {
    logNodeWarning(
      node,
      `Contains background blur which has minimal CSS support`
    );
    newStyle["backdrop-filter"] = `blur(${backgroundBlur.radius}px)`;
  }

  return newStyle;
};

const getFrameStyle = (node: FrameProps & BaseNode<any>) => {
  const style: any = {};
  Object.assign(style, getVectorStyle(node));
  if (node.clipsContent) {
    style.overflow = "hidden";
  }
  return style;
};

const getPositionStyle = ({
  absoluteBoundingBox: { x, y, width, height },
}: {
  absoluteBoundingBox: Rectangle;
}) => ({
  position: "absolute",
  left: Math.round(x) + "px",
  top: Math.round(y) + "px",
  width: Math.round(width) + "px",
  height: Math.round(height) + "px",
});

const getFillStyleValue = (node: Node, fills: Fill[]) =>
  fills
    .reverse()
    .filter((fill) => fill.visible !== false)
    .map((fill, index) => {
      switch (fill.type) {
        case FillType.SOLID: {
          return getCSSRGBAColor(fill.color, index === fills.length - 1);
        }
        case FillType.GRADIENT_LINEAR: {
          return getCSSLinearGradient(fill);
        }
        case FillType.GRADIENT_RADIAL: {
          return getCSSRadialGradient(fill);
        }
        default: {
          // TODO - all gradient fills should work
          logNodeWarning(node, `Cannot translate ${fill.type} fill to CSS`);
          return null;
        }
      }
    })
    .filter(Boolean)
    .join(", ");

const getCSSRGBAColor = ({ r, g, b, a }: Color, last: boolean = true) => {
  const r2 = Math.round(r * 255);
  const g2 = Math.round(g * 255);
  const b2 = Math.round(b * 255);

  // TODO - generate hash
  let color;
  if (a !== 1) {
    color = `rgba(${r2}, ${g2}, ${b2}, ${a})`;
  } else {
    color = rgbToHex(r2, g2, b2);
  }

  return last ? color : `linear-gradient(0deg, ${color}, ${color})`;
};

const STYLE_MAP = {
  fontFamily: "font-family",
  fontWeight: "font-weight",
  fontSize: "font-size",
  letterSpacing: "letter-spacing",
};

const BLEND_MODE_MAP = {
  NORMAL: "normal",
  DARKEN: "darken",
  MULTIPLY: "multiply",
  COLOR_BURN: "color-burn",
  LIGHTEN: "lighten",
  SCREEN: "screen",
  COLOR_DODGE: "color-dodge",
  OVERLAY: "overlay",
  SOFT_LIGHT: "soft-light",
  HARD_LIGHT: "hard-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  LUMINOSITY: "luminosity",
  SATURATION: "saturation",
  COLOR: "color",
};

const TEXT_DECORATION_MAP = {
  STRIKETHROUGH: "line-through",
  UNDERLINE: "underline",
};

const TEXT_TRANSFORM_MAP = {
  UPPER: "uppercase",
  LOWER: "lowercase",
  TITLE: "capitalize",
};

const LETTER_CASE_LABEL_MAP = {};

const TEXT_ALIGN_VERTICAL_MAP = {
  BOTTOM: "flex-end",
  CENTER: "center",
};

const getTextStyle = (node: Text) => {
  const style = node.style;
  const newStyle: any = {};

  if (style.textAlignVertical !== "TOP") {
    newStyle.display = "flex";
    newStyle["align-items"] = TEXT_ALIGN_VERTICAL_MAP[style.textAlignVertical];
  }

  if (style.fontFamily) {
    newStyle["font-family"] = style.fontFamily;
  }
  if (style.fontWeight) {
    newStyle["font-weight"] = style.fontWeight;
  }
  if (style.fontSize) {
    newStyle["font-size"] = style.fontSize + "px";
  }
  if (style.letterSpacing) {
    newStyle["letter-spacing"] =
      (Number(style.letterSpacing) / Number(style.fontSize)).toFixed(3) + "em";
  }

  if (style.lineHeightPercentFontSize) {
    newStyle["line-height"] =
      Math.round(Number(style.lineHeightPercentFontSize)) + "%";
  }

  if (style.textAlignHorizontal) {
    newStyle["text-align"] = String(style.textAlignHorizontal).toLowerCase();
  }

  if (style.textDecoration) {
    newStyle["text-decoration"] = TEXT_DECORATION_MAP[
      style.textDecoration
    ].toLowerCase();
  }

  if (style.paragraphIndent) {
    newStyle["text-indent"] =
      Number(Number(style.paragraphIndent).toFixed(2)) + "px";
  }

  if (style.textCase) {
    const transform = TEXT_TRANSFORM_MAP[style.textCase];
    if (transform) {
      newStyle["text-transform"] = transform;
    } else {
      logCannotConvertCssWarning(node, [
        "Text",
        "Letter Case",
        "Case",
        LETTER_CASE_LABEL_MAP[style.textCase] || style.textCase,
      ]);
    }
  }

  if (style.opentypeFlags) {
    const fontFeatureSettings = Object.keys(style.opentypeFlags).map(
      (key) => `"${key.toLowerCase()}" on`
    );
    newStyle["font-featutes-settings"] = fontFeatureSettings.join(", ");
  }

  if (style.paragraphSpacing) {
    logCannotConvertCssWarning(node, ["Text", "Paragraph Spacing"]);
  }

  return newStyle;
};

const getCSSLinearGradient = ({
  gradientHandlePositions,
  gradientStops,
}: LinearGradient) => {
  // TODO: https://github.com/crcn/figmark/issues/12
  const radians = calcGradiantHandleRadians(gradientHandlePositions);
  return `linear-gradient(${radians}rad, ${gradientStops
    .map((stop) => {
      return `${getCSSRGBAColor(stop.color)} ${stop.position * 100}%`;
    })
    .join(", ")})`;
};

const getCSSRadialGradient = ({ gradientStops }: RadialGradient) => {
  // TODO: https://github.com/crcn/figmark/issues/13
  return `radial-gradient(${gradientStops
    .map((stop) => {
      return `${getCSSRGBAColor(stop.color)} ${stop.position * 100}%`;
    })
    .join(", ")})`;
};

const calcGradiantHandleRadians = ([first, second]: Vector[]) => {
  const ydiff = second.y - first.y;
  const xdiff = first.x - second.x;
  const radians = Math.atan2(-xdiff, -ydiff);
  console.log("RAD", radians);
  return Number(radians.toFixed(3));
};
const calcGradent = (start: Vector, end: Vector) => {
  return ((end.y - start.y) / (end.x - start.x)) * -1;
};
const radToDeg = (radian: number) => radian * (180 / Math.PI);

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};
const logNodeWarning = (node: Node, message: string) => {
  logWarn(`Layer ${chalk.bold(node.name)}: ${message}`);
};

const highlightSectionInfo = (...path: string[]) =>
  chalk.bold(path.join(" ► "));
const logCannotConvertCssWarning = (node: Node, path: string[]) =>
  logNodeWarning(
    node,
    `Cannot convert ${highlightSectionInfo(...path)} to CSS`
  );
