import { DetectedElement } from "./types";

export interface PresetImage {
  id: string;
  name: string;
  description: string;
  url: string;
  elements: DetectedElement[];
}

export const PRESET_IMAGES: PresetImage[] = [
  {
    id: "preset-team",
    name: "Corporate Team Studio",
    description: "A team collaboration scene with multiple people and overhead project labels.",
    url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    elements: [
      {
        id: "promo-banner-text",
        type: "text",
        label: "Primary Workspace Headline",
        originalText: "COLLABORATIVE ECOSYSTEM",
        box: { x: 22, y: 6, width: 56, height: 10 },
        defaultTextStyle: {
          fontFamily: "Montserrat",
          fontSize: 32,
          bold: true,
          uppercase: true,
          color: "#ffffff"
        }
      },
      {
        id: "creative-lead-alex",
        type: "person",
        label: "Creative Director (Left)",
        box: { x: 12, y: 32, width: 22, height: 50 }
      },
      {
        id: "lead-engineer-sarah",
        type: "person",
        label: "Lead Tech Engineer (Center)",
        box: { x: 38, y: 28, width: 24, height: 54 }
      },
      {
        id: "product-owner-marcus",
        type: "person",
        label: "Lead Designer (Right)",
        box: { x: 68, y: 30, width: 20, height: 52 }
      },
      {
        id: "agency-badge-logo",
        type: "graphic",
        label: "Glowing Cyber Badge Accent",
        box: { x: 86, y: 8, width: 8, height: 8 }
      }
    ]
  },
  {
    id: "preset-keynote",
    name: "Global Keynote Stage",
    description: "A dark futuristic podium stage with a highlighted presenter and overlay text headings.",
    url: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80",
    elements: [
      {
        id: "keynote-header-text",
        type: "text",
        label: "Main Presentation Title",
        originalText: "GLOBAL INNOVATION SUMMIT 2026",
        box: { x: 18, y: 12, width: 64, height: 10 },
        defaultTextStyle: {
          fontFamily: "Montserrat",
          fontSize: 34,
          bold: true,
          uppercase: true,
          color: "#ffffff"
        }
      },
      {
        id: "keynote-speaker-mic",
        type: "person",
        label: "Featured Visionary Speaker",
        box: { x: 38, y: 35, width: 24, height: 55 }
      },
      {
        id: "keynote-footer-date",
        type: "text",
        label: "Sub-information Venue Bar",
        originalText: "GRAND AUDITORIUM • LIVE CAPTURE",
        box: { x: 28, y: 24, width: 44, height: 6 },
        defaultTextStyle: {
          fontFamily: "JetBrains Mono",
          fontSize: 20,
          bold: true,
          uppercase: true,
          color: "#ffffff"
        }
      }
    ]
  },
  {
    id: "preset-workspace",
    name: "Creative Consultation",
    description: "A bright office desk workspace with a key visual element and strategist profile.",
    url: "https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?auto=format&fit=crop&w=1200&q=80",
    elements: [
      {
        id: "consult-header-text",
        type: "text",
        label: "Main Studio Title Wording",
        originalText: "MINIMALIST DESIGN STUDIO",
        box: { x: 25, y: 15, width: 50, height: 12 },
        defaultTextStyle: {
          fontFamily: "Plus Jakarta Sans",
          fontSize: 32,
          bold: true,
          uppercase: true,
          color: "#22c55e"
        }
      },
      {
        id: "consult-strategist",
        type: "person",
        label: "Professional Consultant Profile",
        box: { x: 48, y: 35, width: 34, height: 58 }
      },
      {
        id: "consult-badge-logo",
        type: "graphic",
        label: "Geometric Graphic Emblem",
        box: { x: 10, y: 15, width: 10, height: 11 }
      }
    ]
  }
];
