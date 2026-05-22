import { BoundingBox } from "../types";

/**
 * Inpainting Workflow:
 * 1. Extract the masked region from the original image (person area)
 * 2. Generate a background inpainting mask to reconstruct what was behind the person
 * 3. Remove the person completely and fill with reconstructed background
 * 4. Insert the new person into the cleaned area
 * 
 * This ensures:
 * - Old person disappears completely (not just replaced)
 * - Background is intelligently reconstructed
 * - New person fits naturally without overlap
 */

export interface InpaintingRequest {
  originalImage: string; // Base64 image data
  maskBox: BoundingBox; // Person bounding box
  newPersonImage: string; // Base64 new person image
  preserveBackground?: boolean; // Whether to reconstruct background
}

export interface InpaintingResult {
  cleanedImage: string; // Image with person removed and background reconstructed
  finalImage: string; // Final image with new person placed
  maskApplied: boolean;
}

/**
 * Step 1: Create a binary mask of the area to be inpainted
 * Returns a canvas-based mask image
 */
export async function createInpaintMask(
  canvasWidth: number,
  canvasHeight: number,
  box: BoundingBox,
  featherEdges: number = 10
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Unable to get 2D context for mask creation");

  // Start with transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate pixel coordinates from percentage box
  const px = (box.x / 100) * canvas.width;
  const py = (box.y / 100) * canvas.height;
  const pWidth = (box.width / 100) * canvas.width;
  const pHeight = (box.height / 100) * canvas.height;

  // Draw white mask region (white = area to inpaint)
  ctx.fillStyle = "rgba(255, 255, 255, 1)";

  // Apply Gaussian-like feathering by drawing multiple circles at decreasing opacity
  if (featherEdges > 0) {
    const steps = 5;
    for (let i = steps; i > 0; i--) {
      const scale = 1 - (i / steps) * 0.3; // Gradually scale down
      const alpha = (i / steps) * 0.6; // Gradually reduce opacity
      ctx.globalAlpha = alpha;
      ctx.fillRect(
        px - (pWidth * (1 - scale)) / 2,
        py - (pHeight * (1 - scale)) / 2,
        pWidth * scale,
        pHeight * scale
      );
    }
    ctx.globalAlpha = 1.0; // Reset alpha
  } else {
    ctx.fillRect(px, py, pWidth, pHeight);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Step 2: Remove the person and reconstruct background using contextual inpainting
 * Uses Gemini Vision API to intelligently fill the masked region
 */
export async function removePersonAndReconstruct(
  originalImageBase64: string,
  maskBase64: string,
  maskBox: BoundingBox
): Promise<string> {
  try {
    // Call backend API to use Gemini for inpainting
    const response = await fetch("/api/inpaint-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: originalImageBase64,
        mask: maskBase64,
        boundingBox: maskBox,
      }),
    });

    if (!response.ok) {
      throw new Error(`Inpainting API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.cleanedImage;
  } catch (error) {
    console.error("Background reconstruction failed:", error);
    // Fallback: return original image if API fails
    return originalImageBase64;
  }
}

/**
 * Step 3: Composite the new person onto the cleaned background
 * Creates the final seamless result
 */
export async function compositeNewPerson(
  cleanedBackgroundBase64: string,
  newPersonBase64: string,
  maskBox: BoundingBox,
  fitMode: "contain" | "cover" | "stretch" = "contain",
  featherEdges: number = 5
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Load cleaned background
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";

    bgImg.onload = () => {
      // Load new person image
      const personImg = new Image();
      personImg.crossOrigin = "anonymous";

      personImg.onload = () => {
        try {
          // Create high-resolution canvas
          const canvas = document.createElement("canvas");
          canvas.width = bgImg.naturalWidth;
          canvas.height = bgImg.naturalHeight;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            throw new Error("Unable to get 2D context");
          }

          // 1. Draw cleaned background
          ctx.drawImage(bgImg, 0, 0);

          // 2. Calculate target position and dimensions
          const px = (maskBox.x / 100) * canvas.width;
          const py = (maskBox.y / 100) * canvas.height;
          const pWidth = (maskBox.width / 100) * canvas.width;
          const pHeight = (maskBox.height / 100) * canvas.height;

          // 3. Create offscreen canvas for new person with filters
          const osCanvas = document.createElement("canvas");
          osCanvas.width = pWidth || 100;
          osCanvas.height = pHeight || 100;
          const osCtx = osCanvas.getContext("2d");

          if (!osCtx) {
            throw new Error("Unable to get offscreen 2D context");
          }

          // 4. Calculate scaling to fit person into the box
          const targetRatio = pWidth / pHeight;
          const sourceRatio = personImg.naturalWidth / personImg.naturalHeight;

          let drawWidth = pWidth;
          let drawHeight = pHeight;
          let dx = 0;
          let dy = 0;

          if (fitMode === "contain") {
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
          } else if (fitMode === "cover") {
            if (sourceRatio > targetRatio) {
              drawWidth = pHeight * sourceRatio;
              dx = -(drawWidth - pWidth) / 2;
              dy = 0;
              drawHeight = pHeight;
            } else {
              drawHeight = pWidth / sourceRatio;
              dx = 0;
              dy = -(drawHeight - pHeight) / 2;
              drawWidth = pWidth;
            }
          } else if (fitMode === "stretch") {
            drawWidth = pWidth;
            drawHeight = pHeight;
            dx = 0;
            dy = 0;
          }

          // 5. Draw new person on offscreen canvas
          osCtx.drawImage(personImg, dx, dy, drawWidth, drawHeight);

          // 6. Create soft feather mask for natural blending
          const featherCanvas = document.createElement("canvas");
          featherCanvas.width = pWidth || 100;
          featherCanvas.height = pHeight || 100;
          const featherCtx = featherCanvas.getContext("2d");

          if (featherCtx && featherEdges > 0) {
            // Create a radial gradient mask for soft edges
            const gradient = featherCtx.createRadialGradient(
              pWidth / 2,
              pHeight / 2,
              0,
              pWidth / 2,
              pHeight / 2,
              Math.max(pWidth, pHeight) / 2
            );
            gradient.addColorStop(0, "rgba(0, 0, 0, 1)"); // Opaque center
            gradient.addColorStop(0.7, "rgba(0, 0, 0, 0.8)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)"); // Transparent edges

            featherCtx.fillStyle = gradient;
            featherCtx.fillRect(0, 0, pWidth, pHeight);

            // Apply feather mask using globalCompositeOperation
            osCtx.save();
            osCtx.globalCompositeOperation = "destination-out";
            osCtx.drawImage(featherCanvas, 0, 0);
            osCtx.restore();
          }

          // 7. Composite the new person onto the main canvas
          ctx.save();
          ctx.drawImage(osCanvas, px, py);
          ctx.restore();

          // 8. Return final composited image
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };

      personImg.onerror = () =>
        reject(new Error("Failed to load new person image"));
      personImg.crossOrigin = "anonymous";
      personImg.src = newPersonBase64;
    };

    bgImg.onerror = () => reject(new Error("Failed to load background image"));
    bgImg.src = cleanedBackgroundBase64;
  });
}

/**
 * Complete Inpainting Pipeline:
 * Takes original image, person bounding box, and new person image
 * Returns final composite with seamless person replacement
 */
export async function performInpainting(
  request: InpaintingRequest
): Promise<InpaintingResult> {
  try {
    // Step 1: Create binary mask of the person region
    const tempImg = new Image();
    tempImg.src = request.originalImage;

    // We need to know canvas dimensions first
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const testImg = new Image();
      testImg.crossOrigin = "anonymous";
      testImg.onload = () => resolve(testImg);
      testImg.onerror = () => reject(new Error("Failed to load image"));
      testImg.src = request.originalImage;
    });

    const maskBase64 = await createInpaintMask(
      img.naturalWidth,
      img.naturalHeight,
      request.maskBox,
      15 // feather amount
    );

    // Step 2: Remove person and reconstruct background
    const cleanedImage = request.preserveBackground !== false
      ? await removePersonAndReconstruct(
          request.originalImage,
          maskBase64,
          request.maskBox
        )
      : request.originalImage;

    // Step 3: Composite new person onto cleaned background
    const finalImage = await compositeNewPerson(
      cleanedImage,
      request.newPersonImage,
      request.maskBox,
      "contain",
      10 // feather edges for soft blending
    );

    return {
      cleanedImage,
      finalImage,
      maskApplied: true,
    };
  } catch (error) {
    console.error("Inpainting pipeline failed:", error);
    throw error;
  }
}

/**
 * Utility: Apply smart content-aware fill to a region
 * Uses the Gemini API for intelligent background reconstruction
 */
export async function smartContentAwareFill(
  imageBase64: string,
  boundingBox: BoundingBox
): Promise<string> {
  try {
    const response = await fetch("/api/content-aware-fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        boundingBox: boundingBox,
      }),
    });

    if (!response.ok) {
      throw new Error(`Content-aware fill API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.filledImage;
  } catch (error) {
    console.error("Smart content-aware fill failed:", error);
    return imageBase64;
  }
}
