import { env } from "@rhemify-monorepo/env/server";
import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({
    convexUrl: env.CONVEX_URL,
    convexSiteUrl: env.CONVEX_SITE_URL,
  });
