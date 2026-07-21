import assert from "node:assert/strict";
import test from "node:test";

import {
  generateArtistSortName,
} from "../shared/artist-sort-name.js";
import {
  deriveArtistSortNameChanges,
} from "../src/artist-sort-name.js";

test(
  "keeps an artist name unchanged when it has no leading The",
  () => {
    assert.deepEqual(
      generateArtistSortName(
        "Crazy Eights",
      ),
      {
        value: "Crazy Eights",
        movedLeadingArticle: false,
      },
    );
  },
);

test(
  "moves a leading The to the end for sorting",
  () => {
    assert.deepEqual(
      generateArtistSortName(
        "The Crazy Eights",
      ),
      {
        value: "Crazy Eights, The",
        movedLeadingArticle: true,
      },
    );

    assert.deepEqual(
      generateArtistSortName(
        "  the   Example Band  ",
      ),
      {
        value: "Example Band, The",
        movedLeadingArticle: true,
      },
    );
  },
);

test(
  "does not reverse personal names or words that merely begin with the letters the",
  () => {
    assert.equal(
      generateArtistSortName(
        "Nathan Brenton",
      ).value,
      "Nathan Brenton",
    );
    assert.equal(
      generateArtistSortName(
        "There Will Be Drums",
      ).value,
      "There Will Be Drums",
    );
  },
);

test(
  "creates and synchronizes a generated release artist sort name",
  () => {
    const existing = new Map([
      [
        "release.primary_artist.name",
        "Crazy Eights",
      ],
      [
        "release.primary_artist.sort_name",
        "",
      ],
    ]);

    assert.deepEqual(
      deriveArtistSortNameChanges(
        existing,
        [],
        {
          scope: "release",
          filename: "release.toml",
        },
      ),
      [
        {
          path:
            "release.primary_artist.sort_name",
          value: "Crazy Eights",
        },
      ],
    );

    assert.deepEqual(
      deriveArtistSortNameChanges(
        new Map([
          [
            "release.primary_artist.name",
            "The Example Band",
          ],
          [
            "release.primary_artist.sort_name",
            "Example Band, The",
          ],
        ]),
        [
          {
            path:
              "release.primary_artist.name",
            value: "The New Band",
          },
        ],
        {
          scope: "release",
          filename: "release.toml",
        },
      ),
      [
        {
          path:
            "release.primary_artist.sort_name",
          value: "New Band, The",
        },
      ],
    );
  },
);

test(
  "preserves an explicitly authored artist sort name",
  () => {
    assert.deepEqual(
      deriveArtistSortNameChanges(
        new Map([
          [
            "release.primary_artist.name",
            "Crazy Eights",
          ],
          [
            "release.primary_artist.sort_name",
            "Eights, Crazy",
          ],
        ]),
        [
          {
            path:
              "release.primary_artist.name",
            value: "The Crazy Eights",
          },
        ],
        {
          scope: "release",
          filename: "release.toml",
        },
      ),
      [],
    );
  },
);

test(
  "keeps matching track artist sort fields blank for release inheritance",
  () => {
    assert.deepEqual(
      deriveArtistSortNameChanges(
        new Map([
          [
            "track.primary_artist.name",
            "The Crazy Eights",
          ],
          [
            "track.primary_artist.sort_name",
            "Crazy Eights, The",
          ],
          [
            "track.album_artists[0].name",
            "The Crazy Eights",
          ],
          [
            "track.album_artists[0].sort_name",
            "Crazy Eights, The",
          ],
        ]),
        [],
        {
          scope: "track",
          filename: "track-credits.toml",
          releaseArtistName:
            "The Crazy Eights",
        },
      ),
      [
        {
          path:
            "track.primary_artist.sort_name",
          value: "",
        },
        {
          path:
            "track.album_artists[0].sort_name",
          value: "",
        },
      ],
    );
  },
);

test(
  "generates local track sort names for artists that differ from the release artist",
  () => {
    assert.deepEqual(
      deriveArtistSortNameChanges(
        new Map([
          [
            "track.primary_artist.name",
            "The Blast",
          ],
          [
            "track.primary_artist.sort_name",
            "",
          ],
          [
            "track.album_artists[0].name",
            "The Guests",
          ],
          [
            "track.album_artists[0].sort_name",
            "",
          ],
        ]),
        [],
        {
          scope: "track",
          filename: "track-credits.toml",
          releaseArtistName:
            "Crazy Eights",
        },
      ),
      [
        {
          path:
            "track.primary_artist.sort_name",
          value: "Blast, The",
        },
        {
          path:
            "track.album_artists[0].sort_name",
          value: "Guests, The",
        },
      ],
    );
  },
);
