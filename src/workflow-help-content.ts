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
      "Find source candidates and inspect audio, video, artwork, sidecars, inferred identity, and technical evidence without changing source files.",
    steps: [
      "Place an audio file or release folder in the configured ingest drop and refresh the source scan.",
      "Inspect each candidate's file inventory, dates, titles, artists, technical properties, warnings, and possible artwork. The Source files table keeps the visible columns compact—Preview, Filename, Duration, Size, and Details. Image rows show clickable thumbnails, video rows are identified as first-class video sources with probe-derived duration/dimensions/frame-rate/codec details, and audio rows provide play/pause preview controls that continue to the next available audio source when a track ends and stop after the final audio source. Type, container, codec, sample rate, channels, bit depth, probe provenance, and other technical properties remain available in Details instead of occupying dedicated table columns. Inspection warnings name the affected source path, and the corresponding Source files row carries its own warning indicator so the problem file can be found immediately. Numbered track folders such as 01, 02, track-03, or 04_title are treated as high-confidence structural hints: one audio file in that scope seeds the track number, one image paired with that audio seeds track-level front artwork, and one image at the release root seeds release-level front artwork. Filename disagreement does not override the stronger folder association. Source counts and total size are condensed into the Source files header without adding another summary table.",
      "Choose release artist and release title sources independently from folder-field ranges or embedded album and artist tags. Continuing to Staging explicitly carries those selected values into the release draft, including over an older locally saved inferred identity, while keeping both fields editable. Detailed inference evidence is available in a collapsed disclosure beneath the identity controls.",
      "Choose the candidate, then confirm its Target release separately from source identity. Auto targets one unambiguous exact Library match; New release keeps the candidate on the creation path; Existing Library release lets you explicitly select any canonical release regardless of ingest-folder name.",
      "Continue to Staging only after the candidate evidence has been reviewed.",
    ],
    currentNote:
      "Read-only candidate scanning, row-based inspection, first-class probe-verified video detection, selectable release-identity sources, an explicit Target release selector, source-path/folder-structure evidence, ffprobe/MediaInfo evidence, recognized FFmetadata sidecar evidence, artwork preview, rescanning, and locally saved draft attachment state are available now. Target release is intentionally independent from source-folder naming: Auto only chooses an existing Library release for one exact unambiguous identity match, while the user can force New release or explicitly choose any Existing Library release. When an existing target is selected, its canonical release ID and authored release identity are carried into Staging before update planning. Probe-verified video sources can continue to Staging, where each included video receives a reviewed stable ID, descriptive type, canonical video-master destination, and optional semantic relationship to one track while remaining release-scoped. FFmetadata sidecars can be introduced with a new release or later as revision evidence for an existing Library release; paired values seed unambiguous new-release identity/track drafts, while existing authored Library metadata is compared without silent overwrite. Structural suggestions remain editable in Staging and ambiguous multi-audio, multi-image, or metadata-source conflicts are surfaced for review. The Ingest candidate overview keeps date evidence compact: it shows only a count/status indicator in the table and exposes the inferred date values on hover.",
  },
  {
    id: "staging",
    title: "Staging",
    availability: "available",
    summary:
      "Build or incrementally update a controlled private release workspace from the selected ingest candidate.",
    steps: [
      "Confirm release identity, source inclusion, artwork use, track titles, source dates, stable track IDs, canonical video destinations, and complete track order by entering track numbers directly. The Videos step keeps video assets release-scoped under videos/<stable-id>/, copies source bytes unchanged as video-master.<original-extension>, writes video.toml, allows a flexible descriptive video type, and can optionally relate a video to one included track without nesting the video under that track. Track title tools can populate included sources from one filename field or each file's embedded TITLE tag; source-date tools can apply one date to all included, non-missing sources. Use the play/pause buttons in Tracks or Review to audition audio. The Tracks table keeps source identity compact: each audio source is represented by a music-file icon whose full path appears on hover, Preview keeps its own dedicated column, and State uses sync-style status indicators instead of long text badges. Artwork & files presents available images as a compact thumbnail-only palette above release and track destination rows; filenames, paths, source state, assignment badges, and action buttons are intentionally omitted from the palette. Folder-derived artwork assignments appear on destination rows automatically; drag a thumbnail to a row, or click/focus a thumbnail and use the non-drag assignment control, to assign front artwork. A successful manual assignment is shown persistently on the destination row, produces a brief success toast, and counts as the source-review decision for a standalone image so Review does not ask you to include the same artwork again. Embedded artwork keeps audio-source review independent. Source review and detach/remove actions remain available in the collapsed advanced artwork editor. The release row controls release-level front artwork, while numbered track rows use the titles confirmed in Tracks and create track-local artwork placement. Replacing an occupied front-artwork target requires confirmation. Advanced roles and multi-track assignments remain available in the collapsed editor. TIFF/TIF sources are converted to an in-memory PNG preview through FFmpeg without modifying or writing beside the ingest source. Attached pictures embedded in MP3 or other audio files are deduplicated by extracted-byte hash, previewed as virtual artwork sources, and—when one cover is unambiguous—preassigned as the release-level front artwork master. Extraction occurs only after the reviewed staging plan is confirmed.",
      "Detect whether the release ID is new or already staged and switch between create and update language.",
      "Review the release as a release before writing files: the final step shows release front artwork and identity, an artwork-aware numbered track list with source-audio preview, and a compact preflight summary. Track rows show the effective front cover, including release-level inheritance and track-level overrides. Generate or refresh the server-validated plan from Preflight; genuine warnings remain visible, while normal staging mechanics appear as informational Staging behavior notes and artwork placement, filesystem operations, and metadata/TOML updates stay collapsed as technical details until needed. Filesystem plan rows retain compact file-kind icons and a green check or red × for row readiness.",
      "Apply the explicit create or update plan through an isolated temporary workspace and verified atomic promotion.",
      "Preserve existing authored metadata and never infer that an omitted source should delete an existing track.",
    ],
    currentNote:
      "The existing-release overview defaults to Release date · newest and can be resorted without changing canonical Library order. Its compact artwork-first table keeps the Library path on the release text hover rather than the entire cell and is sized to fit the desktop workspace without routine horizontal scrolling. New staging-release creation, incremental audio-track updates, explicit canonical-audio replacement, artwork-only revision candidates, recognized FFmetadata metadata-sidecar comparison, reviewed canonical artwork replacement, track reordering by track number, bulk title selection, bulk source-date application, read-only source-audio and artwork preview, stable-ID preservation, dry-run plans, explicit confirmation, copy verification, and rollback-safe promotion are available now. When an existing Library release is selected, tracks that are absent from the current ingest candidate are preserved automatically, along with their verified canonical assets. A later FFmetadata sidecar may be staged by itself or alongside new media: filename, track-number, and title hints are used to pair it with candidate or existing Library tracks, mapped values are compared against the current Staging draft and, for an existing release, the relevant canonical Library TOML values including rights, language, lyrics, numbering, genre, and writing-credit lists when available. Repeated aliases that disagree remain visible as conflicts, and unsupported tags are preserved as unmapped evidence. Existing authored Library metadata is not silently overwritten by sidecar evidence. A candidate audio source can explicitly Replace canonical audio for one existing stable track; the verified old master is superseded while authored metadata and the stable track ID remain intact, and generated playback/HLS/waveform derivatives for that track are removed so Prepare release can regenerate them. Artwork & files shows current canonical Library front artwork on the same release/track destination rows, including existing tracks whose original audio is not in the new candidate. New artwork can be added from a later candidate; replacing an occupied front-artwork target requires explicit confirmation, verifies the old Library copy against the ingest receipt, and synchronizes the affected artwork path in authored TOML without changing unrelated metadata. Intentional track removal and arbitrary automatic sidecar-to-Library writes remain separate reviewed workflows. The Existing release workspaces overview is artwork-first, keeps the canonical Library path on the Release cell hover, places Tracks beside Audio masters, labels the compact readiness column Metadata, uses readiness icons with full status on hover, and presents Update mode as a compact Guarded state before the Open in Library next step.",
  },
  {
    id: "library",
    title: "Library",
    availability: "partial",
    summary:
      "Author canonical release, track, and video metadata, review inheritance, preview audio, inspect canonical video assets, and prepare downstream media derivatives. Library release rows surface the authored title and release artist before track/video counts.",
    steps: [
      "Add identity, numbering, dates, artists, performers, writers, sample and interpolation sources, arrangement, technical credits, rights, artwork metadata, lyrics, language, and notes. Contributor sort names default from credited names and stay synchronized until individually overridden. Release and track licenses default to All rights reserved. while remaining editable.",
      "Use release-level defaults for shared values and override only the individual tracks that differ. The performer-credit copy dialog uses a dense destination table and can select an inclusive destination range in displayed disc/track order, then replace, add to, or remove from the current destination selection before its duplicate-aware dry-run.",
      "When saved track numbers change, save the metadata first, then load and confirm the server's exact artist_number_title dry-run plan; guarded synchronization updates track IDs and reference TOMLs without overwriting an existing target.",
      "When a release title or generated directory identity changes, use Release identity & directory from the release menu. Review the server plan before updating release.id, release.title, release_reference.release_id values, the staging receipt, and the OS-level release folder. The review is change-first: moved, updated, or blocked items are expanded; verified unchanged files are collapsed; and the exhaustive path table remains available under Technical plan details. Existing targets are never overwritten; an operation manifest, backups, stale-plan detection, and rollback protect the move.",
      "Preview tracks from the sidebar or transport while reviewing titles, sequence, and track-specific values. When a Library preview reaches the end of a track, playback automatically continues to the next playable track in the displayed release order and stops after the final playable track. The release header displays only explicit release-scoped front artwork; it never substitutes the selected track's image. Track rows always show the effective front artwork when one is available: track-specific artwork appears at full strength, while inherited release artwork uses a subdued dashed treatment with a small R scope marker. Rows still omit the repeated word Track and present the saved number directly before the display title in one compact line; multi-disc releases use disc.track numbering. The release header and sidebar expose compact health indicators from the same read-only current checks used by Publish preflight: blocking issues, warnings, and preparation/freshness work are kept distinct, with per-track bubbles showing where work is concentrated. Health describes actionable current state. Field-level provenance chips now distinguish values stored in the selected canonical TOML, values inherited from release metadata, and values generated by metadata-editor; hover a chip for the exact source document/path or generation rule. A stored chip intentionally does not claim whether the value originally came from a manual edit, filename inference, or embedded tag, because that origin is not yet persisted as canonical field-level provenance; detailed ingest evidence remains available in Ingest. On desktop, the long release/track sidebar defaults to a wider column and remains sticky with its own bounded scroll region; drag the vertical divider to resize it, use Left/Right while the divider is focused for keyboard resizing, and use Home or double-click to restore the default width. The chosen width is remembered in this browser, while metadata and credits follow the page's native vertical scroll. The sidebar scrolls independently while it has room, then continued wheel or trackpad movement at its top or bottom edge hands off to the page so the release header, tabs, and footer remain reachable. Outside editable fields, Arrow Up and Arrow Down move through the sidebar's Release row and displayed track order. Only the sidebar scrolls for keyboard navigation, and it moves only when the destination crosses a visible edge, preventing whole-page jumps and unnecessary re-centering.",
      "Release cards include canonical video counts and a compact Videos disclosure when video assets exist. Each row now uses the prepared poster when available, shows stable identity/type/relationship, and follows authored display order instead of relying on directory names. Browser-direct masters can still be previewed read-only. Edit metadata can update title, flexible type, description, date, location, director, camera operator, display order, an optional poster-frame time in seconds, or related-track relationship without changing the stable video ID or canonical master path. Leave poster time blank for deterministic automatic poster selection; an authored time becomes part of derivative freshness so changing it makes the private video presentation media stale until Prepare video media runs again. Library scanning reports missing video.toml, missing/duplicate video masters, broken related-track references, and duplicate authored video display-order values without treating video as an audio track. The private web-video derivative uses one deterministic H.264 High 4.1/yuv420p + AAC-LC HLS rendition that fits within 1280×720 without upscaling, preserves source frame rate up to 60 fps, uses bounded CRF encoding with libx264, includes 192 kbps stereo AAC-LC when source audio is present, aligns keyframes to three-second fMP4 segments, and generates a PNG poster either from the authored seek time or by deterministic automatic thumbnail selection. Source/profile/presentation fingerprints make stream and poster freshness reproducible. A guarded backend plans and prepares this private video media through staging, HLS/decode validation, stale-plan rechecking, SHA-256 verification, atomic promotion, and rollback. Publish preflight reports video readiness separately, Prepare video media generates missing or stale private HLS + poster resources, and public-package contract v5 publishes ordered sanitized video.json, poster.png, and current segmented HLS resources; canonical video-master files, video.toml, and private stream-info.json remain excluded.",
      "Inspect missing, stale, current, or blocked private playback and waveform derivatives under Files & Sources. The private 320 kbps playback MP3 remains useful for local Library preview and easy private sharing, but it is not the website listening asset and is never copied into published-media.",
      "From Publish preflight, use Prepare release to generate or refresh reproducible Library derivatives: the private playback MP3, an AAC-LC HLS web stream with short fMP4 segments, waveform JSON, and—when the canonical release artwork is TIFF/TIF—a durable browser-compatible PNG plus a private generation sidecar. Stream and waveform generation start from canonical audio; browser artwork is generated from the canonical release artwork master without modifying it. Publish requires current HLS, waveform, and browser artwork resources; a missing private audio-playback.mp3 is reported separately and never blocks Publish or Update public package. Unsupported or missing canonical artwork still blocks publication and cannot be bypassed by preparation.",
    ],
    currentNote:
      "Metadata editing, release-to-track inheritance, controlled TOML saving, track-number-driven sidebar ordering, guarded track- and release-directory synchronization, readiness guidance, broad-format browser audio preview, reviewed HLS-stream/waveform preparation, and sanitized public-package publication are available. The Library release browser supports a persisted sort selector and icon-only Rows, Cards, and Tiles views: Release date · newest is the default sort and Cards is the default expanded release view; Rows distributes title, artist, details, and health horizontally like catalog columns, while Tiles is artwork-first. Metadata complete describes metadata-only readiness; Up to date is reserved for whole-release health/freshness when no current issues are reported. Prepare release stages derivatives in an isolated operation workspace, verifies the HLS playlist, initialization segment, referenced media segments, and waveform before promotion, rejects stale preflight state, backs up replacements, and records a manifest for rollback. Publish or Update public package separately stages the complete host-facing snapshot, verifies hashes and resource paths, journals each promotion phase, atomically replaces the public release and catalog, performs a post-promotion manifest/catalog integrity check, and rolls back if promotion fails. Interrupted publish operations are detected across server restarts and exposed for guarded recovery instead of being inferred from UI state.",
  },
  {
    id: "publish",
    title: "Publish",
    availability: "partial",
    summary:
      "Run consolidated preflight and build a sanitized public deployment snapshot from the private canonical release.",
    steps: [
      "Run the release-scoped Library validator, then review the exact Publish preflight for required metadata, numbering, dates, canonical audio/video, browser artwork, audio and video HLS web streams, waveforms, and public catalog destinations.",
      "Block publication when source files are missing or ambiguous, an audio or video HLS playlist or referenced segment is missing/unsafe, waveform data is stale, paths escape configured roots, or another required public resource cannot be resolved.",
      "Preview the exact player-facing package under published-media: sanitized release/track/video metadata, browser artwork, precomputed waveform data, per-track audio HLS, and per-video H.264/AAC HLS. Exclude masters, private playback MP3s, private stream-info sidecars, TOML source documents, ingest receipts, backups, production notes, and editor-only administration.",
      "Build in a temporary output directory, verify the completed snapshot, and atomically promote the public deployment.",
      "Record publish history and support later republish, withdrawal, and rollback without deleting the private canonical release.",
    ],
    currentNote:
      "The Publish tab starts with a compact release table: an optional batch-preparation selector followed by Release, Sources, Public media, and Status. Release date · newest is the default list order, with alternate release-date, title, artist, and Library-order sorting available from the table header. Each release row includes a release-artwork thumbnail and the whole row opens preflight; the separate action column is intentionally omitted. Preflight opens in a wide modal above the readiness table, closes with Escape, the upper-right ×, or the backdrop when no preparation/publish operation is running, and returns keyboard focus to the release row that opened it. After preflight, the default view is deliberately concise: one plain-language result, Audio stream, Video stream, Waveform, and Browser artwork readiness, and one clearly labeled next action—Resolve blockers, Prepare release, Prepare video media, Publish public package, or Update public package. Problems/warnings, the itemized package plan, and the technical contract/fingerprint remain collapsed until opened. Preflight itself is read-only. The main Publish workspace represents that mode with an amber Read-only preflight status beside Publishing guide instead of a permanent explanatory notice card. Refresh Library now lives in the application header on both Library and Publish, so the workspace card remains focused on publication actions; this guide retains the detailed behavior. The website package never exposes the canonical master. Prepare release generates AAC-LC HLS with roughly three-second fMP4 segments, independent waveform-peaks.json data, and a browser-compatible PNG when the canonical release artwork is TIFF/TIF; generated artwork records source/profile freshness in a private artwork-info.json sidecar and never modifies the archival master. The HLS playlist uses relative segment references so future private storage/CDN authorization can be added without cloud-provider coupling. Publish public package stages only sanitized release/track/video JSON metadata, browser-compatible release/track artwork, current waveform data, current audio HLS, and current H.264/AAC video HLS; it validates the complete staged tree and resource hashes before atomically promoting it under published-media and updating catalog.json. Republish uses the same operation as Update public package: the previous public release/catalog are backed up, the new snapshot replaces the release as a unit so obsolete files cannot survive, and a failed promotion rolls back. Publish records a stable content fingerprint in publication-manifest.json and compares it with the current canonical metadata/public-media inputs on later preflight runs. When they match, the UI reports Public package is up to date and removes the repeat publish action; a canonical metadata or public-media change changes that state to Update available. While Prepare release is running, Publish shows live server-reported progress for artwork, the active track, validation, and promotion without flooding the interface with per-track toasts. Successful Prepare and Publish/Update writes use the application's transient success toast while the persistent preflight state remains the source of truth. Publish Operations & Recovery v2 now journals each public-package write through staging, validation, release backup/promotion, catalog backup/promotion, verification, and completion. Operation records include a server-instance identity, so a non-terminal operation left by a prior server process is surfaced as Interrupted instead of being mistaken for a completed publish. Operation history can safely finalize an already-promoted package only after the manifest resources and catalog entry verify, or offer a guarded rollback only when attribution and backup evidence are sufficient; legacy or ambiguous operations require review. The release table also supports selecting multiple releases for sequential private derivative preparation; this queue may prepare MP3, audio/video HLS, waveform, and browser-artwork derivatives, but actual public publishing remains deliberate and release-scoped. The CLI commands publish:plan and preflight:publish remain read-only.",
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
    question: "How do I get back to the main workspaces from Workflow & Help?",
    answer:
      "Use the Hiplingo logo at the far left of the application header. It is the global home control and always returns to the Library landing workspace. The contextual Back to editor control inside Workflow & Help still returns to the workspace or release detail that opened Help.",
  },
  {
    question: "What does the Library Tiles tooltip show?",
    answer:
      "Rows and Cards keep their existing visible provenance and health information. Tiles keeps the album artwork clear at rest; hover a tile or move keyboard focus into it to reveal release title, artist, date, track/video counts, canonical Library and artwork source paths, and the same file-spec, technical-health, metadata-readiness, and Library-health badges used by the other Library views. While Tiles is active, the Library toolbar also shows a persisted Tile size slider so the artwork grid can be made denser or larger without changing Rows or Cards.",
  },
  {
    question: "What is the hover-over help pattern called?",
    answer:
      "It is a tooltip. Compact Ingest headings use native hover/focus title tooltips for short explanatory guidance so the workspace can stay dense. Metadata fields keep their dedicated ? help controls when richer field/tag guidance is needed.",
  },
  {
    question: "How can I sort Ingest source files?",
    answer:
      "Source files default to Name order. The compact Sort menu can instead group by Type or order by largest size, smallest size, or longest duration. Sorting is inspection-only and also defines the local preview-next order while the chosen sort is active.",
  },
  {
    question: "What do the color-coded Ingest readiness messages mean?",
    answer:
      "Ingest operational feedback now uses the same health/readiness language as the rest of the workflow: green Ready for verified conditions, amber Review for non-blocking attention, and red Blocked when the next operation cannot safely continue. This is not field provenance. Provenance remains reserved for Stored, Inherited, and Generated metadata values.",
  },
  {
    question: "Where did the global Metadata Reference menu card go?",
    answer:
      "The application and release hamburger menus no longer duplicate Metadata Reference. Use the contextual ? help controls beside the corresponding metadata/tag areas for field guidance and player/tag mapping references.",
  },
  {
    question: "Where does technical media health appear in the workflow?",
    answer:
      "Library release cards and Publish source summaries show compact Technical Ready, Review, or Blocked state from the shared read-only ffprobe audit. Open a Library release and expand Release health to inspect that release's canonical-master counts, audio codec/sample-rate/bit-depth/channel inventory, artwork dimensions/pixel formats, video codec/profile/dimensions/frame rate, and any technical issues. The Publish preflight dialog reuses the same per-release inspector. Technical Media Contract v1 remains advisory: accepted source masters are preserved, no automatic conversion is requested, and technical health does not enter Publish gating.",
  },
  {
    question: "How do I inspect technical media characteristics?",
    answer:
      "Run npm run audit:media-technical for a concise read-only ffprobe inventory of observed canonical-master characteristics. The default output aggregates codecs, sample rates, reported bit depths/sample formats, channels, artwork/video dimensions, pixel formats, video profiles, and frame rates, then reports per-release technical health based only on probeability, expected streams/dimensions, and intra-release audio consistency. A zero bits-per-sample value reported by compressed codecs means bit depth is not meaningfully reported and is treated as unknown rather than literal 0-bit audio. Use -- --release RELEASE_ID to scope one release, --releases to list every release summary, --verbose for file-level listings, --concurrency N to control 1-8 probe workers, or --json for structured output. It does not transcode files, grade sample rate/bit depth/resolution/codec quality, or change Publish gating.",
  },
  {
    question: "Where did the Refresh controls move?",
    answer:
      "Refresh is now a contextual application-header command instead of a workspace-local or application-menu card. Ingest shows Refresh Ingest, Staging shows Refresh inputs and refreshes both the ingest drop and canonical Library scans used by that workspace, and Library/Publish show Refresh Library. The application hamburger no longer duplicates scan refresh controls. Release-detail metadata refresh remains separate because it refreshes the currently open canonical metadata detail rather than a workspace scan.",
  },
  {
    question: "Why is audit:file-spec shorter now?",
    answer:
      "The default media-file-spec audit is intentionally concise: it prints release-wide and role-wide conformance, an extension inventory, then only true issues such as outside-spec formats or non-canonical master filenames. Use --compatible to list compatibility masters when reviewing historical/source-preservation formats, --verbose to list every canonical master, --release RELEASE_ID to scope the audit, or --json for the complete machine-readable result. Compatible remains accepted source material; it is not an automatic conversion request or publish blocker.",
  },
  {
    question: "Where can I see release-level file-spec conformance?",
    answer:
      "Staging, Library release cards, and Publish source summaries now show the same release-level file-spec badge. Preferred means every visible canonical media master uses the preferred format set and canonical role filename. Compatible means one or more masters are accepted source-preserving formats outside the preferred archival set. Name review means a visible master needs canonical filename review. Outside spec means an audited master extension is not accepted. These badges are advisory and do not silently transcode or rename canonical media; existing validation and Publish preflight remain authoritative for write safety.",
  },
  {
    question: "How do I audit the canonical Library against the media file spec?",
    answer:
      "Run npm run audit:file-spec for a read-only audit of canonical artwork-master, audio-master, and video-master files under media-library/releases. The default report stays concise by showing conformance totals, an extension inventory, and only true issue files. Add -- --compatible to inspect compatibility masters, -- --verbose for every master, -- --release RELEASE_ID for one release, or -- --json for machine-readable output. The audit never renames, transcodes, deletes, or rewrites media.",
  },
  {
    question: "How are canonical master filenames formed?",
    answer:
      "Canonical media filenames use the stable role basename plus the normalized source extension: artwork-master.<ext>, audio-master.<ext>, and video-master.<ext>. Staging preserves the original master bytes and container type, so a WAV source becomes audio-master.wav and an M4A source becomes audio-master.m4a. This naming rule is independent from semantic metadata filenames such as release.toml, track.toml, and video.toml.",
  },
  {
    question: "What do Preferred, Compatible, and metadata badges mean in Ingest?",
    answer:
      "The Source files table now surfaces the file spec without adding another column. Preferred means the source extension is in the current happy-path master set for that media role. Compatible means the scanner accepts the format but it is outside the preferred set; Staging still preserves the original source bytes/container rather than silently transcoding the archival master. Sidecar identifies recognized parsed metadata evidence such as FFmetadata. Candidate metadata identifies documented future evidence formats such as JSON or TXT that are not yet promoted to parsed sidecars. These badges are guidance, not provenance and not automatic conversion instructions.",
  },
  {
    question: "What does the current happy-path file spec mean?",
    answer:
      "The file spec now separates preferred happy-path formats from broader accepted compatibility formats and from canonical Library naming. Canonical authored metadata remains semantic TOML documents such as release.toml, track.toml, and video.toml. Recognized FFmetadata sidecars (.ffmeta/.ffmetadata) are ingest evidence; JSON and TXT are documented candidate evidence formats but are not yet promoted to recognized metadata sidecars. Preferred artwork masters are lossless TIF/TIFF or PNG; JPG/JPEG remains accepted when it is the authoritative source but is treated as compatibility input. Preferred audio masters are lossless WAV, FLAC, and AIF/AIFF; M4A, MP3, AAC, and the broader recognized set remain accepted source-preserving compatibility inputs. Preferred video master containers remain MOV, MP4, MXF, and MKV for now; container extension alone is not treated as a video quality grade. The scanner continues accepting its broader compatibility set, so this milestone does not reject formats that already worked. Canonical media keeps the stable role basename artwork-master, audio-master, or video-master and preserves the source container extension rather than transcoding the archival master during Staging.",
  },
  {
    question: "Where do artwork creator names and roles go?",
    answer:
      "Use Artwork Credits for the people or organizations responsible for an image. Enter one credit statement per line and include the role with the name, such as Artwork by Jane Doe, Photography by Alex Smith, Design by Example Studio, Art direction by Jane Doe, or Artwork prompt by Jane Doe. Artwork Description explains what the image is; Artwork Role explains how the image is used; Artwork Copyright records artwork-specific ownership. Do not put a creator name in the artwork ID.",
  },
  {
    question: "How do I add a new asset to a release that is already in the Library?",
    answer:
      "Inspect the new source candidate normally, then use Target release before Continue to Staging. Auto selects an existing Library release only when title and artist produce one exact unambiguous match. Choose Existing Library release to select the canonical destination manually when the ingest folder or filename differs from the Library release, or choose New release to force creation. The selected existing release ID, title, artist, date, and type become the authoritative Staging destination while candidate identity remains evidence. Existing tracks, videos, and artwork that are absent from the new candidate remain preserved unless a separate reviewed replacement/removal workflow says otherwise.",
  },
  {
    question: "How are video sources staged into the private Library?",
    answer:
      "Ingest uses ffprobe to verify real video streams, then Staging → Videos lets you review inclusion, title, a flexible descriptive type, and an optional related track. Stable video IDs are generated automatically rather than requiring routine manual entry; source and destination cells stay compact while exposing their full paths on hover or disclosure. Included source bytes are copied unchanged to videos/<stable-id>/video-master.<original-extension> and a sibling video.toml records canonical identity, initial display order, and the optional track relationship. The video remains release-scoped even when related to a track, and an existing-release update can relate a newly arriving video directly to an already-canonical Library track even when that track has no source file in the current ingest candidate. Existing verified Library videos omitted from a later ingest candidate are preserved automatically. The Library scanner recognizes those canonical video directories, orders videos by authored display_order, and exposes prepared poster thumbnails when available. Browser-direct MP4, M4V, MOV, and WebM masters can be previewed read-only from the Library without generating a derivative; codec support still depends on the browser. Edit metadata updates canonical video title, flexible type, description, date, location, director, camera operator, display order, optional poster_time_seconds, and optional related-track relationship in video.toml using a SHA-256 concurrency check, timestamped backup, validated temporary write, and atomic replacement. Stable video ID and canonical master path stay read-only because identity/master replacement requires a separate reviewed workflow. The H.264/AAC HLS backend generates a PNG poster inside the private `videos/<stable-id>/stream/` derivative: blank poster time keeps deterministic automatic thumbnail selection, while an authored non-negative time seeks to that frame. Poster selection participates in derivative freshness and the prepared poster has a private read-only Library preview endpoint. Publish preflight includes video readiness, offers a dedicated Prepare video media step when required, and contract v5 packages ordered sanitized `videos/<stable-id>/video.json`, `stream/poster.png`, and current HLS playlist/init/segments without exposing canonical video masters or private preparation sidecars. Live preview transcoding, canonical-video replacement, and player-side video presentation remain later milestones.",
  },
  {
    question: "Can I add an old metadata sidecar after a release is already in the Library?",
    answer:
      "Yes. Recognized FFmetadata files are treated as reusable evidence rather than one-time creation inputs. A sidecar can arrive with the original audio, be attached later, or be staged by itself against an existing release ID. Metadata-editor pairs it using the encoded audio filename when available, then track number/title hints, and compares mapped values against the current Staging draft or the relevant canonical Library TOML values when the release already exists. Matching values, differences, alias conflicts, and currently unmapped tags remain visible. Sidecar evidence never silently overwrites authored Library metadata; reviewed canonical sidecar-to-Library application can evolve independently from the parser/comparison layer.",
  },
  {
    question: "How does Tab navigation work while editing metadata?",
    answer:
      "While editing metadata, Tab and Shift+Tab move through data-entry controls without stopping on the small inline help (?) or remove (×/−) utility icons. Those icons remain clickable with the pointer. Dialog controls and ordinary action buttons keep their normal keyboard focus order.",
  },
  {
    question: "Why does Staging show information before I run Preflight?",
    answer:
      "Normal Staging behavior is informational, not a warning. The collapsed Staging behavior section explains that source audio is copied byte-for-byte without rewriting embedded metadata, canonical audio is stored as audio-master with its original container extension, and playback derivatives are prepared later. Library playback MP3s and website HLS streams are separate derivatives. Genuine warnings remain visible only when something deserves review before the staging operation.",
  },
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
    question: "What does the footer show?",
    answer:
      "The footer is intentionally minimal. Its left side reports only the total on-disk size of the private media-library and generated published-media trees. Workflow & Help and Metadata Tag Info remain direct footer links on the right.",
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
      "For track directories using artist_number_title, saving numbering metadata does not move folders. Library then loads the server's exact dry-run plan, shows every rename or blocked item, and requires the displayed confirmation phrase before applying it. The apply request includes the reviewed plan fingerprint, so any intervening release change forces a fresh review. The server writes an operation manifest, blocks duplicate numbers and existing targets, uses temporary names for swaps, updates track.id and track_reference.track_id in the track TOMLs, synchronizes the current operational track IDs and destination paths in ingest-receipt.json while preserving historical copy receipts and update records, backs up that receipt with the TOMLs, and rolls completed steps back if a later step fails. Custom directory IDs that do not use the numbered convention are never guessed or renamed automatically. For a release renumbered before receipt synchronization existed, the explicit repair CLI matches each historical receipt track to the current canonical Library track by the recorded audio-master byte size and SHA-256 rather than by a potentially stale track number. Missing or duplicate-content matches block the repair. A successful repair synchronizes the current receipt track ID, destination path, and authored number, then verifies every recorded current destination; historical copy receipts and prior update records remain unchanged.",
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
      "Use Publish → Publish public package after preflight passes and web derivatives are current. The writer copies only the reviewed player-facing resources into a staged snapshot, validates them, and atomically promotes the result; it never moves the canonical release. Later metadata, artwork, or revised-master changes remain authored in media-library and are republished with Update public package.",
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
      "A publish derivative may be stale when the canonical audio source changed, the HLS or waveform generation profile changed, the playlist or referenced stream segments are incomplete, or waveform data no longer matches its active analysis profile. Private audio-playback.mp3 freshness is tracked separately for local Library playback/private sharing and is not a website-package requirement. Publish preflight does not count a missing or stale private MP3 as a public-package warning; when HLS and waveform are already current, use Prepare Library MP3s as an optional maintenance action. Treat the private Library playback MP3 as a convenience/share derivative, not as a future paid-download product. A later commerce workflow can define an explicit download derivative and authenticated delivery without changing the segmented website-listening contract.",
  },
  {
    question: "Which file should be used to generate a waveform?",
    answer:
      "Generate waveforms from the canonical audio source directly. Prefer a lossless master when one exists, but an MP3- or M4A-only canonical source is valid: FFmpeg decodes that source to temporary PCM for the same waveform analyzer. Never use audio-playback.mp3 as an intermediate when a distinct canonical master exists.",
  },
  {
    question: "Where do files live during each workflow stage?",
    answer:
      "Hover over any workflow tab to see its configured runtime path and purpose. Ingest reads the disposable source drop without modifying it. After a reviewed build succeeds, that ingest candidate can be deleted. Staging creates or updates releases directly in the private canonical media-library root, and Library authors that same long-term source of truth. Publish preflight may prepare reproducible stream/index.m3u8 + fMP4 segment assets and waveform-peaks.json inside that private release after explicit review. Publish or Update public package then creates the sanitized snapshot in the configured published-media root from current metadata, browser artwork, waveforms, and HLS resources. Canonical masters, TOML, ingest receipts, stream-info.json, private playback MP3s, production notes, and editor-only sample-clearance administration are never copied into the public release.",
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
