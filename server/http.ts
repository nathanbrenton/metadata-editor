import type {
  IncomingMessage,
} from "node:http";

const maximumBodyBytes = 16_384;

export async function readJsonBody(
  request: IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    receivedBytes += buffer.length;

    if (receivedBytes > maximumBodyBytes) {
      throw new Error(
        "Request body exceeds size limit",
      );
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(
    Buffer.concat(chunks).toString("utf8"),
  ) as unknown;
}
