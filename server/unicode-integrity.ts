import { TextDecoder } from "node:util";

const UTF8_BOM = Buffer.from([
  0xef,
  0xbb,
  0xbf,
]);

export function hasUtf8Bom(
  bytes: Uint8Array,
): boolean {
  return (
    bytes.byteLength >= UTF8_BOM.byteLength &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  );
}

export function decodeUtf8Strict(
  bytes: Uint8Array,
  options: {
    allowBom?: boolean;
    context?: string;
  } = {},
): string {
  const context =
    options.context ?? "Text content";
  const bomPresent = hasUtf8Bom(bytes);

  if (bomPresent && !options.allowBom) {
    throw new Error(
      `${context} must be UTF-8 without a BOM.`,
    );
  }

  const payload = bomPresent
    ? bytes.subarray(UTF8_BOM.byteLength)
    : bytes;

  try {
    return new TextDecoder("utf-8", {
      fatal: true,
    }).decode(payload);
  } catch {
    throw new Error(
      `${context} is not valid UTF-8.`,
    );
  }
}

export function encodeUtf8WithoutBom(
  value: string,
  context = "Text content",
): Buffer {
  if (value.startsWith("\uFEFF")) {
    throw new Error(
      `${context} must not begin with a Unicode BOM character.`,
    );
  }

  const bytes = Buffer.from(value, "utf8");

  if (hasUtf8Bom(bytes)) {
    throw new Error(
      `${context} must be UTF-8 without a BOM.`,
    );
  }

  return bytes;
}
