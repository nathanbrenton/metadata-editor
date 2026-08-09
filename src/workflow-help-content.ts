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
      "Inspect each candidate's file inventory, dates, titles, artists, technical properties, warnings, and possible artwork. The Source files table keeps the visible columns compact—Preview, Filename, Duration, Size, and Details. Image rows show clickable thumbnails, and audio rows provide play/pause preview controls that continue to the next available audio source when a track ends and stop after the final audio source. Type, container, codec, sample rate, channels, bit depth, probe provenance, and other technical properties remain available in Details instead of occupying dedicated table columns. Inspection warnings name the affected source path, and the corresponding Source files row carries its own warning indicator so the problem file can be found immediately. Numbered track folders such as 01, 02, track-03, or 04_title are treated as high-confidence structural hints: one audio file in that scope seeds the track number, one image paired with that audio seeds track-level front artwork, and one image at the release root seeds release-level front artwork. Filename disagreement does not override the stronger folder association. Source counts and total size are condensed into the Source files header without adding another summary table.",
      "Choose release artist and release title sources independently from folder-field ranges or embedded album and artist tags. Continuing to Staging explicitly carries those selected values into the release draft, including over an older locally saved inferred identity, while keeping both fields editable. Detailed inference evidence is available in a collapsed disclosure beneath the identity controls.",
      "Choose the candidate that should become a new release or update an existing release.",
      "Continue to Staging only after the candidate evidence has been reviewed.",
    ],
    currentNote:
      "Read-only candidate scanning, row-based inspection, selectable release-identity sources, source-path/folder-structure evidence, ffprobe/MediaInfo evidence, artwork preview, rescanning, and locally saved draft attachment state are available now. Structural suggestions remain editable in Staging and ambiguous multi-audio or multi-image folders are not silently collapsed into one assignment.",
  },
  {
    id: "staging",
    title: "Staging",
    availability: "available",
    summary:
      "Build or incrementally update a controlled private release workspace from the selected ingest candidate.",
    steps: [
      "Confirm release identity, source inclusion, artwork use, track titles, source dates, stable track IDs, and complete track order by entering track numbers directly. Track title tools can populate included sources from one filename field or each file's embedded TITLE tag; source-date tools can apply one date to all included, non-missing sources. Use the play/pause buttons in Tracks or Review to audition audio. Artwork & files presents available images as a compact thumbnail-only palette above release and track destination rows; filenames, paths, source state, assignment badges, and action buttons are intentionally omitted from the palette. Folder-derived artwork assignments appear on destination rows automatically; drag a thumbnail to a row, or click/focus a thumbnail and use the non-drag assignment control, to assign front artwork. Source review and detach/remove actions remain available in the collapsed advanced artwork editor. The release row controls release-level front artwork, while numbered track rows use the titles confirmed in Tracks and create track-local artwork placement. Replacing an occupied front-artwork target requires confirmation. Advanced roles and multi-track assignments remain available in the collapsed editor. TIFF/TIF sources are converted to an in-memory PNG preview through FFmpeg without modifying or writing beside the ingest source. Attached pictures embedded in MP3 or other audio files are deduplicated by extracted-byte hash, previewed as virtual artwork sources, and—when one cover is unambiguous—preassigned as the release-level front artwork master. Extraction occurs only after the reviewed staging plan is confirmed.",
      "Detect whether the release ID is new or already staged and switch between create and update language.",
      "Review the release as a release before writing files: the final step shows release front artwork and identity, an artwork-aware numbered track list with source-audio preview, and a compact preflight summary. Track rows show the effective front cover, including release-level inheritance and track-level overrides. Generate or refresh the server-validated plan from Preflight; warnings remain visible, while artwork placement, filesystem operations, and metadata/TOML updates stay collapsed as technical details until needed. Filesystem plan rows retain compact file-kind icons and a green check or red × for row readiness.",
      "Apply the explicit create or update plan through an isolated temporary workspace and verified atomic promotion.",
      "Preserve existing authored metadata and never infer that an omitted source should delete an existing track.",
    ],
    currentNote:
      "New staging-release creation, incremental audio-track updates, explicit canonical-audio replacement, artwork-only revision candidates, reviewed canonical artwork replacement, track reordering by track number, bulk title selection, bulk source-date application, read-only source-audio and artwork preview, stable-ID preservation, dry-run plans, explicit confirmation, copy verification, and rollback-safe promotion are available now. When an existing Library release is selected, tracks that are absent from the current ingest candidate are preserved automatically, along with their verified canonical assets. A candidate audio source can explicitly Replace canonical audio for one existing stable track; the verified old master is superseded while authored metadata and the stable track ID remain intact, and generated playback/HLS/waveform derivatives for that track are removed so Prepare release can regenerate them. Artwork & files shows current canonical Library front artwork on the same release/track destination rows, including existing tracks whose original audio is not in the new candidate. New artwork can be added from a later candidate; replacing an occupied front-artwork target requires explicit confirmation, verifies the old Library copy against the ingest receipt, and synchronizes the affected artwork path in authored TOML without changing unrelated metadata. Intentional track removal and general text-sidecar replacement remain future workflows.",
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
      "When a release title or generated directory identity changes, use Release identity & directory from the release menu. Review the server plan before updating release.id, release.title, release_reference.release_id values, the staging receipt, and the OS-level release folder. Existing targets are never overwritten; an operation manifest, backups, stale-plan detection, and rollback protect the move.",
      "Preview tracks from the sidebar or transport while reviewing titles, sequence, and track-specific values. When a Library preview reaches the end of a track, playback automatically continues to the next playable track in the displayed release order and stops after the final playable track. The release header displays only explicit release-scoped front artwork; it never substitutes the selected track's image. Track rows show compact local track-artwork thumbnails when available, omit the repeated word Track, and present the saved number directly before the display title in one compact line; multi-disc releases use disc.track numbering. On desktop, the long release/track sidebar remains sticky with its own bounded scroll region, while metadata and credits follow the page's native vertical scroll. The sidebar scrolls independently while it has room, then continued wheel or trackpad movement at its top or bottom edge hands off to the page so the release header, tabs, and footer remain reachable. Outside editable fields, Arrow Up and Arrow Down move through the sidebar's Release row and displayed track order. Only the sidebar scrolls for keyboard navigation, and it moves only when the destination crosses a visible edge, preventing whole-page jumps and unnecessary re-centering.",
      "Inspect missing, stale, current, or blocked private playback and waveform derivatives under Files & Sources. The private playback MP3 remains useful for local Library preview but is not the website listening asset.",
      "From Publish preflight, use Prepare release to generate or refresh the hosted-listening derivatives: an AAC-LC HLS web stream with short fMP4 segments plus waveform JSON. Stream generation always starts from the canonical audio source and never copies masters into website output; waveform analysis likewise starts from the canonical source, decoding non-WAV audio to temporary PCM when necessary. Browser-artwork derivative generation remains a later media-preparation step.",
    ],
    currentNote:
      "Metadata editing, release-to-track inheritance, controlled TOML saving, track-number-driven sidebar ordering, guarded track- and release-directory synchronization, readiness guidance, broad-format browser audio preview, and reviewed HLS-stream/waveform preparation are available. Prepare release stages derivatives in an isolated operation workspace, verifies the HLS playlist, initialization segment, referenced media segments, and waveform before promotion, rejects stale preflight state, backs up replacements, and records a manifest for rollback. Public-package writes remain disabled.",
  },
  {
    id: "publish",
    title: "Publish",
    availability: "partial",
    summary:
      "Run consolidated preflight and build a sanitized public deployment snapshot from the private canonical release.",
    steps: [
      "Run the release-scoped Library validator, then review the exact Publish preflight for required metadata, numbering, dates, canonical audio, browser artwork, HLS web streams, waveforms, and public catalog destinations.",
      "Block publication when source files are missing or ambiguous, an HLS playlist or referenced segment is missing/unsafe, waveform data is stale, paths escape configured roots, or another required public resource cannot be resolved.",
      "Preview the exact player-facing package under published-media: sanitized metadata, browser artwork, precomputed waveform data, and per-track HLS manifests/segments. Exclude masters, private playback MP3s, TOML source documents, ingest receipts, backups, production notes, and editor-only administration.",
      "Build in a temporary output directory, verify the completed snapshot, and atomically promote the public deployment.",
      "Record publish history and support later republish, withdrawal, and rollback without deleting the private canonical release.",
    ],
    currentNote:
      "The Publish tab starts with a compact five-column readiness overview: Release, Sources, Public media, Status, and Next step. Each release row includes a release-artwork thumbnail and one primary Continue to preflight button. After preflight, the default view is deliberately concise: one plain-language result, separate Web stream and Waveform readiness, and one clearly labeled next action—Resolve blockers, Prepare release, or Build public package. Problems/warnings, the itemized package plan, and the technical contract/fingerprint remain collapsed until opened. Preflight itself is read-only. Prepare release generates the website-listening derivative as AAC-LC HLS with roughly three-second fMP4 segments plus independent waveform-peaks.json data; it never exposes the canonical master or requires the private audio-playback.mp3 to enter the website package. The HLS playlist uses relative segment references so future private storage/CDN authorization can be added without cloud-provider coupling. Build public package remains disabled until sanitized published-media promotion is implemented. The CLI commands publish:plan and preflight:publish remain read-only. Nothing is copied to published-media yet.",
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
      "In Staging → Tracks, the Use checkboxes define the current source selection. Source date tools are prefilled from the Release Date confirmed in Staging → Release, including a date inferred during Ingest. The bulk value follows the Release Date until you manually override it. Choose Apply to selected to copy that date into the selected track drafts; each track Source Date remains independently editable afterward. Missing sources are skipped and the resulting draft change remains reviewable before the staging plan is applied.",
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
      "The left side of the sticky footer shows context for the active tab. Ingest displays the drop point, candidate and file totals, and probe availability; Staging displays the selected candidate or release-workspace count; Library displays release, track, master, artwork, and metadata totals; Publish displays readiness counts and indicates that preflight plus private derivative preparation are enabled while public-package writes remain disabled.",
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
      "Keep the long-term private canonical release in the configured media-library root. It contains the release masters, editable TOML metadata, artwork, ingest receipt, and reproducible prepared derivatives such as HLS streams and waveform peaks. Staging creates or updates that same canonical Library; published-media is generated output and never becomes the source of truth.",
  },
  {
    question: "How do I add a track to a release that was already staged?",
    answer:
      "Place the new source material in ingest-drop, scan that candidate, and continue to Staging using the existing release ID. The original ingest-drop candidate does not need to remain available after a successful build. When the release ID already exists, Staging changes to Update mode, loads the existing stable-track targets from the Library receipt, previews a delta, and applies the update through an isolated temporary copy. Existing tracks and verified assets that are absent from the new candidate are preserved automatically. To replace a revised mix, choose Replace Track N in the candidate row's Revision action; Staging preserves that track's stable ID and authored TOML, verifies the old canonical master before superseding it, and invalidates generated audio/HLS/waveform derivatives so Publish → Prepare release can rebuild them.",
  },
  {
    question: "How do I add or replace artwork on an existing release?",
    answer:
      "Place the newly obtained image files in a new ingest-drop candidate, continue to Staging with the existing release ID, and open Artwork & files. No original audio needs to be resupplied: existing Library tracks remain available as artwork destinations and their current canonical front artwork is shown in place. Drag or assign new artwork normally. Adding an unused artwork destination is a reviewed add; assigning candidate front artwork over an occupied Library front-artwork target requires Confirm artwork replacement before the update plan can proceed. The old Library artwork must still match its ingest receipt, unrelated artwork remains preserved, and affected release/track TOML artwork paths are synchronized when the replacement extension or destination changes.",
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
    question: "What makes a web stream or waveform stale?",
    answer:
      "A publish derivative may be stale when the canonical audio source changed, the HLS or waveform generation profile changed, the playlist or referenced stream segments are incomplete, or waveform data no longer matches its active analysis profile. Private audio-playback.mp3 freshness is tracked separately for local Library playback and is not a website-package requirement.",
  },
  {
    question: "Which file should be used to generate a waveform?",
    answer:
      "Generate waveforms from the canonical audio source directly. Prefer a lossless master when one exists, but an MP3- or M4A-only canonical source is valid: FFmpeg decodes that source to temporary PCM for the same waveform analyzer. Never use audio-playback.mp3 as an intermediate when a distinct canonical master exists.",
  },
  {
    question: "Where do files live during each workflow stage?",
    answer:
      "The runtime location strip beneath the workflow tabs shows the configured roots. Ingest reads the disposable source drop without modifying it. After a reviewed build succeeds, that ingest candidate can be deleted. Staging creates or updates releases directly in the private canonical media-library root, and Library authors that same long-term source of truth. Publish preflight may prepare reproducible stream/index.m3u8 + fMP4 segment assets and waveform-peaks.json inside that private release after explicit review. Building the sanitized copy in the configured published-media root remains a separate step; canonical masters and private playback MP3s are never moved or exposed as the public server root.",
  },
  {
    question: "How do I check whether manual folder, filename, or TOML changes left the Library inconsistent?",
    answer:
      "Run npm run validate:release -- <release-id> for one release or npm run validate:library for the entire canonical Library. The validator is read-only: it reports path, identity, reference, numbering, TOML, master, derivative, and ingest-receipt issues without renaming, rewriting, deleting, or repairing files. Add --json for machine-readable output or --verify-hashes for full receipt copy verification.",
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
      "Check the Files & Sources capability information and confirm that FFmpeg is installed. Non-MP3 sources require an available MP3 encoder for playback generation; MP3 canonical sources can use sanitized stream copy without re-encoding, but still require FFmpeg. Non-WAV waveform sources also require FFmpeg decoding. Prepare release stays disabled or fails safely when a required capability is unavailable.",
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
