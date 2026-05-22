import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  X, 
  Sparkles, 
  Download, 
  Type as FontIcon, 
  User, 
  Plus, 
  RefreshCw, 
  Palette, 
  Eye, 
  Sliders, 
  Grid, 
  ArrowRight, 
  AlertCircle, 
  Crop, 
  Image as ImageIcon, 
  CheckCircle2,
  Trash2,
  Lock,
  ChevronRight,
  HelpCircle,
  FileText,
  Maximize,
  Bot,
  Send,
  MessageSquare
} from "lucide-react";
import { PRESET_IMAGES } from "./constants";
import { DetectedElement, EditedElement, ElementType, TextStyleOptions } from "./types";
import { cropElement, composeFinalImage, sampleBorderColor } from "./utils/imageUtils";

export default function App() {
  // Primary state values
  const [activeImage, setActiveImage] = useState<string>(PRESET_IMAGES[0].url);
  const [activePresetId, setActivePresetId] = useState<string>("preset-team");
  const [detectedElements, setDetectedElements] = useState<DetectedElement[]>(PRESET_IMAGES[0].elements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(PRESET_IMAGES[0].elements[0]?.id || null);
  const [edits, setEdits] = useState<Record<string, EditedElement>>({});
  
  // Real-time crops dictionary for original face/design crops
  const [crops, setCrops] = useState<Record<string, string>>({});
  
  // UI and loading states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showApiSetupHint, setShowApiSetupHint] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<"side-by-side" | "canvas-overlay">("canvas-overlay");
  const [isResultPreviewActive, setIsResultPreviewActive] = useState<boolean>(false);
  const [finalComposedUrl, setFinalComposedUrl] = useState<string>("");
  const [isComposing, setIsComposing] = useState<boolean>(false);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);

  // Manual positioning state for fine-tuning
  const [isNudging, setIsNudging] = useState<boolean>(false);

  // Toggle to keep original element bounding-box dimensions on uploading replacement photo
  const [keepOriginalSizeOnUpload, setKeepOriginalSizeOnUpload] = useState<boolean>(true);

  // Contextual Chatbot Assistant states
  interface ChatMessage {
    id: string;
    sender: "user" | "bot";
    text: string;
    suggestedText?: string;
    imageUrl?: string;
    timestamp: Date;
  }
  const [elementChats, setElementChats] = useState<Record<string, ChatMessage[]>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [isChatLoading, setIsChatLoading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean defaults for text elements
  const createDefaultTextStyle = (elementId?: string): TextStyleOptions => {
    const el = detectedElements.find(e => e.id === elementId);
    const defaults = el?.defaultTextStyle || {};
    return {
      fontSize: defaults.fontSize || 24,
      color: defaults.color || "#ffffff",
      fontFamily: defaults.fontFamily || "Plus Jakarta Sans",
      bold: defaults.bold ?? true,
      italic: defaults.italic ?? false,
      uppercase: defaults.uppercase ?? false,
      letterSpacing: defaults.letterSpacing || "0.05em",
      backgroundColor: defaults.backgroundColor || "#000000",
      backgroundOpacity: defaults.backgroundOpacity || 0.0,
    };
  };

  // Automatically sample surrounding colors for each detected element to match the poster background perfectly
  const autoSampleMaskColors = async (imageUrl: string, elements: DetectedElement[]) => {
    const updatedEdits: Record<string, EditedElement> = {};
    for (const el of elements) {
      try {
        const sampledColor = await sampleBorderColor(imageUrl, el.box);
        updatedEdits[el.id] = {
          id: el.id,
          type: el.type,
          isMaskOn: true,
          maskColor: sampledColor,
          fitMode: el.type === "person" ? "cover" : "contain",
          textStyle: el.type === "text" ? createDefaultTextStyle(el.id) : undefined
        };
      } catch (err) {
        console.warn(`Failed to auto-sample border colors for element: ${el.id}`, err);
      }
    }
    setEdits(prev => ({
      ...prev,
      ...updatedEdits
    }));
  };

  // Run initial color sampling for preset elements on mount
  useEffect(() => {
    if (activeImage && detectedElements.length > 0) {
      autoSampleMaskColors(activeImage, detectedElements);
    }
  }, []);

  // Re-generate crops mapping whenever the base image or its detected elements change
  useEffect(() => {
    let active = true;
    async function updateCrops() {
      const newCrops: Record<string, string> = {};
      for (const el of detectedElements) {
        if (el.type === "person" || el.type === "graphic") {
          try {
            const cropDataUrl = await cropElement(activeImage, el.box);
            if (cropDataUrl) {
              newCrops[el.id] = cropDataUrl;
            }
          } catch (err) {
            console.error("Failed to pre-crop element id: " + el.id, err);
          }
        }
      }
      if (active) {
        setCrops(newCrops);
      }
    }
    updateCrops();
    return () => {
      active = false;
    };
  }, [activeImage, detectedElements]);

  // Compose high-res output client-side in real-time as edits are input by the user
  useEffect(() => {
    let active = true;
    let timeoutId = setTimeout(async () => {
      if (!activeImage) return;
      setIsComposing(true);
      try {
        const url = await composeFinalImage(activeImage, detectedElements, edits);
        if (active && url) {
          setFinalComposedUrl(url);
        }
      } catch (err) {
        console.error("Composer trigger failed", err);
      } finally {
        if (active) setIsComposing(false);
      }
    }, 400); // Debounce compositing to respect sliding updates

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [activeImage, detectedElements, edits]);

  // Handle preset image selection
  const selectPreset = (presetId: string) => {
    const preset = PRESET_IMAGES.find(p => p.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setActiveImage(preset.url);
    setDetectedElements(preset.elements);
    setSelectedElementId(preset.elements[0]?.id || null);
    setEdits({});
    setApiError(null);
    autoSampleMaskColors(preset.url, preset.elements);
  };

  // Helper to convert files to base64 Data URLs
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // User uploaded their own custom base layout image
  const handleBaseImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setApiError(null);
      const base64Str = await convertFileToBase64(file);
      
      // Update UI with local picture immediately
      setActiveImage(base64Str);
      setActivePresetId("custom-workspace");
      
      // Attempt to invoke server-side Gemini Model to intelligently parse bounding coordinates
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Str })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `HTTP ${response.status} failed to parse image layout.`);
      }

      const result = await response.json();
      if (result.detectedElements && Array.isArray(result.detectedElements)) {
        setDetectedElements(result.detectedElements);
        setSelectedElementId(result.detectedElements[0]?.id || null);
        setEdits({});
        autoSampleMaskColors(base64Str, result.detectedElements);
      } else {
        throw new Error("Invalid schema received in backend AI response.");
      }

    } catch (err: any) {
      console.warn("AI extraction route failed. Setting up manual crop sandbox.", err);
      setApiError(err.message || String(err));
      // Fallback empty elements array so they can still manually build layouts:
      setDetectedElements([]);
      setSelectedElementId(null);
      setEdits({});
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Send message or upload file within the contextual AI Copilot Chatbot
  const sendMessageToAssistant = async (elementId: string, customMessage?: string, customFile?: File) => {
    const inputMsg = customMessage !== undefined ? customMessage : (chatInputs[elementId] || "").trim();
    if (!inputMsg && !customFile) return;

    const element = detectedElements.find(e => e.id === elementId);
    if (!element) return;

    // Clear current input
    if (customMessage === undefined) {
      setChatInputs(prev => ({ ...prev, [elementId]: "" }));
    }

    // Prepare user chat message
    const userMsgId = `msg-user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: inputMsg || "Uploaded an image file",
      timestamp: new Date()
    };

    if (customFile) {
      try {
        const fileUrl = await convertFileToBase64(customFile);
        userMessage.imageUrl = fileUrl;
      } catch (err) {
        console.error("Failed to parse file for chat display", err);
      }
    }

    // Add user message to local history
    const currentHistory = elementChats[elementId] || [];
    const updatedHistory = [...currentHistory, userMessage];
    setElementChats(prev => ({
      ...prev,
      [elementId]: updatedHistory
    }));

    // Trigger loading status
    setIsChatLoading(prev => ({ ...prev, [elementId]: true }));

    try {
      // 1. If it's an image element under a "generate image" intent
      const isGenerateRequest = (element.type === "person" || element.type === "graphic") && 
        inputMsg && 
        /generate|create|make|draw|paint|sketch|render|show me a/i.test(inputMsg);

      if (isGenerateRequest) {
        // Show progress indicator
        const progressMsg: ChatMessage = {
          id: `msg-bot-progress-${Date.now()}`,
          sender: "bot",
          text: `🎨 Generating a custom graphic for "${inputMsg}" using Imagen-4... Please wait a few seconds!`,
          timestamp: new Date()
        };
        setElementChats(prev => ({
          ...prev,
          [elementId]: [...updatedHistory, progressMsg]
        }));

        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: inputMsg })
        });

        const data = await res.json();
        if (data.error) {
          throw new Error(data.details || data.error);
        }

        if (data.imageUrl) {
          // Success! Update active element replacement edits
          const currentEdit = edits[elementId] || {
            id: elementId,
            type: element.type,
            isMaskOn: true,
            maskColor: "#111827",
            fitMode: element.type === "person" ? "cover" : "contain"
          };

          setEdits(prev => ({
            ...prev,
            [elementId]: {
              ...currentEdit,
              replacedImage: data.imageUrl,
              originalAspectRatio: 1.0,
              userUploadedRatio: 1.0
            }
          }));

          const successMsg: ChatMessage = {
            id: `msg-bot-success-${Date.now()}`,
            sender: "bot",
            text: `✨ I have successfully generated a gorgeous replacement layout graphic and updated it for your canvas box!`,
            imageUrl: data.imageUrl,
            timestamp: new Date()
          };

          setElementChats(prev => ({
            ...prev,
            [elementId]: [...updatedHistory, successMsg]
          }));
        }
        return;
      }

      // 2. If it's a file selection
      if (customFile) {
        await handleReplacementUpload(elementId, customFile);
        
        const successMsg: ChatMessage = {
          id: `msg-bot-success-${Date.now()}`,
          sender: "bot",
          text: `✨ Asset successfully replaced! I have scaled and positioned your uploaded file inside this layout section.`,
          timestamp: new Date()
        };

        setElementChats(prev => ({
          ...prev,
          [elementId]: [...updatedHistory, successMsg]
        }));
        return;
      }

      // 3. Conversational copywriting rewrite assistant
      const chatHistoryForAPI = currentHistory.map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const res = await fetch("/api/chat-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: inputMsg,
          elementType: element.type,
          elementLabel: element.label,
          originalText: element.originalText,
          history: chatHistoryForAPI
        })
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(data.details || data.error);
      }

      const botResponse: ChatMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: "bot",
        text: data.reply,
        suggestedText: data.suggestedText || undefined,
        timestamp: new Date()
      };

      setElementChats(prev => ({
        ...prev,
        [elementId]: [...updatedHistory, botResponse]
      }));

    } catch (err: any) {
      console.error("AI Assistant response error:", err);
      const errorMsg: ChatMessage = {
        id: `msg-bot-err-${Date.now()}`,
        sender: "bot",
        text: `⚠️ Error processing: ${err.message || String(err)}. Verify server active state in secrets.`,
        timestamp: new Date()
      };
      setElementChats(prev => ({
        ...prev,
        [elementId]: [...updatedHistory, errorMsg]
      }));
    } finally {
      setIsChatLoading(prev => ({ ...prev, [elementId]: false }));
    }
  };

  // Handle uploading replacement photo for any specific person or graphic
  const handleReplacementUpload = async (elementId: string, file: File) => {
    try {
      const base64Str = await convertFileToBase64(file);
      
      // Discover natural dimensions
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratio = w / h;

        const element = detectedElements.find(e => e.id === elementId);
        const currentEdit = edits[elementId] || {
          id: elementId,
          type: element?.type || "person",
          isMaskOn: true,
          maskColor: "#ffffff",
          fitMode: "cover"
        };

        setEdits(prev => ({
          ...prev,
          [elementId]: {
            ...currentEdit,
            replacedImage: base64Str,
            isMaskOn: true,
            replacedImageWidth: w,
            replacedImageHeight: h,
            replacedImageRatio: ratio,
            fitMode: currentEdit.fitMode || "contain"
          }
        }));

        // Instantly alter the bounding box shape and aspect ratio to match the uploaded image perfectly if configured
        if (!keepOriginalSizeOnUpload) {
          setDetectedElements(prev => prev.map(item => {
            if (item.id === elementId) {
              const centerX = item.box.x + item.box.width / 2;
              const centerY = item.box.y + item.box.height / 2;

              let newWidth = item.box.width;
              let newHeight = item.box.height;

              if (ratio < 0.9) {
                // Tall portrait - set a beautiful height of 40%
                newHeight = 40;
                newWidth = newHeight * ratio;
              } else if (ratio > 1.1) {
                // Wide landscape - set a beautiful width of 45%
                newWidth = 45;
                newHeight = newWidth / ratio;
              } else {
                // Clean square
                newWidth = 35;
                newHeight = 35;
              }

              // Center the newly sized box precisely over the original location
              let newX = centerX - newWidth / 2;
              let newY = centerY - newHeight / 2;

              // Safe boundary constraints to keep elements perfectly within canvas
              if (newX < 2) newX = 2;
              if (newY < 2) newY = 2;
              if (newX + newWidth > 98) {
                newWidth = 98 - newX;
                newHeight = newWidth / ratio;
              }
              if (newY + newHeight > 98) {
                newHeight = 98 - newY;
                newWidth = newHeight * ratio;
              }

              return {
                ...item,
                box: {
                  x: parseFloat(newX.toFixed(1)),
                  y: parseFloat(newY.toFixed(1)),
                  width: parseFloat(newWidth.toFixed(1)),
                  height: parseFloat(newHeight.toFixed(1))
                }
              };
            }
            return item;
          }));
        }
      };
      img.src = base64Str;
    } catch (err) {
      console.error("Replacement conversion error:", err);
    }
  };

  // Handle manual removal of inline replacements
  const handleRemoveReplacement = (elementId: string) => {
    setEdits(prev => {
      const copy = { ...prev };
      if (copy[elementId]) {
        delete copy[elementId].replacedImage;
      }
      return copy;
    });
  };

  // Handle adaptation fitting choices for custom replacement uploads
  const handleReplacementFitModeUpdate = (elementId: string, fitMode: "contain" | "cover" | "stretch") => {
    setEdits(prev => ({
      ...prev,
      [elementId]: {
        ...(prev[elementId] || {
          id: elementId,
          type: detectedElements.find(e => e.id === elementId)?.type || "person",
          isMaskOn: true,
          maskColor: "#111827"
        }),
        fitMode
      }
    }));
  };

  // Update precision blending fields for person/graphic element
  const handleBlendingUpdate = (elementId: string, key: keyof EditedElement, value: any) => {
    setEdits(prev => ({
      ...prev,
      [elementId]: {
        ...(prev[elementId] || {
          id: elementId,
          type: detectedElements.find(e => e.id === elementId)?.type || "person",
          isMaskOn: true,
          maskColor: "#111827",
          fitMode: "contain"
        }),
        [key]: value
      }
    }));
  };

  // Bulk update fields for blending presets
  const applyBlendingPreset = (elementId: string, presetFields: Partial<EditedElement>) => {
    setEdits(prev => ({
      ...prev,
      [elementId]: {
        ...(prev[elementId] || {
          id: elementId,
          type: detectedElements.find(e => e.id === elementId)?.type || "person",
          isMaskOn: true,
          maskColor: "#111827",
          fitMode: "contain"
        }),
        ...presetFields
      }
    }));
  };

  // Keep size fully dynamic: Auto-adjust box height and width to match the uploaded image's exact natural aspect ratio
  const handleAutoAdjustAspect = (elementId: string) => {
    const edit = edits[elementId];
    const element = detectedElements.find(e => e.id === elementId);
    if (!element || !edit?.replacedImageRatio) return;

    const ratio = edit.replacedImageRatio; // width / height
    setDetectedElements(prev => prev.map(item => {
      if (item.id === elementId) {
        const centerX = item.box.x + item.box.width / 2;
        const centerY = item.box.y + item.box.height / 2;

        let newWidth = item.box.width;
        let newHeight = item.box.height;

        if (ratio < 0.9) {
          // Tall portrait - 40% height standard
          newHeight = 40;
          newWidth = newHeight * ratio;
        } else if (ratio > 1.1) {
          // Wide landscape - 45% width standard
          newWidth = 45;
          newHeight = newWidth / ratio;
        } else {
          // Clean square - 35% standard
          newWidth = 35;
          newHeight = 35;
        }

        let newX = centerX - newWidth / 2;
        let newY = centerY - newHeight / 2;

        // Safe boundaries
        if (newX < 2) newX = 2;
        if (newY < 2) newY = 2;
        if (newX + newWidth > 98) {
          newWidth = 98 - newX;
          newHeight = newWidth / ratio;
        }
        if (newY + newHeight > 98) {
          newHeight = 98 - newY;
          newWidth = newHeight * ratio;
        }

        return {
          ...item,
          box: {
            x: parseFloat(newX.toFixed(1)),
            y: parseFloat(newY.toFixed(1)),
            width: parseFloat(newWidth.toFixed(1)),
            height: parseFloat(newHeight.toFixed(1))
          }
        };
      }
      return item;
    }));
  };

  // Handle updating text styles
  const handleTextEditChange = (elementId: string, updatedText: string) => {
    const current = edits[elementId] || {
      id: elementId,
      type: "text" as ElementType,
      isMaskOn: true,
      maskColor: "#1c2434",
      textStyle: createDefaultTextStyle(elementId)
    };

    setEdits(prev => ({
      ...prev,
      [elementId]: {
        ...current,
        replacedText: updatedText,
        textStyle: current.textStyle || createDefaultTextStyle(elementId)
      }
    }));
  };

  const handleTextStyleUpdate = (elementId: string, key: keyof TextStyleOptions, value: any) => {
    const element = detectedElements.find(e => e.id === elementId);
    if (!element) return;

    const current = edits[elementId] || {
      id: elementId,
      type: element.type,
      isMaskOn: true,
      maskColor: "#101827",
      replacedText: element.originalText || "Sample Wording",
      textStyle: createDefaultTextStyle(elementId)
    };

    const updatedStyles = {
      ...(current.textStyle || createDefaultTextStyle(elementId)),
      [key]: value
    };

    setEdits(prev => ({
      ...prev,
      [elementId]: {
        ...current,
        textStyle: updatedStyles
      }
    }));
  };

  // Sample or switch background solid mask colors
  const handleToggleMask = (elementId: string, isMaskOn: boolean) => {
    setEdits(prev => {
      const item = prev[elementId] || {
        id: elementId,
        type: detectedElements.find(e => e.id === elementId)?.type || "person",
        isMaskOn: false,
        maskColor: "#111827"
      };
      return {
        ...prev,
        [elementId]: {
          ...item,
          isMaskOn: isMaskOn
        }
      };
    });
  };

  const handleMaskColorUpdate = (elementId: string, color: string) => {
    setEdits(prev => {
      const item = prev[elementId] || {
        id: elementId,
        type: detectedElements.find(e => e.id === elementId)?.type || "person",
        isMaskOn: true,
        maskColor: color
      };
      return {
        ...prev,
        [elementId]: {
          ...item,
          maskColor: color
        }
      };
    });
  };

  // Allow manual layout creation if needed (e.g., if API key not present, giving incredible usability)
  const addNewCustomBoundingBox = (type: ElementType) => {
    const randomId = `${type}_manual_${Date.now().toString().slice(-4)}`;
    const newElement: DetectedElement = {
      id: randomId,
      type,
      label: `Custom Drawn ${type.toUpperCase()}`,
      originalText: type === "text" ? "ENTER WORDINGS" : undefined,
      box: {
        x: 35,
        y: 35,
        width: 30,
        height: 15
      }
    };

    setDetectedElements(prev => [...prev, newElement]);
    setSelectedElementId(randomId);

    // Bootstrap correct edits properties
    if (type === "text") {
      setEdits(prev => ({
        ...prev,
        [randomId]: {
          id: randomId,
          type: "text",
          replacedText: "ENTER WORDINGS",
          isMaskOn: false,
          maskColor: "#05070c",
          textStyle: createDefaultTextStyle()
        }
      }));
    } else {
      setEdits(prev => ({
        ...prev,
        [randomId]: {
          id: randomId,
          type,
          isMaskOn: false,
          maskColor: "#04060a"
        }
      }));
    }
  };

  // Delete element from active workspace
  const deleteElement = (elementId: string) => {
    setDetectedElements(prev => prev.filter(e => e.id !== elementId));
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
    setEdits(prev => {
      const copy = { ...prev };
      delete copy[elementId];
      return copy;
    });
  };

  const selectedElement = detectedElements.find(e => e.id === selectedElementId);
  const selectedEdit = selectedElementId ? edits[selectedElementId] : null;

  // Render badge label utility
  const getBadgeStyles = (type: ElementType) => {
    switch(type) {
      case "text":
        return { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40", label: "Text Layer" };
      case "person":
        return { bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/40", label: "Portrait Face" };
      case "graphic":
        return { bg: "bg-purple-500/10 text-purple-400 border-purple-500/40", label: "Illustration Asset" };
      default:
        return { bg: "bg-amber-500/10 text-amber-400 border-amber-500/40", label: "Background Block" };
    }
  };

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white antialiased">
      
      {/* ── TOP UTILITY & BRANDING BAR ────────────────────────────────────── */}
      <header className="border-b border-[#14192b] bg-[#090d1a] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between sticky top-0 z-50 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-500 p-[1.5px] flex items-center justify-center shadow-md">
            <div className="h-full w-full rounded-[10px] bg-[#070a14] flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display tracking-tight text-white">
                IMAGRAPH STUDIO
              </h1>
              <span className="text-[10px] uppercase font-mono tracking-wider font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                AI Replacement Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive high-precision replacement sandbox powered by Gemini-3.5 Vision.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 md:mt-0">
          {/* Preset indicator or uploaded mode */}
          <div className="text-xs text-slate-400 bg-[#0e1428] px-3.5 py-1.5 rounded-lg border border-[#19213a] flex items-center gap-2 font-mono">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            Engine Active Model: <span className="text-white font-medium">Gemini-3.5-Flash</span>
          </div>
          
          <button 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 transition-all text-white px-4 py-2 rounded-lg font-medium text-xs shadow-md cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Analyze New Custom Image
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleBaseImageUpload}
            accept="image/*" 
            className="hidden" 
          />
        </div>
      </header>

      {/* ── CENTRAL ENVIRONMENT ────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto">
        
        {/* ── LEFT/CENTER WORKSPACE (8 COLS ON DESKTOP) ───────────────────── */}
        <section id="canvas_section" className="lg:col-span-7 xl:col-span-8 p-6 flex flex-col border-r border-[#14192b] bg-[#05070e] relative">
          
          {/* APLET HEALTH / SECRET CONFIG HINT */}
          {showApiSetupHint && (
            <div className="mb-4 bg-gradient-to-r from-[#0d152a] to-[#04060d] border border-blue-500/20 rounded-xl p-4 flex gap-3 text-sm relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl"></div>
              <AlertCircle className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-indigo-300">Sandbox Operational & Preview Ready</h4>
                  <button 
                    onClick={() => setShowApiSetupHint(false)}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  Upload custom layouts or click on presets to edit real-time. If the GEMINI_API_KEY environment variable is missing on server, no worries! The preset layouts are fully interactive so you can test replacement pipelines instantly.
                </p>
              </div>
            </div>
          )}

          {/* PRESETS STRIP */}
          <div className="mb-5 bg-[#090d1a] border border-[#14192b] p-3 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <ImageIcon className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Interactive Template:
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
              {PRESET_IMAGES.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => selectPreset(preset.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border flex items-center gap-2 ${
                    activePresetId === preset.id
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-400/40 shadow-sm"
                      : "bg-[#0b0e19] text-slate-400 border-[#1c243c] hover:text-white"
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activePresetId === preset.id ? "#818cf8" : "#475569" }}></div>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* VIEWPORT HEADER TABS */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-slate-400 tracking-wider">Canvas Monitor</span>
              <div className="h-1 w-1 rounded-full bg-indigo-500"></div>
              <span className="text-xs text-indigo-400 font-medium font-mono">
                {detectedElements.length} AI Components Detected
              </span>
            </div>

            {/* COMPARATIVE TOGGLES */}
            <div className="flex bg-[#0a0d1a] p-1 rounded-lg border border-[#17203b]">
              <button
                onClick={() => setIsResultPreviewActive(false)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  !isResultPreviewActive
                    ? "bg-[#141a31] text-white shadow-sm border-r border-[#1e2949]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Grid className="w-3.5 h-3.5 text-indigo-400" />
                Interactions Draft
              </button>
              <button
                onClick={() => setIsResultPreviewActive(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isResultPreviewActive
                    ? "bg-[#141a31] text-white shadow-sm border-l border-[#1e2949]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                Render Canvas Output
              </button>
            </div>
          </div>

          {/* MAIN VISUAL CONTAINER */}
          <div className="flex-1 flex items-center justify-center p-2 rounded-xl border border-[#14192b] bg-[#02040a]/40 backdrop-blur-sm shadow-inner min-h-[420px] max-h-[820px] relative overflow-auto group">
            
            {/* BACKGROUND DECORATION */}
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#04060d]/90 pointer-events-none"></div>

            {isAnalyzing && (
              <div className="absolute inset-0 bg-[#070914]/90 z-40 flex flex-col items-center justify-center gap-3 backdrop-blur-md">
                <div className="relative">
                  <RefreshCw className="h-10 w-10 text-indigo-400 animate-spin" />
                  <Sparkles className="h-4 w-4 text-emerald-300 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div className="text-center max-w-xs px-4">
                  <h4 className="font-semibold text-white tracking-wide">Evaluating Bounding Boxes</h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Gemini model is scanning faces, graphic designs, vectors, and typography coordinates on percentage index...
                  </p>
                </div>
              </div>
            )}

            {/* ERROR FALLBACK ALERT */}
            {apiError && (
              <div className="absolute bottom-4 left-4 right-4 z-40 bg-rose-950/90 border border-rose-500/40 text-rose-200 p-3 rounded-lg flex items-center gap-3 text-xs backdrop-blur-md">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <div className="flex-grow">
                  <strong className="block font-semibold">Vision Extraction Warning:</strong>
                  {apiError}
                </div>
                <button 
                  onClick={() => setApiError(null)}
                  className="bg-white/10 hover:bg-white/20 text-white font-semibold px-2.5 py-1 rounded"
                >
                  Edit Manually
                </button>
              </div>
            )}

            {/* IMAGE REPRESENTATIVE VIEWPORTS */}
            <div className="relative max-w-full max-h-full flex items-center justify-center shadow-2xl rounded-lg border border-white/5 bg-[#030612]/30 p-2">
              {/* Tight wrapper that takes on the exact final dimension of the rendered photo */}
              <div className="relative inline-block max-w-full max-h-[760px]">
                {/* Main base preview image */}
                <img 
                  src={isResultPreviewActive && finalComposedUrl ? finalComposedUrl : activeImage} 
                  alt="Source Studio Sandbox"
                  className="max-h-[760px] max-w-full h-auto w-auto pointer-events-none transition-all duration-300 select-none block rounded mx-auto"
                />

                {/* INTERACTIVE COMPONENT INDICATOR (ACTIVE IN INTERACTION / DRAFT MODE) */}
                {!isResultPreviewActive && detectedElements.map((el) => {
                  const isSelected = selectedElementId === el.id;
                  const isHovered = hoveredElementId === el.id;
                  const edit = edits[el.id];
                  const isEdited = !!(edit?.replacedImage || edit?.replacedText);
                  
                  // Color mapping rules based on type
                  let neonBorder = "border-amber-500 shadow-amber-500/10";
                  let neonBg = "bg-amber-500/5";
                  let neonBadge = "bg-amber-500 text-black";
                  
                  if (el.type === "text") {
                    neonBorder = isSelected 
                      ? "border-emerald-400 ring-2 ring-emerald-500/50 shadow-emerald-500/30" 
                      : isHovered 
                        ? "border-emerald-500 shadow-emerald-500/20" 
                        : isEdited 
                          ? "border-transparent" 
                          : "border-emerald-500/40";
                    neonBg = isSelected ? "bg-emerald-500/15" : isHovered ? "bg-emerald-500/5" : "bg-transparent";
                    neonBadge = (isEdited && !isSelected && !isHovered) ? "hidden" : "bg-emerald-500 text-slate-950";
                  } else if (el.type === "person") {
                    neonBorder = isSelected 
                      ? "border-indigo-400 ring-2 ring-indigo-500/50 shadow-indigo-500/30" 
                      : isHovered 
                        ? "border-indigo-400 shadow-indigo-500/20" 
                        : isEdited 
                          ? "border-transparent" 
                          : "border-indigo-500/40";
                    neonBg = isSelected ? "bg-indigo-500/15" : isHovered ? "bg-indigo-500/5" : "bg-transparent";
                    neonBadge = (isEdited && !isSelected && !isHovered) ? "hidden" : "bg-indigo-500 text-slate-950";
                  } else if (el.type === "graphic") {
                    neonBorder = isSelected 
                      ? "border-purple-400 ring-2 ring-purple-500/50 shadow-purple-500/30" 
                      : isHovered 
                        ? "border-purple-400 shadow-purple-500/20" 
                        : isEdited 
                          ? "border-transparent" 
                          : "border-purple-500/40";
                    neonBg = isSelected ? "bg-purple-500/15" : isHovered ? "bg-purple-500/5" : "bg-transparent";
                    neonBadge = (isEdited && !isSelected && !isHovered) ? "hidden" : "bg-purple-500 text-slate-950";
                  }

                  // Decide if we should render duplicate floating HTML sticker preview
                  const shouldShowHTMLPreview = true;

                  return (
                    <div
                      key={el.id}
                      id={`bounding-box-${el.id}`}
                      onClick={() => {
                        setSelectedElementId(el.id);
                        setIsResultPreviewActive(false);
                      }}
                      onMouseEnter={() => setHoveredElementId(el.id)}
                      onMouseLeave={() => setHoveredElementId(null)}
                      style={{
                        left: `${el.box.x}%`,
                        top: `${el.box.y}%`,
                        width: `${el.box.width}%`,
                        height: `${el.box.height}%`,
                      }}
                      className={`absolute cursor-pointer border rounded transition-all duration-200 group/box flex flex-col justify-between overflow-hidden ${neonBorder} ${neonBg}`}
                      title={`Click to edit: ${el.label}`}
                    >
                      {/* 1. SOLID FILL MASK BACKGROUND WITH INSTANT CONFORMING SHAPE */}
                      {shouldShowHTMLPreview && (edit?.isMaskOn ?? true) && (edit?.replacedImage || edit?.replacedText) && (
                        <div 
                          className={`absolute inset-0 z-0 pointer-events-none transition-colors duration-200 ${
                            edit.frameShape === "circle" 
                              ? "rounded-full" 
                              : edit.frameShape === "rounded" 
                                ? "rounded-xl" 
                                : "rounded"
                          }`} 
                          style={{ backgroundColor: edit?.maskColor || "#111827" }}
                        />
                      )}

                      {/* 2. REPLACED IMAGE PREVIEW */}
                      {shouldShowHTMLPreview && edit?.replacedImage && (el.type === "person" || el.type === "graphic") && (
                        <div 
                          className={`absolute inset-0 w-full h-full z-10 pointer-events-none select-none overflow-hidden transition-all duration-300 ${
                            edit.frameShape === "circle" 
                              ? "rounded-full" 
                              : edit.frameShape === "rounded" 
                                ? "rounded-xl" 
                                : "rounded"
                          }`}
                          style={{
                            borderColor: edit.borderWidth ? edit.borderColor || "#d4af37" : undefined,
                            borderWidth: edit.borderWidth ? `${Math.max(1, Math.min(6, edit.borderWidth / 2))}px` : undefined,
                            borderStyle: edit.borderWidth ? "solid" : undefined,
                          }}
                        >
                          <img 
                            src={edit.replacedImage} 
                            alt="swapped live" 
                            style={{
                              filter: `brightness(${edit.brightness ?? 100}%) contrast(${edit.contrast ?? 100}%) saturate(${edit.saturation ?? 100}%) ${
                                edit.featherAmount ? `blur(${Math.min(4, edit.featherAmount / 3)}px)` : ""
                              }`,
                            }}
                            className={`w-full h-full pointer-events-none transition-all duration-300 ${
                              edit.fitMode === "cover" 
                                ? "object-cover" 
                                : edit.fitMode === "stretch" 
                                  ? "object-fill" 
                                  : "object-contain"
                            }`}
                          />
                        </div>
                      )}

                      {/* 3. REPLACED TEXT PREVIEW */}
                      {shouldShowHTMLPreview && edit?.replacedText && el.type === "text" && (
                        <div 
                          className="absolute inset-0 w-full h-full flex items-center justify-center p-1 z-10 pointer-events-none rounded select-none overflow-hidden"
                          style={{
                            color: edit.textStyle?.color || "#ffffff",
                            fontFamily: edit.textStyle?.fontFamily || "Inter, sans-serif",
                            fontSize: edit.textStyle?.fontSize ? `${edit.textStyle.fontSize * 0.4}px` : "12px",
                            fontWeight: edit.textStyle?.bold ? "bold" : "normal",
                            fontStyle: edit.textStyle?.italic ? "italic" : "normal",
                            textAlign: (edit.textStyle?.uppercase ? "uppercase" : "none") as any,
                            textTransform: edit.textStyle?.uppercase ? "uppercase" : "none",
                          }}
                        >
                          <span className="w-full text-center block break-words leading-tight">
                            {edit.replacedText}
                          </span>
                        </div>
                      )}

                      {/* Element badge label (hidden completely if edited and not active, to simulate seamless original in-place replace) */}
                      {(!isEdited || isSelected || isHovered) && (
                        <div className="flex gap-1 items-center z-20 relative select-none pointer-events-none">
                          <span className={`text-[8px] uppercase font-mono px-1 py-0.5 rounded-br font-extrabold ${neonBadge} opacity-95 pointer-events-none tracking-tight`}>
                            {el.type === "text" ? "TXT" : el.type === "person" ? "FACE" : el.type === "graphic" ? "ASSET" : "BG"}
                          </span>
                          {edit?.replacedText && (
                            <span className="text-[8px] bg-slate-900 border border-emerald-500/30 px-1 py-0.2 rounded-b text-slate-300 truncate max-w-[65px]">
                              Edited
                            </span>
                          )}
                          {edit?.replacedImage && (
                            <span className="text-[8px] bg-indigo-950 border border-indigo-500/35 px-1 py-0.2 rounded-b text-slate-200">
                              Swapped
                            </span>
                          )}
                        </div>
                      )}

                      {/* Show label descriptive badge on hover */}
                      <div className="opacity-0 group-hover/box:opacity-100 transition-opacity bg-black/95 text-white text-[8px] px-1.5 py-0.5 rounded shadow-xl border border-white/10 m-0.5 truncate pointer-events-none select-none max-w-full z-20 relative">
                        {el.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ACTIVE REPLACEMENT STAT BAR */}
          <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#090d19] border border-[#14192b] rounded-xl p-4">
            <div>
              <span className="text-xs text-slate-400 block font-mono">Current Export Assembly:</span>
              <p className="text-xs text-slate-200 mt-1">
                {Object.keys(edits).length > 0 ? (
                  <span className="text-emerald-400 font-medium">✓ {Object.keys(edits).length} modifications prepared</span>
                ) : (
                  <span>0 variables changed in template</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto self-end">
              <button
                onClick={async () => {
                  try {
                    setIsComposing(true);
                    const url = await composeFinalImage(activeImage, detectedElements, edits);
                    if (url) {
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `imagraph-${activePresetId}-${Date.now()}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  } catch (e) {
                    alert("Export composition trigger failed: " + e);
                  } finally {
                    setIsComposing(false);
                  }
                }}
                disabled={isComposing || !finalComposedUrl}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-semibold cursor-pointer text-slate-950 px-4 py-2.5 rounded-lg text-xs transition-all shadow-md disabled:bg-slate-800 disabled:opacity-40"
              >
                {isComposing ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                ) : (
                  <Download className="h-4 w-4 text-slate-950" />
                )}
                Compile & Export High-Res Image
              </button>
            </div>
          </div>

          {/* ADD CUSTOM REGION MANUALLY FOR RESILIENCY */}
          <div className="mt-4 flex flex-col items-center justify-center border-t border-dashed border-[#16203a] pt-4 gap-2 w-full">
            <span className="text-xs text-slate-400 font-mono text-center">
              Missing a bounding box? Click to draw custom element on canvas below:
            </span>
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <button 
                onClick={() => addNewCustomBoundingBox("text")}
                className="flex items-center gap-1 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Custom Text Block
              </button>
              <button 
                onClick={() => addNewCustomBoundingBox("person")}
                className="flex items-center gap-1 text-[11px] bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 px-2.5 py-1 rounded-md transition-all cursor-pointer font-semibold shadow"
                title="Use this for Face Recognition, Portrait Crops or Passport Size Swapping"
              >
                <Plus className="w-3.5 h-3.5" />
                Custom Passport / Face Area
              </button>
              <button 
                onClick={() => addNewCustomBoundingBox("graphic")}
                className="flex items-center gap-1 text-[11px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Custom Logo & Vector Area
              </button>
            </div>
          </div>

        </section>

        {/* ── RIGHT WORKSPACE (4 COLS - REPLACEMENT & CONTROLS EDITOR) ───────── */}
        <section className="lg:col-span-12 xl:col-span-4 p-6 bg-[#090b16] flex flex-col justify-between overflow-y-auto border-[#14192b]">
          
          <div className="space-y-6">
            
            {/* INSTRUCTOR / STATUS TITLE */}
            <div className="border-b border-[#14192b] pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  Regional Inspector
                </h3>
                <p className="text-xs text-slate-400 mt-1">Select any highlighted component inline to configure edits.</p>
              </div>

              {selectedElementId && (
                <button
                  onClick={() => setSelectedElementId(null)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 transition"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* IF NO COMPONENT SELECTED -> SHOW ALL DETECTED COMPONENTS LIST */}
            {!selectedElementId ? (
              <div className="space-y-3">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-mono mb-2">
                  Hierarchy of elements:
                </div>

                {detectedElements.length === 0 ? (
                  <div className="bg-[#0b0e1a] border border-dashed border-[#182343] p-8 text-center rounded-xl">
                    <Crop className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No components detected yet on this layout.</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Upload your layout to run intelligent vision scanner, or use buttons below the canvas to manually define target regions.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {detectedElements.map((elem) => {
                      const isHovered = hoveredElementId === elem.id;
                      const badge = getBadgeStyles(elem.type);
                      const isCurrentEdit = edits[elem.id];

                      return (
                        <div
                          key={elem.id}
                          onMouseEnter={() => setHoveredElementId(elem.id)}
                          onMouseLeave={() => setHoveredElementId(null)}
                          onClick={() => setSelectedElementId(elem.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-left flex items-center justify-between ${
                            isHovered 
                              ? "bg-[#0f142b] border-indigo-500/50 shadow" 
                              : "bg-[#0b0e1b] border-[#141a31] hover:border-[#222c4d]"
                          }`}
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="flex-shrink-0">
                              {elem.type === "text" ? (
                                <FontIcon className="w-4 h-4 text-emerald-400" />
                              ) : elem.type === "person" ? (
                                <User className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-purple-400" />
                              )}
                            </div>
                            
                            <div className="truncate">
                              <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-white">
                                {elem.label}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] uppercase font-semibold font-mono px-1.5 py-0.2 rounded border ${badge.bg}`}>
                                  {badge.label}
                                </span>
                                {isCurrentEdit && (
                                  <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Modified
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Original cropped thumbnail indicator */}
                            {crops[elem.id] && (
                              <img 
                                src={crops[elem.id]} 
                                alt="crop" 
                                className="w-8 h-8 rounded object-cover border border-slate-700 bg-[#070914]" 
                              />
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              
              /* ── DETAILED CONTROL CARD FOR SELECTED ELEMENT ── */
              <div className="space-y-5 animate-in fade-in duration-300">
                
                {/* Visual item title bar */}
                <div className="bg-[#0b0e1d] border border-[#17213b] p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10">
                      {selectedElement?.type === "text" ? (
                        <FontIcon className="w-4 h-4 text-emerald-400" />
                      ) : selectedElement?.type === "person" ? (
                        <User className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-purple-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        {selectedElement?.label}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        Coordinates: X: {selectedElement?.box.x}%, Y: {selectedElement?.box.y}% • Dim: {selectedElement?.box.width}%x{selectedElement?.box.height}%
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (selectedElementId) {
                        deleteElement(selectedElementId);
                      }
                    }}
                    title="Remove item"
                    className="p-1 px-2 rounded bg-rose-950/20 hover:bg-rose-900/40 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* COORDINATES ADJUSTERS (Nudge Area) */}
                <div className="bg-[#070a16] border border-[#10172d] p-3 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 font-mono uppercase">Fine-Tune Bounding Box Area</span>
                    <button 
                      onClick={() => setIsNudging(!isNudging)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      {isNudging ? "Hide Controls" : "Adjust Positions"}
                    </button>
                  </div>

                  {isNudging && selectedElement && (
                    <div className="space-y-2 mt-2 pt-2 border-t border-[#121932]">
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>Left Offset (X): {selectedElement.box.x}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={selectedElement.box.x} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setDetectedElements(prev => prev.map(item => 
                              item.id === selectedElement.id ? { ...item, box: { ...item.box, x: val } } : item
                            ));
                          }}
                          className="w-full accent-indigo-500 h-1 bg-[#10162a]" 
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>Top Offset (Y): {selectedElement.box.y}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={selectedElement.box.y} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setDetectedElements(prev => prev.map(item => 
                              item.id === selectedElement.id ? { ...item, box: { ...item.box, y: val } } : item
                            ));
                          }}
                          className="w-full accent-indigo-500 h-1 bg-[#10162a]" 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>Width: {selectedElement.box.width}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="1" 
                            max="100" 
                            value={selectedElement.box.width} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setDetectedElements(prev => prev.map(item => 
                                item.id === selectedElement.id ? { ...item, box: { ...item.box, width: val } } : item
                              ));
                            }}
                            className="w-full accent-indigo-500 h-1 bg-[#10162a]" 
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>Height: {selectedElement.box.height}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="1" 
                            max="100" 
                            value={selectedElement.box.height} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setDetectedElements(prev => prev.map(item => 
                                item.id === selectedElement.id ? { ...item, box: { ...item.box, height: val } } : item
                              ));
                            }}
                            className="w-full accent-indigo-500 h-1 bg-[#10162a]" 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SOLID MASK REPLACEMENT BEHAVIOR (BACKGROUND ERASER) */}
                <div className="bg-[#0a0d1d] border border-[#141d3d] p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                        Regional Background Eraser
                      </h5>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Fill the target bounding box with solid color before overlaying the edits.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedEdit?.isMaskOn ?? true}
                        onChange={(e) => {
                          if (selectedElementId) {
                            handleToggleMask(selectedElementId, e.target.checked);
                          }
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {(selectedEdit?.isMaskOn ?? true) && (
                    <div className="bg-[#060814] p-2.5 rounded-lg border border-[#121932] space-y-2">
                      <span className="text-[10px] text-slate-400 block font-mono">Fill Mask Preset Color:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { color: "#000000", name: "Solid Dark" },
                          { color: "#ffffff", name: "White Studio" },
                          { color: "#1c243a", name: "Slate Teal" },
                          { color: "#0c0f1d", name: "Cosmic Charcoal" },
                          { color: "#312e81", name: "Dark Indigo" },
                          { color: "#065f46", name: "Deep Emerald" }
                        ].map((item) => (
                          <button
                            key={item.color}
                            onClick={() => {
                              if (selectedElementId) {
                                handleMaskColorUpdate(selectedElementId, item.color);
                              }
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-mono border flex items-center gap-1.5 transition-all ${
                              (selectedEdit?.maskColor || "#111827") === item.color
                                ? "border-indigo-400 text-white bg-indigo-500/10 shadow"
                                : "border-slate-800 text-slate-400 bg-[#0e1224] hover:text-white"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full border border-white/15" style={{ backgroundColor: item.color }}></span>
                            {item.name}
                          </button>
                        ))}
                      </div>

                      {/* Explicit color input */}
                      <div className="flex items-center gap-2 pt-1 border-t border-[#12182d] mt-2">
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">Custom Hex:</span>
                        <input 
                          type="color" 
                          value={selectedEdit?.maskColor || "#111827"}
                          onChange={(e) => {
                            if (selectedElementId) {
                              handleMaskColorUpdate(selectedElementId, e.target.value);
                            }
                          }}
                          className="w-6 h-6 rounded border border-white/10 bg-transparent cursor-pointer" 
                        />
                        <input 
                          type="text" 
                          value={selectedEdit?.maskColor || "#111827"}
                          onChange={(e) => {
                            if (selectedElementId) {
                              handleMaskColorUpdate(selectedElementId, e.target.value);
                            }
                          }}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-300" 
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SPECIFIC TREATMENT FOR PERSON OR GRAPHIC ELEMENT */}
                {(selectedElement?.type === "person" || selectedElement?.type === "graphic") && (
                  <div className="bg-[#0b0e1d] border border-[#17213d] p-4 rounded-xl space-y-4">
                    
                    <div>
                      <h5 className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                        Image Replacement Pipeline
                      </h5>
                      <span className="text-[10px] text-slate-400 block leading-normal mt-0.5">
                        Replace this original face layout segment with your custom uploaded imagery.
                      </span>
                    </div>

                    {/* ──── THE PIPELINE ROW (CROPPED THUMBNAIL -> ARROW -> NEW UPLOAD ZONE) ──── */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#050710] p-4 rounded-xl border border-[#11192e]">
                      
                      {/* Left Block: Original cropped image */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold font-mono">Original Crop</div>
                        <div className="w-18 h-18 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center relative group/crop shadow-lg">
                          {crops[selectedElementId] ? (
                            <img 
                              src={crops[selectedElementId]} 
                              alt="Crop origin" 
                              className="w-full h-full object-cover select-none"
                            />
                          ) : (
                            <Crop className="w-5 h-5 text-indigo-400/50" />
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/crop:opacity-100 flex items-center justify-center transition-all">
                            <span className="text-[8px] text-indigo-300 font-medium">Original Face</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle Block: GLOWING STYLISH ARROW */}
                      <div className="flex flex-col items-center justify-center text-indigo-400">
                        <div className="text-[8px] text-indigo-500 font-mono font-semibold uppercase animate-pulse">REPLACE</div>
                        <div className="font-bold flex items-center gap-0.5 px-3 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/30 text-indigo-300 mt-1 shadow-inner group/arrow">
                          <ArrowRight className="w-4 h-4 animate-bounce shrink-0" style={{ animationDuration: "2s" }} />
                        </div>
                      </div>

                      {/* Right Block: Replacement zone or interactive Uploader */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 w-full sm:w-auto">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold font-mono">Replacement Image</div>
                        
                        {selectedEdit?.replacedImage ? (
                          <div className="relative w-18 h-18 rounded-lg overflow-hidden border-2 border-emerald-500 bg-slate-950 flex items-center justify-center group/replacement shadow-lg">
                            <img 
                              src={selectedEdit.replacedImage} 
                              alt="Replacement" 
                              className={`w-full h-full ${
                                selectedEdit.fitMode === "cover" 
                                  ? "object-cover" 
                                  : selectedEdit.fitMode === "stretch" 
                                    ? "object-fill" 
                                    : "object-contain"
                              }`}
                            />
                            
                            {/* Standard disconnect wrapper */}
                            <button
                              onClick={() => handleRemoveReplacement(selectedElementId)}
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition shadow opacity-0 group-hover/replacement:opacity-100 cursor-pointer"
                              title="Discard integration replacement"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          // Drop file uploader zone
                          <label className="w-18 h-18 rounded-lg border border-dashed border-indigo-400/50 bg-[#0c1224] hover:bg-indigo-500/10 hover:border-indigo-400 cursor-pointer flex flex-col items-center justify-center transition-all p-1 relative shadow">
                            <Upload className="w-4 h-4 text-indigo-400/60 group-hover:scale-110 transition" />
                            <span className="text-[8px] text-center text-slate-400 mt-1 leading-snug font-mono">Upload File</span>
                            <input 
                              type="file" 
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleReplacementUpload(selectedElementId, file);
                                }
                              }}
                              className="hidden" 
                            />
                          </label>
                        )}
                      </div>

                    </div>

                    {/* FITTING CONTROL SELECTOR */}
                    {selectedEdit?.replacedImage && (
                      <div className="space-y-3">
                        <div className="bg-[#060815] p-3 rounded-lg border border-[#121932] space-y-2">
                          <span className="text-[10px] text-slate-400 block font-mono">Image Fitting Mode:</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { mode: "contain", label: "As Is (Contain)", desc: "Maintain natural aspect ratio without cropping" },
                              { mode: "cover", label: "Crop & Fill", desc: "Zoom to fill bounding box completely" },
                              { mode: "stretch", label: "Stretch to Fit", desc: "Stretch image to match dimensions exactly" }
                            ].map((cfg) => {
                              const active = (selectedEdit.fitMode || "contain") === cfg.mode;
                              return (
                                <button
                                  key={cfg.mode}
                                  onClick={() => handleReplacementFitModeUpdate(selectedElementId, cfg.mode as any)}
                                  className={`px-2 py-1.5 rounded text-[10px] font-mono border flex flex-col items-center justify-center transition-all cursor-pointer text-center ${
                                    active
                                      ? "border-indigo-400 text-white bg-indigo-500/15 shadow-md font-bold"
                                      : "border-slate-800 text-slate-400 bg-[#0e1224] hover:text-white"
                                  }`}
                                  title={cfg.desc}
                                >
                                  <span className="block font-semibold">{cfg.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* SIZE-FIX NAKO SOLUTIONS (DIMENSION DETECTOR & AUTO SHAPE MATCH) */}
                        <div className="bg-[#050711] p-3 rounded-lg border border-[#141c3a] space-y-2.5 text-left">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-400">Photo Orientation:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              selectedEdit.replacedImageRatio && selectedEdit.replacedImageRatio > 1.1 
                                ? "text-amber-300 bg-amber-500/10" 
                                : selectedEdit.replacedImageRatio && selectedEdit.replacedImageRatio < 0.9 
                                  ? "text-teal-300 bg-teal-500/10" 
                                  : "text-indigo-300 bg-indigo-500/10"
                            }`}>
                              {selectedEdit.replacedImageRatio && selectedEdit.replacedImageRatio > 1.1 
                                ? "Horizontal (आडवा)" 
                                : selectedEdit.replacedImageRatio && selectedEdit.replacedImageRatio < 0.9 
                                  ? "Vertical (उभा)" 
                                  : "Square (चौकोनी)"}
                            </span>
                          </div>

                          {/* TOGGLE TO KEEP ORIGINAL SIZE */}
                          <div className="flex items-center justify-between border-t border-[#0f152d]/60 pt-2 pb-1">
                            <label className="text-[11px] font-mono text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox" 
                                checked={keepOriginalSizeOnUpload}
                                onChange={(e) => setKeepOriginalSizeOnUpload(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-[#04060c] border border-slate-800 text-emerald-400 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
                              />
                              <span className="leading-tight">Keep Original Frame Size (मूळ आकार जतन ठेवा)</span>
                            </label>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                              keepOriginalSizeOnUpload 
                                ? "bg-emerald-500/15 text-emerald-300" 
                                : "bg-slate-500/10 text-slate-400"
                            }`}>
                              {keepOriginalSizeOnUpload ? "Enabled" : "Disabled"}
                            </span>
                          </div>

                          {selectedEdit.replacedImageWidth && selectedEdit.replacedImageHeight && (
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-[#0f152d] pb-1.5">
                              <span>Natural Resolution:</span>
                              <span className="text-slate-200">{selectedEdit.replacedImageWidth} × {selectedEdit.replacedImageHeight} px</span>
                            </div>
                          )}

                          <button
                            onClick={() => handleAutoAdjustAspect(selectedElementId)}
                            className="w-full py-2 px-3 bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-indigo-200 border border-indigo-400/40 hover:border-indigo-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:text-white hover:scale-[1.01]"
                            title="Auto-adjust selection coordinates to perfectly match your uploaded photo's orientation and aspect ratio."
                          >
                            <Maximize className="w-3.5 h-3.5 text-teal-400" />
                            <span>Match Photo Aspect (आपोआप आकार जुळवा)</span>
                          </button>

                          {/* MANUAL PHOTO RESIZING SLIDERS */}
                          <div className="pt-2 border-t border-[#121932] space-y-2.5">
                            <div>
                              <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-slate-300">Photo Width (रुंदी):</span>
                                <span className="text-teal-300 font-bold">{selectedElement.box.width}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="2" 
                                max="100" 
                                value={selectedElement.box.width} 
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setDetectedElements(prev => prev.map(item => 
                                    item.id === selectedElement.id ? { ...item, box: { ...item.box, width: val } } : item
                                  ));
                                }}
                                className="w-full accent-teal-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-slate-300">Photo Height (उंची):</span>
                                <span className="text-teal-300 font-bold">{selectedElement.box.height}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="2" 
                                max="100" 
                                value={selectedElement.box.height} 
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setDetectedElements(prev => prev.map(item => 
                                    item.id === selectedElement.id ? { ...item, box: { ...item.box, height: val } } : item
                                  ));
                                }}
                                className="w-full accent-teal-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                              />
                            </div>
                          </div>

                          {/* PRECISION BLENDING SECTION (फ्रेम आकार, कडा मऊ करणे आणि कलर मॅचिंग) */}
                          <div className="pt-3 border-t border-[#121932] space-y-4">
                            <span className="text-[10px] text-slate-400 block font-mono uppercase tracking-wider text-left font-bold text-indigo-300">
                              ✨ Seamless Photo Blending & Passport Cutlines:
                            </span>

                            {/* INSTANT LOOK PRESETS */}
                            <div className="space-y-1.5 text-left bg-indigo-950/25 p-2.5 rounded-lg border border-indigo-500/10">
                              <label className="text-[10px] font-bold text-slate-300 font-mono block">
                                🎨 INSTANT PORTRAIT STYLE PRESETS (त्वरित स्टाईल):
                              </label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { 
                                    name: "Classic Passport", 
                                    desc: "पासपोर्ट फोटो",
                                    values: { frameShape: "circle" as any, featherAmount: 0, borderColor: "#ffffff", borderWidth: 4 } 
                                  },
                                  { 
                                    name: "Gold Foil Frame", 
                                    desc: "सोनेरी कोंदण",
                                    values: { frameShape: "circle" as any, featherAmount: 2, borderColor: "#d4af37", borderWidth: 6 } 
                                  },
                                  { 
                                    name: "Sticker Cutout", 
                                    desc: "स्टिकर कटआउट",
                                    values: { frameShape: "rounded" as any, featherAmount: 0, borderColor: "#ffffff", borderWidth: 8 } 
                                  },
                                  { 
                                    name: "Soft Ambient Blend", 
                                    desc: "कडांना विरघळणारा",
                                    values: { frameShape: "rectangle" as any, featherAmount: 18, borderColor: undefined, borderWidth: 0 } 
                                  },
                                  { 
                                    name: "Reset to Rectangle", 
                                    desc: "काढून टाका",
                                    values: { frameShape: "rectangle" as any, featherAmount: 0, borderColor: undefined, borderWidth: 0 } 
                                  }
                                ].map((preset) => {
                                  // Determine if this preset represents the current style attributes roughly
                                  const matchesShape = (selectedEdit.frameShape || "rectangle") === preset.values.frameShape;
                                  const matchesFeather = (selectedEdit.featherAmount || 0) === preset.values.featherAmount;
                                  const isActive = matchesShape && matchesFeather;
                                  
                                  return (
                                    <button
                                      key={preset.name}
                                      onClick={() => applyBlendingPreset(selectedElementId, preset.values)}
                                      className={`py-1.5 px-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                        isActive
                                          ? "border-indigo-400 bg-indigo-500/20 text-white font-bold"
                                          : "border-[#141b34] bg-[#050711] text-slate-400 hover:text-white"
                                      }`}
                                    >
                                      <span className="text-[10px] font-bold tracking-tight inline-block text-indigo-300">{preset.name}</span>
                                      <span className="text-[9px] text-slate-300 opacity-90 block">{preset.desc}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 1. FRAME SHAPE CHIP SELECTOR */}
                            <div className="space-y-1.5 text-left">
                              <label className="text-[10px] text-slate-300 font-mono block">
                                Frame Shape (फोटोचा आकार निवडा):
                              </label>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { shape: "rectangle", label: "Rectangle", mr: "चौकोन" },
                                  { shape: "circle", label: "Circle/Oval", mr: "वर्तुळ / लंबवर्तुळ" },
                                  { shape: "rounded", label: "Rounded Card", mr: "गोलाकार कोपरे" }
                                ].map((item) => {
                                  const active = (selectedEdit.frameShape || "rectangle") === item.shape;
                                  return (
                                    <button
                                      key={item.shape}
                                      onClick={() => handleBlendingUpdate(selectedElementId, "frameShape", item.shape)}
                                      className={`py-1.5 px-1 rounded text-[10px] border flex flex-col items-center justify-center transition-all cursor-pointer ${
                                        active
                                          ? "border-indigo-400 text-white bg-indigo-500/15 shadow font-bold"
                                          : "border-[#1c243c] text-slate-400 bg-[#070914] hover:text-white"
                                      }`}
                                    >
                                      <span className="font-semibold text-[10px]">{item.label}</span>
                                      <span className="text-[8.5px] opacity-90 text-[10px] font-medium text-slate-300">{item.mr}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 2. FEATHER SLIDER */}
                            <div className="text-left">
                              <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-slate-300">Edge Feather/Softness (कडा मऊ करा):</span>
                                <span className="text-teal-300 font-bold">{selectedEdit.featherAmount || 0} px</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="40" 
                                value={selectedEdit.featherAmount || 0} 
                                onChange={(e) => handleBlendingUpdate(selectedElementId, "featherAmount", parseInt(e.target.value))}
                                className="w-full accent-teal-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                              />
                              <p className="text-[9px] text-slate-400/80 leading-normal mt-1">
                                High values fade the edges of the photo so it matches the background perfectly without harsh block overlaps!
                              </p>
                            </div>

                            {/* 3. DECORATIVE FRAME BORDERS */}
                            <div className="space-y-2 border-t border-[#121932] pt-2 text-left">
                              <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-slate-300">Decorative Frame Outline (सुशोभित कडा/चौकट):</span>
                                <span className="text-indigo-300 font-bold">{selectedEdit.borderWidth || 0} px</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="15" 
                                value={selectedEdit.borderWidth || 0} 
                                onChange={(e) => handleBlendingUpdate(selectedElementId, "borderWidth", parseInt(e.target.value))}
                                className="w-full accent-indigo-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                              />

                              {/* Border Color Pickers if border is active */}
                              {(selectedEdit.borderWidth || 0) > 0 && (
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400 font-mono block">Border Frame Color (फ्रेम रंग):</label>
                                  <div className="flex flex-wrap gap-1">
                                    {[
                                      { name: "Gold (सोनेरी)", val: "#d4af37" },
                                      { name: "Silver (चांदी)", val: "#c0c0c0" },
                                      { name: "White (पांढरा)", val: "#ffffff" },
                                      { name: "Black (काळा)", val: "#000000" }
                                    ].map((col) => {
                                      const active = (selectedEdit.borderColor || "#d4af37").toLowerCase() === col.val.toLowerCase();
                                      return (
                                        <button
                                          key={col.val}
                                          onClick={() => handleBlendingUpdate(selectedElementId, "borderColor", col.val)}
                                          className={`px-2 py-1 rounded text-[9px] border flex items-center gap-1 transition-all cursor-pointer ${
                                            active
                                              ? "border-amber-400 text-white bg-amber-500/10 shadow"
                                              : "border-[#1c243c] text-slate-400 bg-[#070914] hover:text-white"
                                          }`}
                                        >
                                          <span className="w-2 h-2 rounded-full border border-white/10" style={{ backgroundColor: col.val }}></span>
                                          {col.name}
                                        </button>
                                      );
                                    })}
                                    {/* Custom border color */}
                                    <div className="flex items-center gap-1.5 ml-1">
                                      <input 
                                        type="color" 
                                        value={selectedEdit.borderColor || "#d4af37"}
                                        onChange={(e) => handleBlendingUpdate(selectedElementId, "borderColor", e.target.value)}
                                        className="w-5 h-5 rounded border border-white/10 bg-transparent cursor-pointer" 
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 4. LIGHTING MATCHERS */}
                            <div className="space-y-2.5 border-t border-[#121932] pt-3 text-left">
                              <span className="text-[10px] text-slate-300 font-mono block font-bold text-indigo-300">
                                🎨 Lighting & Color Match (फोटो उजेड आणि रंग जुळवा):
                              </span>

                              {/* Brightness slider */}
                              <div>
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="text-slate-400">Brightness (तेजस्वीपणा / उजेड):</span>
                                  <span className="text-slate-200 font-bold">{selectedEdit.brightness ?? 100}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="50" 
                                  max="150" 
                                  value={selectedEdit.brightness ?? 100} 
                                  onChange={(e) => handleBlendingUpdate(selectedElementId, "brightness", parseInt(e.target.value))}
                                  className="w-full accent-indigo-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                                />
                              </div>

                              {/* Contrast slider */}
                              <div>
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="text-slate-400">Contrast (विरोधाभास / स्पष्टता):</span>
                                  <span className="text-slate-200 font-bold">{selectedEdit.contrast ?? 100}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="50" 
                                  max="150" 
                                  value={selectedEdit.contrast ?? 100} 
                                  onChange={(e) => handleBlendingUpdate(selectedElementId, "contrast", parseInt(e.target.value))}
                                  className="w-full accent-indigo-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                                />
                              </div>

                              {/* Saturation slider */}
                              <div>
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="text-slate-400">Saturation (रंगीतपणा / मुख्य रंग):</span>
                                  <span className="text-slate-200 font-bold">{selectedEdit.saturation ?? 100}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="50" 
                                  max="150" 
                                  value={selectedEdit.saturation ?? 100} 
                                  onChange={(e) => handleBlendingUpdate(selectedElementId, "saturation", parseInt(e.target.value))}
                                  className="w-full accent-indigo-400 h-1 bg-[#090d21] rounded cursor-pointer" 
                                />
                              </div>
                            </div>
                          </div>
                          
                          <p className="text-[9px] text-slate-400/80 leading-normal text-center bg-[#090e21] p-1.5 rounded border border-[#111933]">
                            💡 <span className="text-indigo-300 font-medium">Size is NOT fixed!</span> Use the sliders above to increase or decrease the final photo size on the banner instantly.
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-indigo-300/80 italic text-center block">
                      ✓ Drag-and-drop or select file to overlay replacement instantly.
                    </p>

                  </div>
                )}

                {/* SPECIFIC TREATMENT FOR TEXT ELEMENT */}
                {selectedElement?.type === "text" && (
                  <div className="bg-[#0b0e1d] border border-[#17213d] p-4 rounded-xl space-y-4">
                    <div>
                      <h5 className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                        Typography Replacement Settings
                      </h5>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                        Redraw text using dynamic canvas rendering over erasure mask with beautiful premium fonts and colors.
                      </p>
                    </div>

                    {/* Wordings TextArea input */}
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">REPLACEMENT TEXT</label>
                      <textarea
                        value={selectedEdit?.replacedText ?? selectedElement?.originalText ?? ""}
                        onChange={(e) => handleTextEditChange(selectedElementId, e.target.value)}
                        className="w-full bg-[#05060d] border border-slate-800 rounded-lg p-3 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 leading-relaxed"
                        placeholder="Type new typography message..."
                        rows={2}
                      />
                    </div>

                    {/* FONT FAMILY */}
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">FONT FACES PAIRINGS (फॉन्ट निवडा)</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          "Plus Jakarta Sans",
                          "Inter",
                          "Space Grotesk",
                          "Playfair Display",
                          "Montserrat",
                          "Oswald",
                          "Pacifico",
                          "Caveat",
                          "Cinzel",
                          "JetBrains Mono",
                          "Impact",
                          "Georgia"
                        ].map((font) => (
                          <button
                            key={font}
                            onClick={() => handleTextStyleUpdate(selectedElementId, "fontFamily", font)}
                            style={{ fontFamily: font }}
                            className={`p-2 rounded text-xs text-left border overflow-hidden truncate transition-all cursor-pointer ${
                              (selectedEdit?.textStyle?.fontFamily || "Plus Jakarta Sans") === font
                                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 font-bold"
                                : "border-slate-800 text-slate-400 bg-[#060812] hover:text-white"
                            }`}
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* TEXT COLOR PRESETS */}
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">TYPOGRAPHY TEXT COLOR</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: "Polaris White", val: "#ffffff" },
                          { name: "Sunset Gold", val: "#f59e0b" },
                          { name: "Cyber Radiant", val: "#10b981" },
                          { name: "Synth Wave", val: "#ec4899" },
                          { name: "Aeon Cyan", val: "#06b6d4" },
                          { name: "Slate Steel", val: "#000000" }
                        ].map((col) => (
                          <button
                            key={col.val}
                            onClick={() => handleTextStyleUpdate(selectedElementId, "color", col.val)}
                            className={`px-2 py-1 rounded text-[10px] font-mono border flex items-center gap-1.5 transition-all ${
                              (selectedEdit?.textStyle?.color || "#ffffff").toLowerCase() === col.val.toLowerCase()
                                ? "border-emerald-400 text-white bg-emerald-500/10 shadow"
                                : "border-slate-800 text-slate-400 bg-[#060812] hover:text-white"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: col.val }}></span>
                            {col.name}
                          </button>
                        ))}
                      </div>

                      {/* Custom input color picker for Text */}
                      <div className="flex items-center gap-2 pt-2 border-t border-[#12182d] mt-2.5">
                        <span className="text-[10px] text-slate-400 font-mono">Custom color:</span>
                        <input 
                          type="color" 
                          value={selectedEdit?.textStyle?.color || "#ffffff"}
                          onChange={(e) => handleTextStyleUpdate(selectedElementId, "color", e.target.value)}
                          className="w-6 h-6 rounded border border-white/10 bg-transparent cursor-pointer" 
                        />
                        <input 
                          type="text" 
                          value={selectedEdit?.textStyle?.color || "#ffffff"}
                          onChange={(e) => handleTextStyleUpdate(selectedElementId, "color", e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-300 w-24" 
                        />
                      </div>
                    </div>

                    {/* SIZE SLIDER */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-[10px] font-mono text-slate-400">
                        <span>FONT SCALE MULTIPLIER:</span>
                        <span className="text-white font-medium">{selectedEdit?.textStyle?.fontSize || 24} px</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        value={selectedEdit?.textStyle?.fontSize || 24}
                        onChange={(e) => handleTextStyleUpdate(selectedElementId, "fontSize", parseInt(e.target.value))}
                        className="w-full accent-emerald-400 h-1 bg-[#060814]"
                      />
                    </div>

                    {/* TOGGLES ROW (BOLD, ITALIC, UPPERCASE) */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={() => handleTextStyleUpdate(selectedElementId, "bold", !(selectedEdit?.textStyle?.bold ?? true))}
                        className={`p-2 rounded text-xs font-semibold border transition ${
                          (selectedEdit?.textStyle?.bold ?? true)
                            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10 font-bold"
                            : "border-slate-800 text-slate-400 bg-[#060810] hover:text-white"
                        }`}
                      >
                        Bold
                      </button>
                      
                      <button
                        onClick={() => handleTextStyleUpdate(selectedElementId, "italic", !(selectedEdit?.textStyle?.italic ?? false))}
                        className={`p-2 rounded text-xs font-semibold border transition ${
                          (selectedEdit?.textStyle?.italic ?? false)
                            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10 italic"
                            : "border-slate-800 text-slate-400 bg-[#060810] hover:text-white"
                        }`}
                      >
                        Italic
                      </button>

                      <button
                        onClick={() => handleTextStyleUpdate(selectedElementId, "uppercase", !(selectedEdit?.textStyle?.uppercase ?? false))}
                        className={`p-2 rounded text-xs font-semibold border transition col-span-2 ${
                          (selectedEdit?.textStyle?.uppercase ?? false)
                            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10 uppercase"
                            : "border-slate-800 text-slate-400 bg-[#060810] hover:text-white"
                        }`}
                      >
                        All Uppercase Text
                      </button>
                    </div>

                    {/* ── ADVANCED ALIGNMENT & SHADOWS ── */}
                    
                    {/* TEXT ALIGNMENT */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 block">TEXT ALIGNMENT (मजकूर संरेखन)</label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: "left", label: "Left Align" },
                          { id: "center", label: "Center" },
                          { id: "right", label: "Right Align" }
                        ].map((alignOpt) => {
                          const active = (selectedEdit?.textStyle?.align || "center") === alignOpt.id;
                          return (
                            <button
                              key={alignOpt.id}
                              onClick={() => handleTextStyleUpdate(selectedElementId, "align", alignOpt.id)}
                              className={`py-1 rounded text-[10px] border font-mono transition-all text-center cursor-pointer ${
                                active
                                  ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 font-bold"
                                  : "border-slate-800 text-slate-400 bg-[#060812] hover:text-white"
                              }`}
                            >
                              {alignOpt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* TEXT DROP SHADOW */}
                    <div className="space-y-2 border-t border-[#12182d] pt-2.5">
                      <label className="text-[10px] font-mono text-slate-400 block">TEXT DROP SHADOW (मजकूराची सावली):</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { name: "No Shadow", val: { textShadowColor: undefined, textShadowBlur: 0, textShadowOffsetX: 0, textShadowOffsetY: 0 } },
                          { name: "Subtle Glow", val: { textShadowColor: "#000000", textShadowBlur: 4, textShadowOffsetX: 1, textShadowOffsetY: 1 } },
                          { name: "Heavy Shadow", val: { textShadowColor: "#000000", textShadowBlur: 8, textShadowOffsetX: 3, textShadowOffsetY: 3 } },
                          { name: "White Glow", val: { textShadowColor: "#ffffff", textShadowBlur: 6, textShadowOffsetX: 0, textShadowOffsetY: 0 } }
                        ].map((preset) => {
                          const isMatch = preset.name === "No Shadow" 
                            ? !selectedEdit?.textStyle?.textShadowColor 
                            : selectedEdit?.textStyle?.textShadowColor === preset.val.textShadowColor;
                          return (
                            <button
                              key={preset.name}
                              onClick={() => {
                                handleTextStyleUpdate(selectedElementId, "textShadowColor", preset.val.textShadowColor);
                                handleTextStyleUpdate(selectedElementId, "textShadowBlur", preset.val.textShadowBlur);
                                handleTextStyleUpdate(selectedElementId, "textShadowOffsetX", preset.val.textShadowOffsetX);
                                handleTextStyleUpdate(selectedElementId, "textShadowOffsetY", preset.val.textShadowOffsetY);
                              }}
                              className={`py-1 px-1.5 rounded text-[10px] border transition-all truncate cursor-pointer ${
                                isMatch
                                  ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 font-bold"
                                  : "border-slate-800 text-slate-400 bg-[#060812] hover:text-white"
                              }`}
                            >
                              {preset.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Manual Shadow Color if Shadow is Enabled */}
                      {selectedEdit?.textStyle?.textShadowColor && (
                        <div className="space-y-1.5 pl-1 pt-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 font-mono">Shadow Color:</span>
                            <input 
                              type="color" 
                              value={selectedEdit?.textStyle?.textShadowColor || "#000000"}
                              onChange={(e) => handleTextStyleUpdate(selectedElementId, "textShadowColor", e.target.value)}
                              className="w-4.5 h-4.5 rounded border border-white/15 cursor-pointer bg-transparent" 
                            />
                            <span className="text-[9px] text-slate-300 font-mono">{selectedEdit?.textStyle?.textShadowColor}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="flex justify-between text-[8px] text-slate-400">
                                <span>Blur Radius:</span>
                                <span>{selectedEdit?.textStyle?.textShadowBlur || 0}px</span>
                              </div>
                              <input 
                                type="range" 
                                min="1" 
                                max="15" 
                                value={selectedEdit?.textStyle?.textShadowBlur || 4} 
                                onChange={(e) => handleTextStyleUpdate(selectedElementId, "textShadowBlur", parseInt(e.target.value))}
                                className="w-full accent-emerald-400 h-0.5 bg-[#04060c] cursor-pointer" 
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[8px] text-slate-400">
                                <span>Offset:</span>
                                <span>{selectedEdit?.textStyle?.textShadowOffsetX || 0}px</span>
                              </div>
                              <input 
                                type="range" 
                                min="-10" 
                                max="10" 
                                value={selectedEdit?.textStyle?.textShadowOffsetX || 1} 
                                onChange={(e) => {
                                  handleTextStyleUpdate(selectedElementId, "textShadowOffsetX", parseInt(e.target.value));
                                  handleTextStyleUpdate(selectedElementId, "textShadowOffsetY", parseInt(e.target.value));
                                }}
                                className="w-full accent-emerald-400 h-0.5 bg-[#04060c] cursor-pointer" 
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* OVERLAY BG OPACITY */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-[10px] font-mono text-slate-400">
                        <span>BLOCK BACKGROUND COVER OPACITY:</span>
                        <span className="text-white font-medium">{(selectedEdit?.textStyle?.backgroundOpacity || 0) * 100}%</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round((selectedEdit?.textStyle?.backgroundOpacity || 0) * 100)}
                          onChange={(e) => handleTextStyleUpdate(selectedElementId, "backgroundOpacity", parseFloat(e.target.value) / 100)}
                          className="flex-1 accent-emerald-400 h-1 bg-[#060814]"
                        />

                        <input 
                          type="color" 
                          value={selectedEdit?.textStyle?.backgroundColor || "#000000"}
                          onChange={(e) => handleTextStyleUpdate(selectedElementId, "backgroundColor", e.target.value)}
                          className="w-6 h-6 rounded border border-white/10 bg-transparent cursor-pointer" 
                          title="Text Background Color"
                        />
                      </div>
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>

          {/* ENVIRONMENT STATUS CONTROL BOARD */}
          <div className="mt-8 border-t border-[#14192b] pt-4 text-xs space-y-3">
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>Environment Deployment</span>
              <span className="text-slate-400">✓ Operational</span>
            </div>

            <div className="p-3 bg-[#0c0f1d] rounded-xl border border-indigo-500/10 flex items-start gap-3">
              <CheckCircle2 className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-indigo-300 block">Workspace Persistence</span>
                <span className="text-[10px] text-slate-400 leading-normal block mt-1">
                  Replacement image files and styled typographical variables compose as custom byte parameters locally ensuring maximum security.
                </span>
              </div>
            </div>
          </div>

        </section>

      </main>

    </div>
  );
}
