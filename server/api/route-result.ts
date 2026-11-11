/*
 * Returned by a route module when none of its endpoints matched, so the
 * dispatcher in server/index.ts can try the next module.
 */
export const routeNotHandled: unique symbol = Symbol(
  "route-not-handled",
);
