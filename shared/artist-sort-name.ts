export type GeneratedArtistSortName = {
  value: string;
  movedLeadingArticle: boolean;
};

/*
 * Only move the unambiguous English leading article. Personal names, stage
 * names, group names, and culturally ordered names are otherwise preserved.
 */
export function generateArtistSortName(
  artistName: string,
): GeneratedArtistSortName {
  const normalizedName = artistName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalizedName) {
    return {
      value: "",
      movedLeadingArticle: false,
    };
  }

  const leadingArticleMatch =
    normalizedName.match(/^the\s+(.+)$/i);
  const remainder =
    leadingArticleMatch?.[1]?.trim() ?? "";

  if (!remainder) {
    return {
      value: normalizedName,
      movedLeadingArticle: false,
    };
  }

  return {
    value: `${remainder}, The`,
    movedLeadingArticle: true,
  };
}
