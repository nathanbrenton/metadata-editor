export type WorkflowAvailability =
  | "available"
  | "partial"
  | "planned";

export type WorkflowStage = {
  id: string;
  title: string;
  availability: WorkflowAvailability;
  summary: string;
  steps: readonly string[];
  currentNote: string;
};

export type WorkflowDefinition = {
  term: string;
  definition: string;
};

export type WorkflowFaqItem = {
  question: string;
  answer: string;
};

export type WorkflowTroubleshootingItem = {
  title: string;
  description: string;
};

export const workflowPath =
  "Ingest → Staging → Library → Publish";

export const workflowAvailabilityLabels: Record<
  WorkflowAvailability,
  string
> = {
  available: "Available",
  partial: "Planning available",
  planned: "Planned",
};

export const workflowStages: readonly WorkflowStage[] = [
  {
    id: "ingest",
    title: "Ingest",
    availability: "available",
    summary:
      "Find source candidates and inspect the audio, artwork, sidecars, inferred identity, and technical evidence without changing source files.",
    steps: [
      "Place an audio file or release folder in the configured ingest drop and refresh the source scan.",
      "Inspect each candidate's file inventory, dates, titles, artists, technical properties, warnings, and possible artwork.",
      "Choose the candidate that should become a new release or update an existing release.",
      "Continue to Staging only after the candidate evidence has been reviewed.",
    ],
    currentNote:
      "Read-only candidate scanning, row-based inspection, ffprobe/MediaInfo evidence, artwork preview, rescanning, and locally saved draft attachment state are available now.",
  },
  {
    id: "staging",
    title: "Staging",
    availability: "available",
    summary:
      "Build or incrementally update a controlled private release workspace from the selected ingest candidate.",
    steps: [
      "Confirm release identity, source inclusion, artwork use, track titles, stable track IDs, and complete track order.",
      "Detect whether the release ID is new or already staged and switch between create and update language.",
      "Preview additions, reorder changes, preserved files, blocked changes, destinations, TOML skeletons, and copy receipts.",
      "Apply the explicit create or update plan through an isolated temporary workspace and verified atomic promotion.",
      "Preserve existing authored metadata and never infer that an omitted source should delete an existing track.",
    ],
    currentNote:
      "New staging-release creation, incremental audio-track updates, track reordering, stable-ID preservation, dry-run plans, explicit confirmation, copy verification, and rollback-safe promotion are available now. Intentional removals and general sidecar replacement remain future workflows.",
  },
  {
    id: "library",
    title: "Library",
    availability: "partial",
    summary:
      "Author canonical release and track metadata, review inheritance, preview audio, and prepare downstream media derivatives.",
    steps: [
      "Add identity, numbering, dates, artists, performers, writers, sample and interpolation sources, arrangement, technical credits, rights, artwork metadata, lyrics, language, and notes.",
      "Use release-level defaults for shared values and override only the individual tracks that differ.",
      "Preview tracks from the sidebar or transport while reviewing titles, sequence, and track-specific values.",
      "Inspect missing, stale, current, or blocked playback and waveform derivatives under Files & Sources.",
      "Generate playback audio, waveform peaks, analysis, and web artwork from canonical masters when write-enabled media preparation is implemented.",
    ],
    currentNote:
      "Metadata editing, release-to-track inheritance, controlled TOML saving, readiness guidance, and broad-format browser audio preview are available. Media-processing status planning and waveform-generation code exist, but derivative-generation UI writes are not enabled yet.",
  },
  {
    id: "publish",
    title: "Publish",
    availability: "planned",
    summary:
      "Run consolidated preflight and build a sanitized public deployment snapshot from the private canonical release.",
    steps: [
      "Validate required metadata, numbering, dates, rights, masters, artwork, playback audio, waveforms, and public catalog entries.",
      "Block publication when files are missing, ambiguous, invalid, stale, or outside the configured media root.",
      "Preview the exact player-facing package while excluding archival masters, private notes, source documents, logs, and editor-only data.",
      "Build in a temporary output directory, verify the completed snapshot, and atomically promote the public deployment.",
      "Record publish history and support later republish, withdrawal, and rollback without deleting the private canonical release.",
    ],
    currentNote:
      "The Publish tab currently provides a read-only readiness overview. Consolidated preflight, Ready/Published state changes, deployment writes, withdrawal, and rollback are planned and are clearly labeled as unavailable.",
  },
] as const;


export const workflowLifecycleStatuses: readonly WorkflowDefinition[] = [
  {
    term: "Draft",
    definition:
      "A private release workspace that is still being authored or prepared.",
  },
  {
    term: "Ready",
    definition:
      "A planned status for a release that has passed the complete preflight gate.",
  },
  {
    term: "Published",
    definition:
      "A planned status identifying the exact validated build currently exposed to the public player.",
  },
  {
    term: "Withdrawn",
    definition:
      "A planned status for a release removed from public output while its private canonical workspace is retained.",
  },
] as const;

export const workflowDerivativeStatuses: readonly WorkflowDefinition[] = [
  {
    term: "Current",
    definition:
      "The derivative exists, is readable, and agrees with the current master and generation profile.",
  },
  {
    term: "Missing",
    definition:
      "The source is usable, but the expected derivative has not been generated.",
  },
  {
    term: "Stale",
    definition:
      "The derivative exists but should be regenerated because its source or generation settings changed.",
  },
  {
    term: "Blocked",
    definition:
      "Generation cannot proceed safely, commonly because a master is missing, ambiguous, unsupported, or invalid.",
  },
] as const;

export const workflowFaqItems: readonly WorkflowFaqItem[] = [
  {
    question: "Where is the summary for the current workflow tab?",
    answer:
      "The left side of the sticky footer shows context for the active tab. Ingest displays the drop point, candidate and file totals, and probe availability; Staging displays the selected candidate or release-workspace count; Library displays release, track, master, artwork, and metadata totals; Publish displays readiness counts and reminds you that publishing writes are disabled.",
  },
  {
    question: "Where should the canonical release live?",
    answer:
      "The editor should retain one private canonical release workspace containing the masters, editable metadata, and source assets. Public deployment output should be generated from that workspace rather than becoming the new source of truth.",
  },
  {
    question: "How do I add a track to a release that was already staged?",
    answer:
      "Return to Ingest, open the original candidate, add the audio source, rescan, and continue to Staging. Include the new track and arrange the complete sequence. When the release ID already exists, Staging changes to Update mode, previews a delta, preserves existing authored metadata and stable track IDs, and applies the update through an isolated temporary copy. Existing tracks are never removed merely because they are absent from a new selection.",
  },
  {
    question: "Should I move or copy a release when going live today?",
    answer:
      "Until automated publishing exists, copy the validated player-facing files rather than moving the canonical release. Moving the only working release makes later corrections and reproducible rebuilds harder.",
  },
  {
    question: "Why will a track not play in the metadata editor?",
    answer:
      "Preview playback requires exactly one audio-playback file or, when that derivative is absent, exactly one audio master. MP3 sources are served directly with byte-range support. Other recognized audio formats are decoded by FFmpeg and streamed as a temporary MP3 without modifying the source file. Confirm FFmpeg and an MP3 encoder are available when live transcoding fails; a generated audio-playback.mp3 remains the fastest and most reliable long-term preview source.",
  },
  {
    question: "Where do I credit samples and interpolations?",
    answer:
      "Use Artists, Performers & Writers → Samples & Interpolations on the individual track. Record the relationship type, source title or artist, source writers, identifiers, usage, and official liner-note wording. The source artist is not automatically added as a performer, and source writers are not automatically added to the current track's songwriting credits.",
  },
  {
    question: "Where do I track sample-clearance administration?",
    answer:
      "Use Label, Publishing & Copyright → Sample Clearance on the individual track. Clearance status, master-use and publishing approval, agreement references, territories, expiration dates, and notes are editor-only administrative data and should not be included in player-facing metadata.",
  },
  {
    question: "Why is media preparation separate from saving metadata?",
    answer:
      "Transcoding and waveform generation can take time and write large files. Keeping those actions explicit prevents an ordinary metadata save from silently launching media jobs.",
  },
  {
    question: "What makes an MP3 or waveform stale?",
    answer:
      "A derivative may be stale when the source master is newer, the generation profile changed, the file is invalid, or its embedded metadata no longer matches the edited release. The planner should report the specific reason.",
  },
  {
    question: "Which file should be used to generate a waveform?",
    answer:
      "Generate waveforms directly from the lossless audio master. Do not use the playback MP3 as an intermediate source.",
  },
] as const;

export const workflowTroubleshootingItems: readonly WorkflowTroubleshootingItem[] = [
  {
    title: "A track preview will not play",
    description:
      "Confirm that the track has exactly one audio-playback file or one audio master. If the browser rejects the master container, prepare audio-playback.mp3 and rescan the release.",
  },
  {
    title: "The planner reports Blocked",
    description:
      "Confirm that exactly one supported audio master exists for the track and that it is a regular file inside the configured media root. Resolve ambiguous or missing masters before generation.",
  },
  {
    title: "A derivative is reported Stale",
    description:
      "Review the reason in the processing plan. A newer master, changed profile, malformed waveform, or changed embedded metadata can require regeneration.",
  },
  {
    title: "FFmpeg or MP3 support is unavailable",
    description:
      "Check the Files & Sources capability information and confirm that FFmpeg is installed with an available MP3 encoder. Planning remains read-only when required capabilities are missing.",
  },
  {
    title: "An existing release cannot be updated",
    description:
      "Incremental updates require a valid ingest-receipt.json from the original staging build. Releases created before receipts were introduced must be recreated through the ingest builder or migrated before they can use the update path.",
  },
  {
    title: "The Workflow & Help page disagrees with the application",
    description:
      "Treat that as a documentation defect. Update this guide, its tests, and the related implementation in the same development patch whenever the workflow changes.",
  },
  {
    title: "Unsure whether an action is implemented",
    description:
      "Use the availability badge on each stage. Available means usable now, Planning available means inspection exists but writing is disabled, and Planned means the workflow is documented but not yet implemented.",
  },
] as const;
