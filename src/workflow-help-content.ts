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
      "Inspect each candidate's file inventory, dates, titles, artists, technical properties, warnings, and possible artwork. Source counts and total size are condensed into the Source files header without adding another summary table.",
      "Choose release artist and release title sources independently from folder-field ranges or embedded album and artist tags. Continuing to Staging explicitly carries those selected values into the release draft, including over an older locally saved inferred identity, while keeping both fields editable. Detailed inference evidence is available in a collapsed disclosure beneath the identity controls.",
      "Choose the candidate that should become a new release or update an existing release.",
      "Continue to Staging only after the candidate evidence has been reviewed.",
    ],
    currentNote:
      "Read-only candidate scanning, row-based inspection, selectable release-identity sources, ffprobe/MediaInfo evidence, artwork preview, rescanning, and locally saved draft attachment state are available now.",
  },
  {
    id: "staging",
    title: "Staging",
    availability: "available",
    summary:
      "Build or incrementally update a controlled private release workspace from the selected ingest candidate.",
    steps: [
      "Confirm release identity, source inclusion, artwork use, track titles, source dates, stable track IDs, and complete track order by entering track numbers directly. Track title tools can populate included sources from one filename field or each file's embedded TITLE tag; source-date tools can apply one date to all included, non-missing sources. Use the play/pause buttons in Tracks or Review to audition audio. Other files shows read-only artwork thumbnails; TIFF/TIF sources are converted to an in-memory PNG preview through FFmpeg without modifying or writing beside the ingest source. Attached pictures embedded in MP3 or other audio files are deduplicated by extracted-byte hash, previewed as virtual artwork sources, and—when one cover is unambiguous—preassigned as the release-level front artwork master. Extraction occurs only after the reviewed staging plan is confirmed.",
      "Detect whether the release ID is new or already staged and switch between create and update language.",
      "Preview additions, reorder changes, preserved files, blocked changes, destinations, TOML skeletons, and copy receipts. The Review table uses compact file-kind icons and a green check or red × for row readiness.",
      "Apply the explicit create or update plan through an isolated temporary workspace and verified atomic promotion.",
      "Preserve existing authored metadata and never infer that an omitted source should delete an existing track.",
    ],
    currentNote:
      "New staging-release creation, incremental audio-track updates, track-number ordering, bulk title selection, bulk source-date application, read-only source-audio and artwork preview, stable-ID preservation, dry-run plans, explicit confirmation, copy verification, and rollback-safe promotion are available now. The track table shows source paths relative to the selected candidate and flags source dates later than the release date as non-blocking advisories. Intentional removals and general sidecar replacement remain future workflows.",
  },
  {
    id: "library",
    title: "Library",
    availability: "partial",
    summary:
      "Author canonical release and track metadata, review inheritance, preview audio, and prepare downstream media derivatives. Library release rows surface the authored title and release artist before the date and track count.",
    steps: [
      "Add identity, numbering, dates, artists, performers, writers, sample and interpolation sources, arrangement, technical credits, rights, artwork metadata, lyrics, language, and notes. Contributor sort names default from credited names and stay synchronized until individually overridden. Release and track licenses default to All rights reserved. while remaining editable.",
      "Use release-level defaults for shared values and override only the individual tracks that differ. The performer-credit copy dialog uses a dense destination table and can select an inclusive destination range in displayed disc/track order, then replace, add to, or remove from the current destination selection before its duplicate-aware dry-run.",
      "When saved track numbers change, save the metadata first, then load and confirm the server's exact artist_number_title dry-run plan; guarded synchronization updates track IDs and reference TOMLs without overwriting an existing target.",
      "Preview tracks from the sidebar or transport while reviewing titles, sequence, and track-specific values. Track rows omit the repeated word Track and present the saved number directly before the display title in one compact line; multi-disc releases use disc.track numbering. On desktop, the long release/track sidebar remains sticky with its own bounded scroll region, while metadata and credits follow the page's native vertical scroll. The sidebar scrolls independently while it has room, then continued wheel or trackpad movement at its top or bottom edge hands off to the page so the release header, tabs, and footer remain reachable. Outside editable fields, Arrow Up and Arrow Down move through the sidebar's Release row and displayed track order. Only the sidebar scrolls for keyboard navigation, and it moves only when the destination crosses a visible edge, preventing whole-page jumps and unnecessary re-centering.",
      "Inspect missing, stale, current, or blocked playback and waveform derivatives under Files & Sources.",
      "Generate playback audio, waveform peaks, analysis, and web artwork from canonical masters when write-enabled media preparation is implemented.",
    ],
    currentNote:
      "Metadata editing, release-to-track inheritance, controlled TOML saving, track-number-driven sidebar ordering, guarded track-directory synchronization, readiness guidance, and broad-format browser audio preview are available. Directory swaps use temporary names, an operation manifest, collision checks, and rollback protection. Media-processing status planning and waveform-generation code exist, but derivative-generation UI writes are not enabled yet.",
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
    question: "How is the staging release directory ID generated?",
    answer:
      "Staging generates the release directory ID from Release Date and Release Title using YYYY-MM-DD_release-name. It continues to follow date and title changes while the generated value is in use. Entering another ID creates an individual override; Use generated ID restores automatic synchronization.",
  },
  {
    question: "Why is a source date warning shown in Staging?",
    answer:
      "A source date later than the release date may be intentional, but it can also indicate a mistaken date or a source from a later editing session. Staging highlights the affected rows for review without blocking the build or update plan.",
  },
  {
    question: "How do I populate Staging track titles from filenames or tags?",
    answer:
      "In Staging → Tracks, the Use checkboxes define the current source selection. In Track title tools, choose Filename field or Embedded TITLE tag. Filename mode lets you choose the separator and either a numbered field or the last field after the extension is removed. The toolbar reports how many selected sources contain the chosen value; unavailable rows remain unchanged, and every populated title remains manually editable before the staging plan is applied.",
  },
  {
    question: "How do I apply one source date to several Staging tracks?",
    answer:
      "In Staging → Tracks, the Use checkboxes define the current source selection. Enter a date in Source date tools above the table and choose Apply to selected. Missing sources are skipped and the resulting draft change remains reviewable before the staging plan is applied.",
  },
  {
    question: "How do I copy performer credits to a track range?",
    answer:
      "Open Copy performer credits from the saved release or track performer editor. Under Destination tracks, use the dense Disc / Track / Title table or choose an inclusive Start track and End track using the displayed order. Replace selection selects only that range; Add to selection keeps prior targets; Remove from selection subtracts the range. The source track remains excluded, existing target credits are preserved, exact duplicates are skipped, and no TOML is written until the reviewed copy plan is applied.",
  },
  {
    question: "Can I preview source audio before applying a Staging plan?",
    answer:
      "Yes. Staging → Tracks provides one play/pause button for every available inspected audio source. The same shared preview control is available beside audio rows in Review, including changed-source decisions and the generated build plan. MP3 files are served directly; other recognized formats are live-transcoded through FFmpeg to a temporary MP3 stream. Previewing is read-only and never writes a derivative or changes the ingest source.",
  },
  {
    question: "Where is the summary for the current workflow tab?",
    answer:
      "The left side of the sticky footer shows context for the active tab. Ingest displays the drop point, candidate and file totals, and probe availability; Staging displays the selected candidate or release-workspace count; Library displays release, track, master, artwork, and metadata totals; Publish displays readiness counts and reminds you that publishing writes are disabled.",
  },
  {
    question: "Why are Developer / Admin Tools disabled after a reload?",
    answer:
      "Admin mode is intentionally temporary. Every page load starts with Developer / Admin Tools disabled, and enabling it affects only the current application session. The setting is not written to browser storage.",
  },
  {
    question: "How does the scanner choose between multiple artwork masters?",
    answer:
      "The scanner keeps the ambiguity visible but suggests one deterministic candidate. Explicit front-cover and master naming is considered first, followed by the format order TIFF/TIF, PNG, WebP, AVIF, JPEG, and GIF. TIFF is preferred as the archival master when otherwise equivalent candidates are present. Library previews convert TIFF to an in-memory PNG through FFmpeg without changing or writing beside the archival master. The non-selected files remain untouched and should be reviewed rather than deleted automatically.",
  },
  {
    question: "How are dates entered and stored?",
    answer:
      "Recognized full-date metadata fields use the same native calendar control throughout Ingest, Staging, Library, production notes, and sample-clearance editing. Saved TOML values remain ISO YYYY-MM-DD. Existing partial legacy values are preserved and identified until you deliberately replace them with a complete calendar date.",
  },
  {
    question: "What happens to track directory names when I renumber a release?",
    answer:
      "For track directories using artist_number_title, saving numbering metadata does not move folders. Library then loads the server's exact dry-run plan, shows every rename or blocked item, and requires the displayed confirmation phrase before applying it. The apply request includes the reviewed plan fingerprint, so any intervening release change forces a fresh review. The server writes an operation manifest, blocks duplicate numbers and existing targets, uses temporary names for swaps, updates track.id and track_reference.track_id in the track TOMLs, and rolls completed steps back if a later step fails. Custom directory IDs that do not use the numbered convention are never guessed or renamed automatically.",
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
    title: "Multiple artwork masters are detected",
    description:
      "Review the amber Scanner warnings panel. The scanner suggests the highest-ranked candidate using filename role and format priority, but it leaves every source file untouched so you can confirm whether another file is the intended master.",
  },
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
