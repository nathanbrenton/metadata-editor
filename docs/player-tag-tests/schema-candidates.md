# Player Metadata Schema Candidates

The controlled VLC and Apple Music fixtures exposed two useful fields
that do not currently have canonical TOML paths.

## Grouping

Apple Music displayed the M4A `grouping` value, but the current release
and track templates do not define a grouping field.

Candidate location:

- `track.grouping`

Do not add the field until its intended semantics and inheritance rules
are decided.

## Encoded by

VLC and Apple Music both expose encoding-related labels, but their
values were container-dependent and frequently came from FFmpeg's
muxer or codec identity rather than the requested `encoded_by` tag.

This should probably remain generated technical metadata rather than a
manually authored canonical field.

Potential generated locations:

- `track-analysis.json`
- a future technical-provenance record

No canonical TOML field has been added.
