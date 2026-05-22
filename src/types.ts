export interface BoundingBox {
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  width: number; // 0 to 100 percentage
  height: number; // 0 to 100 percentage
}

export type ElementType = "text" | "person" | "graphic" | "background";

export interface DetectedElement {
  id: string;
  type: ElementType;
  label: string;
  originalText?: string;
  box: BoundingBox;
  defaultTextStyle?: Partial<TextStyleOptions>;
}

export interface TextStyleOptions {
  fontSize: number; // in pixels or proportional
  color: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  letterSpacing: string;
  backgroundColor: string; // Background color for text block
  backgroundOpacity: number;
  align?: "left" | "center" | "right";
  textShadowColor?: string;
  textShadowBlur?: number;
  textShadowOffsetX?: number;
  textShadowOffsetY?: number;
  lineHeightMultiplier?: number;
}

export interface EditedElement {
  id: string;
  type: ElementType;
  // Text modifications
  replacedText?: string;
  textStyle?: TextStyleOptions;
  // Media modifications (faces, bodies, logos, icons)
  replacedImage?: string; // base64 payload or object URL
  cropImage?: string; // Crop taken from the original uploaded photo
  isMaskOn: boolean; // Whether to solid-fill the original bounds to make the text editable
  maskColor: string; // The solid fill color (defaults to color sampled around pixels, or customizable)
  fitMode?: "cover" | "contain" | "stretch";
  replacedImageWidth?: number;
  replacedImageHeight?: number;
  replacedImageRatio?: number;
  
  // High-precision blending fields
  frameShape?: "rectangle" | "circle" | "rounded";
  featherAmount?: number; // 0 to 50px edge blur
  borderColor?: string; // decorative frame/border color
  borderWidth?: number; // 0 to 15px
  brightness?: number; // 50 to 150 %
  contrast?: number; // 50 to 150 %
  saturation?: number; // 50 to 150 %
}
