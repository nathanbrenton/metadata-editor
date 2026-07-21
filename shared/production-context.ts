export type ProductionContextGroup =
  | "Production"
  | "Recording"
  | "Editing";

export type ProductionContextField = {
  path: string;
  label: string;
  group: ProductionContextGroup;
  order: number;
  examples?: string[];
  help: string;
};

const sharedLocationHelp =
  "Use the specific facility, room, city, region, or country fields when known. Keep each stage independent because production, recording, and editing may happen in different places.";

export const productionContextFields:
  readonly ProductionContextField[] = [
    {
      path: "production.production_type",
      label: "Production Type",
      group: "Production",
      order: 10,
      examples: [
        "studio recording",
        "home recording",
        "jam session",
      ],
      help:
        "Describe the overall production or session context. This is separate from the release format and from the recording/editing stage details below.",
    },
    {
      path: "production.location",
      label: "Production Location",
      group: "Production",
      order: 20,
      examples: ["Home studio", "Rehearsal room"],
      help: sharedLocationHelp,
    },
    {
      path: "production.room",
      label: "Production Room",
      group: "Production",
      order: 30,
      examples: ["Bedroom", "Live room A"],
      help: sharedLocationHelp,
    },
    {
      path: "production.city",
      label: "Production City",
      group: "Production",
      order: 40,
      examples: ["Irvine", "Anaheim"],
      help: sharedLocationHelp,
    },
    {
      path: "production.region",
      label: "Production Region",
      group: "Production",
      order: 50,
      examples: ["California"],
      help: sharedLocationHelp,
    },
    {
      path: "production.country",
      label: "Production Country",
      group: "Production",
      order: 60,
      examples: ["United States", "USA"],
      help: sharedLocationHelp,
    },
    {
      path: "production.daw",
      label: "Production DAW / System",
      group: "Production",
      order: 70,
      examples: ["Logic Pro", "Korg D3200"],
      help:
        "Enter the principal workstation, recorder, or production system used for the overall project.",
    },
    {
      path: "production.daw_version",
      label: "Production System Version",
      group: "Production",
      order: 80,
      examples: ["9", "11.2"],
      help:
        "Record the version or revision only when it is known and useful.",
    },
    {
      path: "production.session_file",
      label: "Production Session File",
      group: "Production",
      order: 90,
      examples: ["Cleaning House.logicx"],
      help:
        "Optional session filename or project reference. Use a relative or descriptive value rather than an absolute machine path.",
    },
    {
      path: "production.production_medium",
      label: "Production Medium",
      group: "Production",
      order: 100,
      examples: ["digital", "analog", "hybrid"],
      help:
        "Describe the overall production medium with a concise, consistent value.",
    },
    {
      path: "production.notes",
      label: "Production Notes",
      group: "Production",
      order: 110,
      examples: ["Informal writing and rehearsal session."],
      help:
        "Use for overall production context that does not belong to the dedicated recording or editing stages.",
    },

    {
      path: "production.recording.production_type",
      label: "Recording Type",
      group: "Recording",
      order: 10,
      examples: ["live tracking", "overdub", "field recording"],
      help:
        "Describe the recording stage itself. Keep this separate from the overall production type and editing workflow.",
    },
    {
      path: "production.recording.location",
      label: "Recording Location",
      group: "Recording",
      order: 20,
      examples: ["Travis bedroom", "Studio A"],
      help: sharedLocationHelp,
    },
    {
      path: "production.recording.room",
      label: "Recording Room",
      group: "Recording",
      order: 30,
      examples: ["Bedroom", "Live room"],
      help: sharedLocationHelp,
    },
    {
      path: "production.recording.city",
      label: "Recording City",
      group: "Recording",
      order: 40,
      examples: ["Anaheim"],
      help: sharedLocationHelp,
    },
    {
      path: "production.recording.region",
      label: "Recording Region",
      group: "Recording",
      order: 50,
      examples: ["California"],
      help: sharedLocationHelp,
    },
    {
      path: "production.recording.country",
      label: "Recording Country",
      group: "Recording",
      order: 60,
      examples: ["United States"],
      help: sharedLocationHelp,
    },
    {
      path: "production.recording.system",
      label: "Recording DAW / System",
      group: "Recording",
      order: 70,
      examples: ["Logic 9", "Korg D3200"],
      help:
        "Enter the workstation, recorder, console, or capture system used specifically for recording.",
    },
    {
      path: "production.recording.revision",
      label: "Recording System Version / Revision",
      group: "Recording",
      order: 80,
      examples: ["9", "v2.1"],
      help:
        "Record the software version, firmware, or hardware revision when known.",
    },
    {
      path: "production.recording.production_medium",
      label: "Recording Medium",
      group: "Recording",
      order: 90,
      examples: ["digital", "analog tape", "hybrid"],
      help:
        "Describe the medium used during capture, independent of later editing or mastering.",
    },
    {
      path: "production.recording.source_date",
      label: "Recording Source Date",
      group: "Recording",
      order: 100,
      examples: ["2016-07-26"],
      help:
        "Date represented by the source recording when known. Use YYYY-MM-DD when a complete date is available.",
    },
    {
      path: "production.recording.notes",
      label: "Recording Notes",
      group: "Recording",
      order: 110,
      examples: ["Captured live with guitar and drums."],
      help:
        "Use for capture-specific details that do not belong to the overall production or editing stage.",
    },

    {
      path: "production.editing.production_type",
      label: "Editing Type",
      group: "Editing",
      order: 10,
      examples: ["comp edit", "cleanup", "restoration"],
      help:
        "Describe the editing stage independently from recording and overall production.",
    },
    {
      path: "production.editing.location",
      label: "Editing Location",
      group: "Editing",
      order: 20,
      examples: ["Home studio", "Edit suite B"],
      help: sharedLocationHelp,
    },
    {
      path: "production.editing.room",
      label: "Editing Room",
      group: "Editing",
      order: 30,
      examples: ["Bedroom", "Edit suite"],
      help: sharedLocationHelp,
    },
    {
      path: "production.editing.city",
      label: "Editing City",
      group: "Editing",
      order: 40,
      examples: ["Irvine"],
      help: sharedLocationHelp,
    },
    {
      path: "production.editing.region",
      label: "Editing Region",
      group: "Editing",
      order: 50,
      examples: ["California"],
      help: sharedLocationHelp,
    },
    {
      path: "production.editing.country",
      label: "Editing Country",
      group: "Editing",
      order: 60,
      examples: ["United States"],
      help: sharedLocationHelp,
    },
    {
      path: "production.editing.system",
      label: "Editing DAW / System",
      group: "Editing",
      order: 70,
      examples: ["Logic Pro", "Pro Tools"],
      help:
        "Enter the workstation or editing system used specifically for edits, cleanup, comping, or restoration.",
    },
    {
      path: "production.editing.revision",
      label: "Editing System Version / Revision",
      group: "Editing",
      order: 80,
      examples: ["9", "2026.6"],
      help:
        "Record the software version, firmware, or hardware revision when known.",
    },
    {
      path: "production.editing.production_medium",
      label: "Editing Medium",
      group: "Editing",
      order: 90,
      examples: ["digital", "analog", "hybrid"],
      help:
        "Describe the medium used during editing, independent of the recording medium.",
    },
    {
      path: "production.editing.notes",
      label: "Editing Notes",
      group: "Editing",
      order: 100,
      examples: ["Removed false starts and normalized spacing."],
      help:
        "Use for edit-specific decisions, cleanup, comping, restoration, or assembly notes.",
    },
  ];

const productionContextFieldMap = new Map(
  productionContextFields.map((field) => [
    field.path,
    field,
  ]),
);

export function findProductionContextField(
  path: string,
): ProductionContextField | undefined {
  return productionContextFieldMap.get(path);
}

export function resolveProductionContextGroup(
  path: string,
): ProductionContextGroup | null {
  if (/^production\.recording(?:\.|$)/.test(path)) {
    return "Recording";
  }

  if (/^production\.editing(?:\.|$)/.test(path)) {
    return "Editing";
  }

  if (/^production(?:\.|$)/.test(path)) {
    return "Production";
  }

  return null;
}
