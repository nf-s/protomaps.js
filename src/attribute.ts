import { ObjectProperties } from ".";
import { Feature } from "./tilecache";

export type Attr<T> = T | ((z: number, f?: Feature) => T);

export class StringAttr<T extends string = string> {
  str: Attr<T>;
  per_feature?: boolean;

  constructor(c: Attr<T> | undefined, defaultValue: T) {
    this.str = c ?? defaultValue;
    this.per_feature = typeof this.str == "function" && this.str.length == 2;
  }

  public get(z: number, f?: Feature): T {
    if (typeof this.str === "function") {
      return this.str(z, f);
    } else {
      return this.str;
    }
  }
}

export class NumberAttr {
  value: Attr<number>;
  per_feature: boolean;

  constructor(c: Attr<number> | undefined, defaultValue: number = 1) {
    this.value = c ?? defaultValue;
    this.per_feature =
      typeof this.value == "function" && this.value.length == 2;
  }

  public get(z: number, f?: Feature): number {
    if (typeof this.value == "function") {
      return this.value(z, f);
    } else {
      return this.value;
    }
  }
}

export interface TextAttrOptions extends ObjectProperties<TextAttr> {}

export class TextAttr {
  label_props: Attr<string[]>;
  textTransform?: string;

  constructor(options: TextAttrOptions) {
    this.label_props = options.label_props ?? ["name"];
    this.textTransform = options.textTransform;
  }

  public get(z: number, f: Feature): string {
    var retval;

    var label_props: string[];
    if (typeof this.label_props == "function") {
      label_props = this.label_props(z, f);
    } else {
      label_props = this.label_props;
    }
    for (let property of label_props) {
      if (f.props.hasOwnProperty(property)) {
        retval = f.props[property];
        break;
      }
    }
    if (retval && this.textTransform === "uppercase")
      retval = retval.toUpperCase();
    return retval;
  }
}

export interface FontAttrOptions {
  font?: Attr<string>;
  fontFamily?: Attr<string>;
  fontSize?: Attr<number>;
  fontWeight?: Attr<number>;
  fontStyle?: Attr<string>;
}

export class FontAttr {
  family?: Attr<string>;
  size?: Attr<number>;
  weight?: Attr<number>;
  style?: Attr<string>;
  font?: Attr<string>;

  constructor(options: FontAttrOptions) {
    if (options.font) {
      this.font = options.font;
    } else {
      this.family = options.fontFamily ?? "sans-serif";
      this.size = options.fontSize ?? 12;
      this.weight = options.fontWeight;
      this.style = options.fontStyle;
    }
  }

  public get(z: number, f: Feature) {
    if (this.font) {
      if (typeof this.font === "function") {
        return this.font(z, f);
      } else {
        return this.font;
      }
    } else {
      var style = "";
      if (this.style) {
        if (typeof this.style === "function") {
          style = this.style(z, f) + " ";
        } else {
          style = this.style + " ";
        }
      }

      var weight = "";
      if (this.weight) {
        if (typeof this.weight === "function") {
          weight = this.weight(z, f) + " ";
        } else {
          weight = this.weight + " ";
        }
      }

      var size;
      if (typeof this.size === "function") {
        size = this.size(z, f);
      } else {
        size = this.size;
      }

      var family;
      if (typeof this.family === "function") {
        family = this.family(z, f);
      } else {
        family = this.family;
      }

      return `${style}${weight}${size}px ${family}`;
    }
  }
}
