import { BoundingBox, EditedElement } from "../types";

/**
 * Loads a URL or base64 data URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Failed to load image: " + err));
    img.src = src;
  });
}

/**
 * Samples the color at the 4 corners (slightly offset inwards) of a bounding box
 * within an image to detect the local background/surrounding color.
 */
export async function sampleBorderColor(
  imageSrc: string,
  box: BoundingBox
): Promise<string> {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve("#ffffff");
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("#ffffff");
          return;
        }
        ctx.drawImage(img, 0, 0);

        // Convert percentages to pixels
        const bx = (box.x / 100) * img.naturalWidth;
        const by = (box.y / 100) * img.naturalHeight;
        const bw = (box.width / 100) * img.naturalWidth;
        const bh = (box.height / 100) * img.naturalHeight;

        // Sample 4 corners slightly offset to the inside (say 5% of box dimension, capped)
        const xOffset = Math.max(1, Math.min(10, bw * 0.05));
        const yOffset = Math.max(1, Math.min(10, bh * 0.05));

        const offsets = [
          { x: bx + xOffset, y: by + yOffset },
          { x: bx + bw - xOffset, y: by + yOffset },
          { x: bx + xOffset, y: by + bh - yOffset },
          { x: bx + bw - xOffset, y: by + bh - yOffset },
        ];

        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;

        for (const pt of offsets) {
          const px = Math.max(0, Math.min(img.naturalWidth - 1, pt.x));
          const py = Math.max(0, Math.min(img.naturalHeight - 1, pt.y));
          
          const rgb = ctx.getImageData(px, py, 1, 1).data;
          // Only factor in opaque or near-opaque pixels
          if (rgb[3] > 50) {
            rSum += rgb[0];
            gSum += rgb[1];
            bSum += rgb[2];
            aSum += rgb[3];
            count++;
          }
        }

        if (count === 0) {
          resolve("#ffffff");
          return;
        }

        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);

        const toHex = (c: number) => c.toString(16).padStart(2, "0");
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
      } catch (e) {
        console.error("Local border color sampling failed:", e);
        resolve("#ffffff");
      }
    };
    img.onerror = () => resolve("#ffffff");
    img.src = imageSrc;
  });
}

/**
 * Dynamic crop utility: takes an image URL and bounding box percentages,
 * and extracts the cropped region as a base64 data-URL.
 */
export async function cropElement(
  imageSrc: string,
  box: BoundingBox
): Promise<string> {
  try {
    const img = await loadImage(imageSrc);
    
    // Calculate pixel coordinates
    const sx = (box.x / 100) * img.naturalWidth;
    const sy = (box.y / 100) * img.naturalHeight;
    const sWidth = (box.width / 100) * img.naturalWidth;
    const sHeight = (box.height / 100) * img.naturalHeight;

    // Create target canvas
    const canvas = document.createElement("canvas");
    canvas.width = sWidth || 100;
    canvas.height = sHeight || 100;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to obtain 2D rendering context.");
    }

    // Draw cropped portion
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Cropping helper failed:", error);
    return "";
  }
}

/**
 * High-resolution canvas composer: combines the base image background,
 * solid color masks, image replacements (for people or graphics), and custom 
 * overlay styled typography into a single high-quality exported PNG.
 */
export async function composeFinalImage(
  baseImageSrc: string,
  elements: any[], // Developed DetectedElements
  edits: Record<string, EditedElement>
): Promise<string> {
  try {
    const img = await loadImage(baseImageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to obtain 2D rendering context for export.");
    }

    // 1. Draw original base background
    ctx.drawImage(img, 0, 0);

    // 2. Render regional edits (Masks & Replacement Images)
    for (const elem of elements) {
      const edit = edits[elem.id];
      if (!edit) continue;

      // Only apply mask or overlays if there is an active replacement
      const hasActiveReplacement = (elem.type === "text" && edit.replacedText) ||
                                   ((elem.type === "person" || elem.type === "graphic") && edit.replacedImage);
      if (!hasActiveReplacement) {
        continue;
      }

      const px = (elem.box.x / 100) * canvas.width;
      const py = (elem.box.y / 100) * canvas.height;
      const pWidth = (elem.box.width / 100) * canvas.width;
      const pHeight = (elem.box.height / 100) * canvas.height;

      // Apply solid color mask if turned on or if replacing text with custom styling
      if (edit.isMaskOn) {
        ctx.save();
        ctx.fillStyle = edit.maskColor || "#ffffff";
        ctx.beginPath();
        const shape = edit.frameShape || "rectangle";
        
        if (elem.type === "person" || elem.type === "graphic") {
          if (shape === "circle") {
            ctx.ellipse(px + pWidth / 2, py + pHeight / 2, pWidth / 2, pHeight / 2, 0, 0, 2 * Math.PI);
            ctx.fill();
          } else if (shape === "rounded") {
            const radius = Math.min(pWidth, pHeight) * 0.15;
            ctx.roundRect(px, py, pWidth, pHeight, radius);
            ctx.fill();
          } else {
            ctx.fillRect(px, py, pWidth, pHeight);
          }
        } else {
          ctx.fillRect(px, py, pWidth, pHeight);
        }
        ctx.restore();
      }

      // If replacing a person/graphic with a new uploaded image:
      if (edit.replacedImage && (elem.type === "person" || elem.type === "graphic")) {
        try {
          const replacementImg = await loadImage(edit.replacedImage);
          const mode = edit.fitMode || "contain"; // Default to contain/as-is to preserve horizontal/vertical ratio

          // Create an offscreen canvas to perform precise local operations (filters, feathering, shape masking)
          const osCanvas = document.createElement("canvas");
          osCanvas.width = pWidth || 100;
          osCanvas.height = pHeight || 100;
          const osCtx = osCanvas.getContext("2d");

          if (osCtx) {
            // A. Set up Canvas filters for brightness, contrast, and saturation
            const bri = edit.brightness ?? 100;
            const con = edit.contrast ?? 100;
            const sat = edit.saturation ?? 100;
            osCtx.filter = `brightness(${bri}%) contrast(${con}%) saturate(${sat}%)`;

            // B. Calculate draw dimensions relative to coordinate (0,0) of offscreen canvas
            const targetRatio = pWidth / pHeight;
            const sourceRatio = replacementImg.naturalWidth / replacementImg.naturalHeight;

            let drawWidth = pWidth;
            let drawHeight = pHeight;
            let dx = 0;
            let dy = 0;

            if (mode === "contain") {
              if (sourceRatio > targetRatio) {
                drawWidth = pWidth;
                drawHeight = pWidth / sourceRatio;
                dx = 0;
                dy = (pHeight - drawHeight) / 2;
              } else {
                drawHeight = pHeight;
                drawWidth = pHeight * sourceRatio;
                dx = (pWidth - drawWidth) / 2;
                dy = 0;
              }
            } else if (mode === "cover") {
              if (sourceRatio > targetRatio) {
                drawWidth = pHeight * sourceRatio;
                dx = -(drawWidth - pWidth) / 2;
                dy = 0;
              } else {
                drawHeight = pWidth / sourceRatio;
                dx = 0;
                dy = -(drawHeight - pHeight) / 2;
              }
            } else if (mode === "stretch") {
              drawWidth = pWidth;
              drawHeight = pHeight;
              dx = 0;
              dy = 0;
            }

            // Draw the replacement image onto offscreen canvas with filters applied
            osCtx.drawImage(replacementImg, dx, dy, drawWidth, drawHeight);

            // C. Create shape mask canvas
            const maskCanvas = document.createElement("canvas");
            maskCanvas.width = pWidth || 100;
            maskCanvas.height = pHeight || 100;
            const maskCtx = maskCanvas.getContext("2d");

            if (maskCtx) {
              const shape = edit.frameShape || "rectangle";
              const feather = edit.featherAmount || 0;

              if (feather > 0) {
                // If feathering, we paint the shape blurred with native filter blur for soft fade effect
                maskCtx.filter = `blur(${feather}px)`;
                maskCtx.fillStyle = "black";
                maskCtx.beginPath();
                
                // Shrink slightly relative to feather thickness to avoid hard clip boundaries
                const fa = feather;
                if (shape === "circle") {
                  maskCtx.ellipse(pWidth / 2, pHeight / 2, Math.max(5, pWidth / 2 - fa), Math.max(5, pHeight / 2 - fa), 0, 0, 2 * Math.PI);
                } else if (shape === "rounded") {
                  const radius = Math.max(0, Math.min(pWidth, pHeight) * 0.15 - fa);
                  maskCtx.roundRect(fa, fa, pWidth - fa * 2, pHeight - fa * 2, radius);
                } else {
                  maskCtx.rect(fa, fa, pWidth - fa * 2, pHeight - fa * 2);
                }
                maskCtx.fill();
              } else {
                // No feathering: raw sharp shape bounds fill
                maskCtx.fillStyle = "black";
                maskCtx.beginPath();
                if (shape === "circle") {
                  maskCtx.ellipse(pWidth / 2, pHeight / 2, pWidth / 2, pHeight / 2, 0, 0, 2 * Math.PI);
                } else if (shape === "rounded") {
                  const radius = Math.min(pWidth, pHeight) * 0.15;
                  maskCtx.roundRect(0, 0, pWidth, pHeight, radius);
                } else {
                  maskCtx.rect(0, 0, pWidth, pHeight);
                }
                maskCtx.fill();
              }

              // D. Render shape mask onto the offscreen image canvas using composite operation
              osCtx.save();
              osCtx.globalCompositeOperation = "destination-in";
              // We reset filter so the mask itself isn't double-filtered
              osCtx.filter = "none";
              osCtx.drawImage(maskCanvas, 0, 0);
              osCtx.restore();
            }

            // E. Composite the offscreen canvas back to the high-res master background image
            ctx.save();
            ctx.drawImage(osCanvas, px, py);
            ctx.restore();

            // F. Add optional custom decorative border lines outline (golden frame, silver, white)
            if (edit.borderWidth && edit.borderWidth > 0) {
              ctx.save();
              ctx.strokeStyle = edit.borderColor || "#d4af37";
              ctx.lineWidth = edit.borderWidth;
              // Align stroke center slightly inward of coordinates to prevent edge clipped borders
              const strokeOffset = edit.borderWidth / 2;
              
              ctx.beginPath();
              const shape = edit.frameShape || "rectangle";
              if (shape === "circle") {
                ctx.ellipse(
                  px + pWidth / 2, 
                  py + pHeight / 2, 
                  Math.max(1, pWidth / 2 - strokeOffset), 
                  Math.max(1, pHeight / 2 - strokeOffset), 
                  0, 0, 2 * Math.PI
                );
              } else if (shape === "rounded") {
                const radius = Math.min(pWidth, pHeight) * 0.15;
                ctx.roundRect(
                  px + strokeOffset, 
                  py + strokeOffset, 
                  pWidth - strokeOffset * 2, 
                  pHeight - strokeOffset * 2, 
                  Math.max(0, radius - strokeOffset)
                );
              } else {
                ctx.rect(
                  px + strokeOffset, 
                  py + strokeOffset, 
                  pWidth - strokeOffset * 2, 
                  pHeight - strokeOffset * 2
                );
              }
              ctx.stroke();
              ctx.restore();
            }
          }

        } catch (err) {
          console.error(`Failed to draw replacement image for ${elem.id}:`, err);
        }
      }
    }

    // 3. Render Custom Overlay Text (to ensure sharp, distinct typography on final image)
    for (const elem of elements) {
      const edit = edits[elem.id];
      if (!edit || elem.type !== "text" || !edit.replacedText) continue;

      const px = (elem.box.x / 100) * canvas.width;
      const py = (elem.box.y / 100) * canvas.height;
      const pWidth = (elem.box.width / 100) * canvas.width;
      const pHeight = (elem.box.height / 100) * canvas.height;

      const style = edit.textStyle;
      if (!style) continue;

      // Save canvas state
      ctx.save();

      // Render optional background overlay behind text block
      if (style.backgroundColor && style.backgroundOpacity > 0) {
        ctx.fillStyle = style.backgroundColor;
        ctx.globalAlpha = style.backgroundOpacity;
        ctx.fillRect(px, py, pWidth, pHeight);
        ctx.globalAlpha = 1.0; // Reset alpha
      }

      // Set up typography styling on Canvas context
      const fontStyleModifier = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}`;
      
      // We calculate a relative font size so it is sharp relative to the full internal canvas size!
      // If original height is roughly, say, 12% of a 1000px image, that is 120px. 
      // We scale the selected slider value proportionally relative to layout scales.
      const proportionalFontSize = (style.fontSize / 50) * (pHeight * 0.8);
      ctx.font = `${fontStyleModifier}${proportionalFontSize}px ${style.fontFamily || "Inter, sans-serif"}`;
      ctx.fillStyle = style.color || "#ffffff";
      ctx.textBaseline = "middle";

      // Shadow support
      if (style.textShadowColor && (style.textShadowBlur || style.textShadowOffsetX || style.textShadowOffsetY)) {
        ctx.shadowColor = style.textShadowColor;
        ctx.shadowBlur = style.textShadowBlur || 0;
        ctx.shadowOffsetX = style.textShadowOffsetX || 0;
        ctx.shadowOffsetY = style.textShadowOffsetY || 0;
      }

      const rawText = style.uppercase ? edit.replacedText.toUpperCase() : edit.replacedText;
      
      // Multi-line word wrapping based on bounding box width
      const lines: string[] = [];
      const paragraphs = rawText.split("\n");
      const maxLineWidth = Math.max(20, pWidth - 12); // min 20 width

      for (const p of paragraphs) {
        if (p.trim() === "") {
          lines.push("");
          continue;
        }
        const words = p.split(" ");
        let currentLine = "";
        for (const word of words) {
          const testLine = currentLine ? currentLine + " " + word : word;
          const testWidth = ctx.measureText(testLine).width;
          if (testWidth > maxLineWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }
      }

      // Draw all wrapped lines
      const alignment = style.align || "center";
      const lineMultiplier = style.lineHeightMultiplier || 1.15;
      const totalTextHeight = lines.length * proportionalFontSize * lineMultiplier;
      
      // Vertically center the block of text within pHeight
      let startY = py + (pHeight - totalTextHeight) / 2 + (proportionalFontSize / 2);
      if (startY < py + 4) {
        startY = py + (proportionalFontSize / 2) + 4;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const lineWidth = ctx.measureText(line).width;
        let startX = px + (pWidth - lineWidth) / 2; // Default center

        if (alignment === "left") {
          startX = px + 6; // 6px padding from left edge
        } else if (alignment === "right") {
          startX = px + pWidth - lineWidth - 6; // 6px padding from right edge
        }

        ctx.fillText(line, startX, startY + (i * proportionalFontSize * lineMultiplier));
      }

      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Canvas composing failsafe:", error);
    return "";
  }
}
