import { createServer } from "node:http";
import { listPublishOperations } from "./publish-operations.js";
import { resolvePublishRoot } from "./workflow-locations.js";
import {
  host,
  port,
  sendJson,
} from "./api/support.js";
import { handleSystemRoutes } from "./api/system-routes.js";
import { handleIngestRoutes } from "./api/ingest-routes.js";
import { handleLibraryMediaRoutes } from "./api/library-media-routes.js";
import { handleLibraryMetadataRoutes } from "./api/library-metadata-routes.js";
import { handlePublishRoutes } from "./api/publish-routes.js";
import { routeNotHandled } from "./api/route-result.js";

/*
 * Endpoints live in server/api/*-routes.ts, grouped by workspace. Routes
 * match on exact method + pathname, so module order does not affect which
 * handler answers a request.
 */
const routeModules = [
  handleSystemRoutes,
  handleIngestRoutes,
  handleLibraryMediaRoutes,
  handleLibraryMetadataRoutes,
  handlePublishRoutes,
];

const server = createServer(
  async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${host}:${port}`,
    );

    for (const handleRoutes of routeModules) {
      if (
        (await handleRoutes(request, response, requestUrl)) !==
        routeNotHandled
      ) {
        return;
      }
    }

    sendJson(response, 404, {
      error: "Not found",
    });
  },
);

server.listen(port, host, () => {
  console.log(
    `Metadata filesystem API listening at http://${host}:${port}`,
  );

  void resolvePublishRoot()
    .then((publishRoot) =>
      listPublishOperations(
        publishRoot,
        { limit: 200 },
      ),
    )
    .then((history) => {
      if (history.interruptedCount > 0) {
        console.warn(
          `Publish recovery: ${history.interruptedCount} interrupted operation${history.interruptedCount === 1 ? "" : "s"} detected from a previous server instance. Review Publish > Operation history.`,
        );
      }
    })
    .catch((error) => {
      console.warn(
        "Unable to inspect publish-operation history at startup:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    });
});
