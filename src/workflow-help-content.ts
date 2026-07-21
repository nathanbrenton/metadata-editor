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
  "Ingest → Author → Prepare → Preflight → Publish";

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
      "Create a private release workspace or incrementally update an existing staged release from newly discovered source files.",
    steps: [
      "Place an audio file or release folder in the configured ingest drop, then rescan the candidate when files are added later.",
      "Inspect inferred dates, titles, artists, and technical metadata; explicitly include each new source.",
      "Create a new staging release or detect the existing release and preserve its stable track IDs and authored metadata.",
      "Arrange the complete track sequence, preview additions and reorder adjustments as a delta, then apply the validated staging update atomically.",
      "Retain archival masters and original source assets without transcoding, moving, or destructive edits.",
    ],
    currentNote:
      "Candidate inspection, new staging-release creation, incremental audio-track updates, track reordering, and starter TOML generation are available now. Existing tracks cannot be removed implicitly, and new sidecar updates remain a later workflow.",
  },
  {
    id: "author",
    title: "Author",
    availability: "available",
    summary:
      "Complete release and track metadata while reviewing inheritance and track-specific overrides.",
    steps: [
      "Add identity, numbering, dates, artists, performers, writers, arrangement, and technical credits.",
      "Add rights, artwork metadata, production notes, lyrics, language, and source information.",
      "Use release-level defaults for shared values and override only the tracks that differ.",
      "Preview tracks from the sidebar or the transport above the metadata tabs while reviewing titles, order, and track-specific values.",
      "Review missing required files, readiness indicators, and raw TOML when admin tools are enabled.",
    ],
    currentNote:
      "Metadata editing, release-to-track inheritance, controlled TOML saving, and browser audio preview controls are available now. Preview playback prefers audio-playback files, falls back to one unambiguous audio master, and uses FFmpeg to stream a temporary browser-compatible MP3 preview for non-MP3 sources.",
  },
  {
    id: "prepare",
    title: "Prepare",
    availability: "partial",
    summary:
      "Generate and validate the downstream assets required by the audio player and public web output.",
    steps: [
      "Inspect whether each track has a usable audio master, playback MP3, and waveform file.",
      "Generate playback audio from the lossless master rather than from another derivative.",
      "Generate waveform peaks from the lossless master using the versioned waveform profile.",
      "Regenerate only assets reported as missing or stale, then validate the resulting files.",
    ],
    currentNote:
      "A read-only planning API and waveform-generation module exist. UI controls and filesystem writes are not enabled yet.",
  },
  {
    id: "preflight",
    title: "Preflight",
    availability: "planned",
    summary:
      "Run one release-wide validation gate before anything is treated as publishable.",
    steps: [
      "Validate required metadata, numbering, dates, rights, masters, artwork, and derivatives.",
      "Block publication when files are missing, ambiguous, invalid, stale, or outside the configured media root.",
      "Preview the player-facing release package and resolve warnings that require human review.",
      "Mark the release ready only after the complete preflight passes.",
    ],
    currentNote:
      "Individual validations exist, but a consolidated release preflight and Ready status are planned.",
  },
  {
    id: "publish",
    title: "Publish",
    availability: "planned",
    summary:
      "Build a sanitized public deployment snapshot without exposing private masters or editor-only data.",
    steps: [
      "Re-run preflight and create the public package in a temporary output directory.",
      "Include playback audio, waveform data, web artwork, and only the metadata needed by the player.",
      "Exclude archival masters, private notes, source documents, logs, and other internal material.",
      "Validate the completed package and atomically promote it to the deployment output.",
    ],
    currentNote:
      "Automated publication, withdrawal, rollback, and deployment snapshots are planned. Continue using the documented manual process until they are implemented.",
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
    question: "Where should the canonical release live?",
    answer:
      "The editor should retain one private canonical release workspace containing the masters, editable metadata, and source assets. Public deployment output should be generated from that workspace rather than becoming the new source of truth.",
  },
  {
    question: "How do I add a track to a release that was already staged?",
    answer:
      "Return to the original ingest candidate, add the audio source, rescan, include the new track, and arrange the complete sequence. When the release ID already exists, the builder changes to Update mode, previews a delta, preserves existing authored metadata and stable track IDs, and applies the update through an isolated temporary copy. Existing tracks are never removed merely because they are absent from a new selection.",
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
