import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Shared Gemini server-side client with active User-Agent tracking
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser setup for base64 images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API route for health metrics
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API route for AI image analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing 'image' parameter in request body." });
      }

      // Check if Gemini API key exists
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "API Key Required",
          details: "The GEMINI_API_KEY environment variable is not defined on the server. Please add your credentials inside the Secrets panel in AI Studio."
        });
      }

      // Parse payload mime and extract base64 bytes
      let mimeType = "image/png";
      let base64Data = image;

      if (image.includes(";base64,")) {
        const parts = image.split(";base64,");
        mimeType = parts[0].replace("data:", "");
        base64Data = parts[1];
      }

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const promptPart = {
        text: `Analyze this image thoroughly to identify distinct visual components that a user might want to edit, customize, or replace.
Specifically focus on:
1. "text": Any visible text blocks, titles, logo marks with readable wording, templates, subtitles, or captions. Provide the exact text found in the 'originalText' field.
2. "person": Any people, face profiles, characters, or portraits.
3. "graphic": Icons, logotypes, product items, stickers, patterns, custom badges, or illustrations.
4. "background": The general visual background or sky layer if distinct.

For each component, map its precise relative bounding box on a percentage scale of 0 to 100:
- 'x' (start percentage from left border, 0-100)
- 'y' (start percentage from top border, 0-100)
- 'width' (span width percentage, 0-100)
- 'height' (span height percentage, 0-100)

Make sure coordinates are as accurate as possible. Return the list of elements as clean JSON structure conforming to the specified responseSchema. Ensure each item has a unique, descriptive ID (e.g., text_1, person_1, graphic_1).`,
      };

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [imagePart, promptPart],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedElements: {
                type: Type.ARRAY,
                description: "Recognized components within the uploaded composition",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "Unique semantic id of the component" },
                    type: { type: Type.STRING, description: "Must be exactly: 'text', 'person', 'graphic', or 'background'" },
                    label: { type: Type.STRING, description: "Brief visual description of the parsed element" },
                    originalText: { type: Type.STRING, description: "The literal transcription of the text found within this boundaries, if any" },
                    box: {
                      type: Type.OBJECT,
                      description: "Bounding box relative percentages",
                      properties: {
                        x: { type: Type.NUMBER, description: "Relative X percentage offset (0 to 100)" },
                        y: { type: Type.NUMBER, description: "Relative Y percentage offset (0 to 100)" },
                        width: { type: Type.NUMBER, description: "Normalized percent width (0 to 100)" },
                        height: { type: Type.NUMBER, description: "Normalized percent height (0 to 100)" }
                      },
                      required: ["x", "y", "width", "height"]
                    }
                  },
                  required: ["id", "type", "label", "box"]
                }
              }
            },
            required: ["detectedElements"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response received from analyzer model.");
      }

      const dataResult = JSON.parse(text.trim());
      return res.json(dataResult);

    } catch (e: any) {
      console.error("Express Gemini route error:", e);
      return res.status(500).json({
        error: "AI Image Parsing Failed",
        details: e.message || String(e)
      });
    }
  });

  // Express API route for contextual chatbot chat assistant
  app.post("/api/chat-assistant", async (req, res) => {
    try {
      const { message, elementType, elementLabel, originalText, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Missing 'message' in request body" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "API Key Required",
          details: "Please define the GEMINI_API_KEY environment variable to enable the AI Graphic Assistant Chatbot."
        });
      }

      // Prepare conversation contents with a helpful initial system instruction
      const systemInstruction = `You are a smart AI Graphic Copilot and creative copywriting assistant embedded directly in an interactive banner/poster layout editor.
The user is working with a specific template region:
- Element Type: "${elementType}"
- Visual Role: "${elementLabel}"
${elementType === "text" ? `- Original Text: "${originalText || ""}"\n- Goal: Help rewrite, adapt, format, or translate text. When suggesting rewritten options, always end your bubble with a clearly marked "[APPLY: your proposed text]" tag, so the frontend UI can provide a 1-click apply button!` : "- Goal: Support image uploads or let the user generate custom graphic replacements. Users can type prompts like 'generate a cyberpunk lion logo' or 'make a cute dog avatar' to create new visuals."}

Keep your responses friendly, concise & visually engaging (approx 1-3 sentences). Do not use dry developer terminology. Speak direct to the user as their creative companion.`;

      const ai = getGenAI();
      
      // Convert history to standard contents array if provided
      const contentsList: any[] = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contentsList.push({
            role: msg.sender === "user" ? "user" : "model",
            parts: [{ text: msg.text }]
          });
        }
      }
      
      // Append current user message
      contentsList.push({
        role: "user",
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contentsList,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const text = response.text || "I'm listening! How can I help you customize this region?";
      
      // Extract optional apply-tag if present (e.g. "[APPLY: HELLO WORLD]")
      let suggestedText: string | null = null;
      const applyMatch = text.match(/\[APPLY:\s*([^\]]+)\]/i);
      if (applyMatch && applyMatch[1]) {
        suggestedText = applyMatch[1].trim();
      }

      return res.json({
        reply: text,
        suggestedText
      });

    } catch (e: any) {
      console.error("Chat assistant error:", e);
      return res.status(500).json({
        error: "Chat Assistant Failed",
        details: e.message || String(e)
      });
    }
  });

  // Express API route for AI text-to-image replacement generation
  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing 'prompt' in request body" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "API Key Required",
          details: "Please define the GEMINI_API_KEY environment variable to use Image Generation features."
        });
      }

      const ai = getGenAI();
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      });

      if (!response.generatedImages || response.generatedImages.length === 0) {
        throw new Error("No image was generated by the Imagen model.");
      }

      const base64Bytes = response.generatedImages[0].image.imageBytes;
      const dataUri = `data:image/jpeg;base64,${base64Bytes}`;

      return res.json({ imageUrl: dataUri });

    } catch (e: any) {
      console.error("Image generation error:", e);
      return res.status(500).json({
        error: "Image Generation Failed",
        details: e.message || String(e)
      });
    }
  });

  // Development Server Middleware or Standalone Routing
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Correct SPA fallback based on instruction:
      // Express v4 uses '*' whereas Express v5 uses '*all'
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Image Analyst Server running on http://localhost:${PORT}`);
  });
}

startServer();
