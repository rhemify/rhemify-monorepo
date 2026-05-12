/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as aggregates from "../aggregates.js";
import type * as anchors from "../anchors.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dwallets from "../dwallets.js";
import type * as events from "../events.js";
import type * as fleet from "../fleet.js";
import type * as fleets from "../fleets.js";
import type * as http from "../http.js";
import type * as intelligence from "../intelligence.js";
import type * as policies from "../policies.js";
import type * as seed from "../seed.js";
import type * as signingRequests from "../signingRequests.js";
import type * as traces from "../traces.js";
import type * as transactions from "../transactions.js";
import type * as vendors from "../vendors.js";
import type * as walletBalances from "../walletBalances.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  aggregates: typeof aggregates;
  anchors: typeof anchors;
  auth: typeof auth;
  crons: typeof crons;
  dwallets: typeof dwallets;
  events: typeof events;
  fleet: typeof fleet;
  fleets: typeof fleets;
  http: typeof http;
  intelligence: typeof intelligence;
  policies: typeof policies;
  seed: typeof seed;
  signingRequests: typeof signingRequests;
  traces: typeof traces;
  transactions: typeof transactions;
  vendors: typeof vendors;
  walletBalances: typeof walletBalances;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
