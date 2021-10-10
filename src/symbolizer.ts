// @ts-ignore
import Point from "@mapbox/point-geometry";
import { GeomType, Feature, Bbox } from "./tilecache";
// @ts-ignore
import polylabel from "polylabel";
import { NumberAttr, StringAttr, TextAttr, FontAttr } from "./attribute";
import { linebreak, isCjk } from "./text";
import { lineCells, simpleLabel } from "./line";
import { Index, Label, Layout } from "./labeler";

let batch_size = Infinity;
if (
  typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().indexOf("webkit") >= 0
) {
  // https://bugs.webkit.org/show_bug.cgi?id=230751
  batch_size = 200;
}

export interface PaintSymbolizer {
  before?(ctx: any, z: number): void;
  draw(ctx: any, geom: Point[][], z: number, feature: Feature): void;
}

export enum Justify {
  Left = 1,
  Center = 2,
  Right = 3,
}

export enum TextPlacements {
  N = 1,
  NE = 2,
  E = 3,
  SE = 4,
  S = 5,
  SW = 6,
  W = 7,
  NW = 8
}

export interface DrawExtra {
  justify: Justify;
}

export interface LabelSymbolizer {
  /* the symbolizer can, but does not need to, inspect index to determine the right position
   * if return undefined, no label is added
   * return a label, but if the label collides it is not added
   */
  place(layout: Layout, geom: Point[][], feature: Feature): Label[] | undefined;
}

export const createPattern = (
  width: number,
  height: number,
  fn: (canvas: any, ctx: any) => void
) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  fn(canvas, ctx);
  return canvas;
};

export class PolygonSymbolizer implements PaintSymbolizer {
  pattern: any; // FIXME
  fill: StringAttr;
  opacity: NumberAttr;
  stroke: StringAttr;
  width: NumberAttr;
  per_feature: boolean;
  do_stroke: boolean;

  constructor(options: any) {
    this.pattern = options.pattern;
    this.fill = new StringAttr(options.fill, "black");
    this.opacity = new NumberAttr(options.opacity, 1);
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.per_feature =
      this.fill.per_feature ||
      this.opacity.per_feature ||
      this.stroke.per_feature ||
      this.width.per_feature ||
      options.per_feature;
    this.do_stroke = false;
  }

  public before(ctx: any, z: number) {
    if (!this.per_feature) {
      ctx.globalAlpha = this.opacity.get(z);
      ctx.fillStyle = this.fill.get(z);
      ctx.strokeStyle = this.stroke.get(z);
      let width = this.width.get(z);
      if (width > 0) this.do_stroke = true;
      ctx.lineWidth = width;
    }
    if (this.pattern) {
      ctx.fillStyle = ctx.createPattern(this.pattern, "repeat");
    }
  }

  public draw(ctx: any, geom: Point[][], z: number, f: Feature) {
    var do_stroke = false;
    if (this.per_feature) {
      ctx.globalAlpha = this.opacity.get(z, f);
      ctx.fillStyle = this.fill.get(z, f);
      var width = this.width.get(z, f);
      if (width) {
        do_stroke = true;
        ctx.strokeStyle = this.stroke.get(z, f);
        ctx.lineWidth = width;
      }
    }

    var i = 0;
    while (i < geom.length) {
      var j = 0;
      ctx.beginPath();
      while (i < geom.length && j < batch_size) {
        var poly = geom[i];
        for (var p = 0; p < poly.length - 1; p++) {
          let pt = poly[p];
          if (p == 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        i++;
        j++;
      }
      ctx.fill();
      if (do_stroke || this.do_stroke) {
        ctx.stroke();
      }
    }
  }
}

export function arr(base: number, a: number[]): (z: number) => number {
  return (z) => {
    let b = z - base;
    if (b >= 0 && b < a.length) {
      return a[b];
    }
    return 0;
  };
}

export function exp(base: number, stops: number[][]): (z: number) => number {
  return (z) => {
    if (stops.length < 1) return 0;
    if (z <= stops[0][0]) return stops[0][1];
    if (z >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    let idx = 0;
    while (stops[idx + 1][0] < z) idx++;
    let difference = stops[idx + 1][0] - stops[idx][0];
    let progress = z - stops[idx][0];
    var factor;
    if (difference === 0) factor = 0;
    else if (base === 1) factor = progress / difference;
    else
      factor =
        (Math.pow(base, progress) - 1) / (Math.pow(base, difference) - 1);
    return factor * (stops[idx + 1][1] - stops[idx][1]) + stops[idx][1];
  };
}

export function step(stops: number[][]): (z: number) => number {
  return (z) => {
    if (stops.length < 1) return 0;
    let retval = 0;
    for (var i = 0; i < stops.length; i++) {
      if (z >= stops[i][0]) retval = stops[i][1];
    }
    return retval;
  };
}

export function linear(stops: number[][]): (z: number) => number {
  return exp(1, stops);
}

function isFunction(obj: any) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

export class LineSymbolizer implements PaintSymbolizer {
  color: StringAttr;
  width: NumberAttr;
  opacity: NumberAttr;
  dash: any;
  dashColor: StringAttr;
  dashWidth: NumberAttr;
  skip: boolean;
  per_feature: boolean;
  lineCap: StringAttr;
  lineJoin: StringAttr;

  constructor(options: any) {
    this.color = new StringAttr(options.color, "black");
    this.width = new NumberAttr(options.width);
    this.opacity = new NumberAttr(options.opacity);
    this.dash = options.dash;
    this.dashColor = new StringAttr(options.dashColor, "black");
    this.dashWidth = new NumberAttr(options.dashWidth);
    this.lineCap = new StringAttr(options.lineCap, "butt");
    this.lineJoin = new StringAttr(options.lineJoin, "miter");
    this.skip = false;
    this.per_feature =
      this.dash ||
      this.color.per_feature ||
      this.opacity.per_feature ||
      this.width.per_feature ||
      this.lineCap.per_feature ||
      this.lineJoin.per_feature ||
      options.per_feature;
  }

  public before(ctx: any, z: number) {
    if (!this.per_feature) {
      ctx.strokeStyle = this.color.get(z);
      ctx.lineWidth = this.width.get(z);
      ctx.globalAlpha = this.opacity.get(z);
      ctx.lineCap = this.lineCap.get(z);
      ctx.lineJoin = this.lineJoin.get(z);
    }
  }

  public draw(ctx: any, geom: Point[][], z: number, f: Feature) {
    if (this.skip) return;

    var i = 0;
    while (i < geom.length) {
      var j = 0;
      ctx.beginPath();
      while (i < geom.length && j < batch_size) {
        var ls = geom[i];
        for (var p = 0; p < ls.length; p++) {
          let pt = ls[p];
          if (p == 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        i++;
        j++;
      }

      if (this.per_feature) {
        ctx.globalAlpha = this.opacity.get(z, f);
        ctx.lineCap = this.lineCap.get(z, f);
        ctx.lineJoin = this.lineJoin.get(z, f);
      }
      if (this.dash) {
        ctx.save();
        if (this.per_feature) {
          ctx.lineWidth = this.dashWidth.get(z, f);
          ctx.strokeStyle = this.dashColor.get(z, f);
        }
        ctx.setLineDash(this.dash);
        ctx.stroke();
        ctx.restore();
      } else {
        if (this.per_feature) {
          ctx.lineWidth = this.width.get(z, f);
          ctx.strokeStyle = this.color.get(z, f);
        }
        ctx.stroke();
      }
    }
  }
}

export class IconSymbolizer implements LabelSymbolizer {
  sprites: any; // FIXME
  name: string;

  constructor(options: any) {
    this.sprites = options.sprites;
    this.name = options.name;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let pt = geom[0];
    let a = new Point(geom[0][0].x, geom[0][0].y);
    let bbox = {
      minX: a.x - 32,
      minY: a.y - 32,
      maxX: a.x + 32,
      maxY: a.y + 32,
    };

    let draw = (ctx: any) => {
      ctx.globalAlpha = 1;
      let r = this.sprites.get(this.name);
      ctx.drawImage(r.canvas, r.x, r.y, r.w, r.h, -8, -8, r.w, r.h);
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

export class CircleSymbolizer implements LabelSymbolizer, PaintSymbolizer {
  radius: NumberAttr;
  fill: StringAttr;
  stroke: StringAttr;
  width: NumberAttr;
  opacity: NumberAttr;

  constructor(options: any) {
    this.radius = new NumberAttr(options.radius, 3);
    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "white");
    this.width = new NumberAttr(options.width, 0); // TODO 0 is falsy
    this.opacity = new NumberAttr(options.opacity);
  }

  public draw(ctx: any, geom: Point[][], z: number, f: Feature) {
    ctx.globalAlpha = this.opacity.get(z, f);

    let radius = this.radius.get(z, f);
    let width = this.width.get(z, f);
    if (width > 0) {
      ctx.fillStyle = this.stroke.get(z, f);
      ctx.beginPath();
      ctx.arc(geom[0][0].x, geom[0][0].y, radius + width, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = this.fill.get(z, f);
    ctx.beginPath();
    ctx.arc(geom[0][0].x, geom[0][0].y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let pt = geom[0];
    let a = new Point(geom[0][0].x, geom[0][0].y);
    let radius = this.radius.get(layout.zoom, feature);
    let bbox = {
      minX: a.x - radius,
      minY: a.y - radius,
      maxX: a.x + radius,
      maxY: a.y + radius,
    };

    let draw = (ctx: any) => {
      this.draw(ctx, [[new Point(0, 0)]], layout.zoom, feature);
    };
    return [{ anchor: a, bboxes: [bbox], draw }];
  }
}

export class ShieldSymbolizer implements LabelSymbolizer {
  font: FontAttr;
  text: TextAttr;
  background: StringAttr;
  fill: StringAttr;
  padding: NumberAttr;

  constructor(options: any) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);
    this.fill = new StringAttr(options.fill, "black");
    this.background = new StringAttr(options.background, "white");
    this.padding = new NumberAttr(options.padding, 0); // TODO check falsy
  }

  public place(layout: Layout, geom: Point[][], f: Feature) {
    let property = this.text.get(layout.zoom, f);
    if (!property) return undefined;
    let font = this.font.get(layout.zoom, f);
    layout.scratch.font = font;
    let metrics = layout.scratch.measureText(property);

    let width = metrics.width;
    let ascent = metrics.actualBoundingBoxAscent;
    let descent = metrics.actualBoundingBoxDescent;

    let pt = geom[0];
    let a = new Point(geom[0][0].x, geom[0][0].y);
    let p = this.padding.get(layout.zoom, f);
    let bbox = {
      minX: a.x - width / 2 - p,
      minY: a.y - ascent - p,
      maxX: a.x + width / 2 + p,
      maxY: a.y + descent + p,
    };

    let draw = (ctx: any) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.background.get(layout.zoom, f);
      ctx.fillRect(
        -width / 2 - p,
        -ascent - p,
        width + 2 * p,
        ascent + descent + 2 * p
      );
      ctx.fillStyle = this.fill.get(layout.zoom, f);
      ctx.font = font;
      ctx.fillText(property, -width / 2, 0);
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

// TODO make me work with multiple anchors
export class FlexSymbolizer implements LabelSymbolizer {
  list: LabelSymbolizer[];

  constructor(list: LabelSymbolizer[], options: any) {
    this.list = list;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    var labels = this.list[0].place(layout, geom, feature);
    if (!labels) return undefined;
    var label = labels[0];
    let anchor = label.anchor;
    let bbox = label.bboxes[0];
    let height = bbox.maxY - bbox.minY;
    let draws = [{ draw: label.draw, translate: { x: 0, y: 0 } }];

    let newGeom = [[{ x: geom[0][0].x, y: geom[0][0].y + height }]];
    for (let i = 1; i < this.list.length; i++) {
      labels = this.list[i].place(layout, newGeom, feature);
      if (labels) {
        label = labels[0];
        bbox = mergeBbox(bbox, label.bboxes[0]);
        draws.push({ draw: label.draw, translate: { x: 0, y: height } });
      }
    }

    let draw = (ctx: any) => {
      for (let sub of draws) {
        ctx.save();
        ctx.translate(sub.translate.x, sub.translate.y);
        sub.draw(ctx);
        ctx.restore();
      }
    };

    return [{ anchor: anchor, bboxes: [bbox], draw: draw }];
  }
}

const mergeBbox = (b1: Bbox, b2: Bbox) => {
  return {
    minX: Math.min(b1.minX, b2.minX),
    minY: Math.min(b1.minY, b2.minY),
    maxX: Math.max(b1.maxX, b2.maxX),
    maxY: Math.max(b1.maxY, b2.maxY),
  };
};

export class GroupSymbolizer implements LabelSymbolizer {
  list: LabelSymbolizer[];

  constructor(list: LabelSymbolizer[]) {
    this.list = list;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let first = this.list[0];
    if (!first) return undefined;
    var labels = first.place(layout, geom, feature);
    if (!labels) return undefined;
    var label = labels[0];
    let anchor = label.anchor;
    let bbox = label.bboxes[0];
    let draws = [label.draw];

    for (let i = 1; i < this.list.length; i++) {
      labels = this.list[i].place(layout, geom, feature);
      if (!labels) return undefined;
      label = labels[0];
      bbox = mergeBbox(bbox, label.bboxes[0]);
      draws.push(label.draw);
    }
    let draw = (ctx: any) => {
      draws.forEach((d) => d(ctx));
    };

    return [{ anchor: anchor, bboxes: [bbox], draw: draw }];
  }
}

export class CenteredSymbolizer implements LabelSymbolizer {
  symbolizer: LabelSymbolizer;

  constructor(symbolizer: LabelSymbolizer) {
    this.symbolizer = symbolizer;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let a = geom[0][0];
    let placed = this.symbolizer.place(layout, [[new Point(0, 0)]], feature);
    if (!placed || placed.length == 0) return undefined;
    let first_label = placed[0];
    let bbox = first_label.bboxes[0];
    let width = bbox.maxX - bbox.minX;
    let height = bbox.maxY - bbox.minY;
    let centered = {
      minX: a.x - width / 2,
      maxX: a.x + width / 2,
      minY: a.y - height / 2,
      maxY: a.y + height / 2,
    };

    let draw = (ctx: any) => {
      ctx.translate(-width / 2, height / 2 - bbox.maxY);
      first_label.draw(ctx, { justify: Justify.Center });
    };

    return [{ anchor: a, bboxes: [centered], draw: draw }];
  }
}

export class Padding implements LabelSymbolizer {
  symbolizer: LabelSymbolizer;
  padding: NumberAttr;

  constructor(padding: number, symbolizer: LabelSymbolizer) {
    this.padding = new NumberAttr(padding, 0);
    this.symbolizer = symbolizer;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let placed = this.symbolizer.place(layout, geom, feature);
    if (!placed || placed.length == 0) return undefined;
    let padding = this.padding.get(layout.zoom, feature);
    for (var label of placed) {
      for (var bbox of label.bboxes) {
        bbox.minX -= padding;
        bbox.minY -= padding;
        bbox.maxX += padding;
        bbox.maxY += padding;
      }
    }
    return placed;
  }
}

export class TextSymbolizer implements LabelSymbolizer {
  font: FontAttr;
  text: TextAttr;
  fill: StringAttr;
  stroke: StringAttr;
  width: NumberAttr;
  lineHeight: NumberAttr; // in ems
  letterSpacing: NumberAttr; // in px
  maxLineCodeUnits: NumberAttr;
  justify: Justify;

  constructor(options: any) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);

    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.lineHeight = new NumberAttr(options.lineHeight, 1);
    this.letterSpacing = new NumberAttr(options.letterSpacing, 0);
    this.maxLineCodeUnits = new NumberAttr(options.maxLineChars, 15);
    this.justify = options.justify;
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let property = this.text.get(layout.zoom, feature);
    if (!property) return undefined;
    let font = this.font.get(layout.zoom, feature);
    layout.scratch.font = font;

    let letterSpacing = this.letterSpacing.get(layout.zoom, feature);

    // line breaking
    let lines = linebreak(
      property,
      this.maxLineCodeUnits.get(layout.zoom, feature)
    );
    var longestLine;
    var longestLineLen = 0;
    for (let line of lines) {
      if (line.length > longestLineLen) {
        longestLineLen = line.length;
        longestLine = line;
      }
    }

    let metrics = layout.scratch.measureText(longestLine);
    let width = metrics.width + letterSpacing * (longestLineLen - 1);

    let ascent = metrics.actualBoundingBoxAscent;
    let descent = metrics.actualBoundingBoxDescent;
    let lineHeight =
      (ascent + descent) * this.lineHeight.get(layout.zoom, feature);

    let a = new Point(geom[0][0].x, geom[0][0].y);
    let bbox = {
      minX: a.x,
      minY: a.y - ascent,
      maxX: a.x + width,
      maxY: a.y + descent + (lines.length - 1) * lineHeight,
    };

    // inside draw, the origin is the anchor
    // and the anchor is the typographic baseline of the first line
    let draw = (ctx: any, extra?: DrawExtra) => {
      ctx.globalAlpha = 1;
      ctx.font = font;
      ctx.fillStyle = this.fill.get(layout.zoom, feature);
      let textStrokeWidth = this.width.get(layout.zoom, feature);

      var y = 0;
      for (let line of lines) {
        var startX = 0;
        if (
          this.justify == Justify.Center ||
          (extra && extra.justify == Justify.Center)
        ) {
          startX = (width - ctx.measureText(line).width) / 2;
        } else if (
          this.justify == Justify.Right ||
          (extra && extra.justify == Justify.Right)
        ) {
          startX = width - ctx.measureText(line).width;
        }
        if (textStrokeWidth) {
          ctx.lineWidth = textStrokeWidth * 2; // centered stroke
          ctx.strokeStyle = this.stroke.get(layout.zoom, feature);
          if (letterSpacing > 0) {
            var xPos = startX;
            for (var letter of line) {
              ctx.strokeText(letter, xPos, y);
              xPos += ctx.measureText(letter).width + letterSpacing;
            }
          } else {
            ctx.strokeText(line, startX, y);
          }
        }
        if (letterSpacing > 0) {
          var xPos = startX;
          for (var letter of line) {
            ctx.fillText(letter, xPos, y);
            xPos += ctx.measureText(letter).width + letterSpacing;
          }
        } else {
          ctx.fillText(line, startX, y);
        }
        y += lineHeight;
      }
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

export class CenteredTextSymbolizer implements LabelSymbolizer {
  centered: LabelSymbolizer;

  constructor(options: any) {
    this.centered = new CenteredSymbolizer(new TextSymbolizer(options));
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    return this.centered.place(layout, geom, feature);
  }
}

export interface OffsetSymbolizerValues {
  offsetX?: number
  offsetY?: number
  placements?: TextPlacements[]
  justify?: Justify
}

export type DataDrivenOffsetSymbolizer = (zoom:number,feature:Feature) => OffsetSymbolizerValues

export class OffsetSymbolizer implements LabelSymbolizer {
    symbolizer: LabelSymbolizer
    offsetX: NumberAttr
    offsetY: NumberAttr
    justify: Justify
    placements: TextPlacements[]
    ddValues: DataDrivenOffsetSymbolizer

    constructor(symbolizer:LabelSymbolizer, options:any) {
        this.symbolizer = symbolizer
        this.offsetX = new NumberAttr(options.offsetX,0)
        this.offsetY = new NumberAttr(options.offsetY,0)
        this.justify = options.justify || undefined
        this.placements = options.placements
          || [TextPlacements.NE, TextPlacements.SW, TextPlacements.NW, TextPlacements.SE,
            TextPlacements.N, TextPlacements.E, TextPlacements.S, TextPlacements.W]
        this.ddValues = (options.ddValues as DataDrivenOffsetSymbolizer) || (() => { return {} })
    }

    public place(layout:Layout,geom:Point[][],feature:Feature) {
        if (feature.geomType !== GeomType.Point) return undefined
        let anchor = geom[0][0]
        let placed = this.symbolizer.place(layout,[[new Point(0,0)]],feature)
        if (!placed || placed.length == 0) return undefined
        let first_label = placed[0]
        let fb = first_label.bboxes[0]

        // Overwrite options values via the data driven function if exists
        let offsetXValue = this.offsetX
        let offsetYValue = this.offsetY
        let justifyValue = this.justify
        let placements = this.placements 
        const { 
          offsetX: ddOffsetX,
          offsetY: ddOffsetY,
          justify: ddJustify,
          placements: ddPlacements } = this.ddValues(layout.zoom,feature) || {}
        if (ddOffsetX) offsetXValue = new NumberAttr(ddOffsetX, 0)
        if (ddOffsetY) offsetYValue = new NumberAttr(ddOffsetY, 0)
        if (ddJustify) justifyValue = ddJustify
        if (ddPlacements) placements = ddPlacements

        const offsetX = offsetXValue.get(layout.zoom,feature)
        const offsetY = offsetYValue.get(layout.zoom,feature)

        let getBbox = (a:Point,o:Point) => {
            return {
                minX:a.x+o.x+fb.minX, 
                minY:a.y+o.y+fb.minY,
                maxX:a.x+o.x+fb.maxX,
                maxY:a.y+o.y+fb.maxY
            }
        }

        var origin = new Point(offsetX,offsetY)
        var justify:Justify
        let draw = (ctx:any) => {
          ctx.translate(origin.x,origin.y)
          first_label.draw(ctx,{justify:justify})
        }

        const placeLabelInPoint = (a:Point, o:Point) => {
          const bbox = getBbox(a,o)
          if (!layout.index.bboxCollides(bbox,layout.order)) return [{anchor:anchor,bboxes:[bbox],draw:draw}]
        }

        for(let placement of placements) {
          const xAxisOffset = this.computeXAxisOffset(offsetX, fb, placement)
          const yAxisOffset = this.computeYAxisOffset(offsetY, fb, placement)
          justify = this.computeJustify(justifyValue, placement)
          origin = new Point(xAxisOffset, yAxisOffset)
          return placeLabelInPoint(anchor, origin)
        }

        return undefined
    }

    computeXAxisOffset (offsetX: number, fb: Bbox, placement: TextPlacements) {
      const labelWidth = fb.maxX
      const labelHalfWidth = labelWidth / 2
      if ([TextPlacements.N, TextPlacements.S].includes(placement)) return offsetX - labelHalfWidth
      if ([TextPlacements.NW, TextPlacements.W, TextPlacements.SW].includes(placement)) return offsetX - labelWidth
      return offsetX
    }

    computeYAxisOffset(offsetY: number, fb: Bbox, placement: TextPlacements) {
      const labelHalfHeight = Math.abs(fb.minY)
      const labelBottom = fb.maxY
      const labelCenterHeight = (fb.minY + fb.maxY)/2
      if ([TextPlacements.E, TextPlacements.W].includes(placement)) return offsetY - labelCenterHeight
      if ([TextPlacements.NW, TextPlacements.NE, TextPlacements.N].includes(placement)) return offsetY - labelBottom
      if ([TextPlacements.SW, TextPlacements.SE, TextPlacements.S].includes(placement)) return offsetY + labelHalfHeight
      return offsetY
    }

    computeJustify(fixedJustify: Justify, placement: TextPlacements) {
      if (fixedJustify) return fixedJustify
      if ([TextPlacements.N, TextPlacements.S].includes(placement)) return Justify.Center
      if ([TextPlacements.NE, TextPlacements.E, TextPlacements.SE].includes(placement)) return Justify.Left
      return Justify.Right
    }
}

export class OffsetTextSymbolizer implements LabelSymbolizer {
  symbolizer: LabelSymbolizer;

  constructor(options: any) {
    this.symbolizer = new OffsetSymbolizer(
      new TextSymbolizer(options),
      options
    );
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    return this.symbolizer.place(layout, geom, feature);
  }
}

export class LineLabelSymbolizer implements LabelSymbolizer {
  font: FontAttr;
  text: TextAttr;

  fill: StringAttr;
  stroke: StringAttr;
  width: NumberAttr;
  offset: NumberAttr;

  constructor(options: any) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);

    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.offset = new NumberAttr(options.offset, 0);
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let name = this.text.get(layout.zoom, feature);
    if (!name) return undefined;
    if (name.length > 20) return undefined;

    let fbbox = feature.bbox;
    let area = (fbbox.maxY - fbbox.minY) * (fbbox.maxX - fbbox.minX); // TODO needs to be based on zoom level
    if (area < 400) return undefined;

    let font = this.font.get(layout.zoom, feature);
    layout.scratch.font = font;
    let metrics = layout.scratch.measureText(name);
    let width = metrics.width;

    let result = simpleLabel(geom, width);
    if (!result) return undefined;
    let dx = result.end.x - result.start.x;
    let dy = result.end.y - result.start.y;

    let Q = 8;
    let cells = lineCells(result.start, result.end, width, 8);
    let bboxes = cells.map((c) => {
      return {
        minX: c.x - Q,
        minY: c.y - Q,
        maxX: c.x + Q,
        maxY: c.y + Q,
      };
    });

    let draw = (ctx: any) => {
      ctx.globalAlpha = 1;
      // ctx.beginPath()
      // ctx.moveTo(0,0)
      // ctx.lineTo(dx,dy)
      // ctx.strokeStyle = "red"
      // ctx.stroke()
      ctx.rotate(Math.atan2(dy, dx));
      if (dx < 0) {
        ctx.scale(-1, -1);
        ctx.translate(-width, 0);
      }
      ctx.translate(0, -this.offset.get(layout.zoom, feature));
      ctx.font = font;
      let lineWidth = this.width.get(layout.zoom, feature);
      if (lineWidth) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = this.stroke.get(layout.zoom, feature);
        ctx.strokeText(name, 0, 0);
      }
      ctx.fillStyle = this.fill.get(layout.zoom, feature);
      ctx.fillText(name, 0, 0);
    };

    return [{ anchor: result.start, bboxes: bboxes, draw: draw }];
  }
}

export class PolygonLabelSymbolizer implements LabelSymbolizer {
  symbolizer: LabelSymbolizer;

  constructor(options: any) {
    this.symbolizer = new TextSymbolizer(options);
  }

  public place(layout: Layout, geom: Point[][], feature: Feature) {
    let fbbox = feature.bbox;
    let area = (fbbox.maxY - fbbox.minY) * (fbbox.maxX - fbbox.minX); // TODO needs to be based on zoom level/overzooming
    if (area < 20000) return undefined;

    let placed = this.symbolizer.place(layout, [[new Point(0, 0)]], feature);
    if (!placed || placed.length == 0) return undefined;
    let first_label = placed[0];
    let fb = first_label.bboxes[0];

    let first_poly = geom[0];
    let found = polylabel([first_poly.map((c) => [c.x, c.y])]);
    let a = new Point(found[0], found[1]);

    let bbox = {
      minX: a.x - (fb.maxX - fb.minX) / 2,
      minY: a.y - (fb.maxY - fb.minY) / 2,
      maxX: a.x + (fb.maxX - fb.minX) / 2,
      maxY: a.y + (fb.maxY - fb.minY) / 2,
    };

    let draw = (ctx: any) => {
      ctx.translate(
        first_label.anchor.x - (fb.maxX - fb.minX) / 2,
        first_label.anchor.y
      );
      first_label.draw(ctx);
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}
