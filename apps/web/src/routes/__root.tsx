import { Toaster } from "@rhemify-monorepo/ui/components/sonner";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouteContext } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { FleetProvider } from "@/lib/convex";

import appCss from "../index.css?url";

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Rhemify — The payment layer for agent companies" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap",
      },
    ],
  }),

  component: RootDocument,
  beforeLoad: async (ctx) => {
    const token = await getAuth();
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }
    return {
      isAuthenticated: !!token,
      token,
    };
  },
});

function RootDocument() {
  const context = useRouteContext({ from: Route.id });
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body>
          <ThemeProvider>
            <FleetProvider>
              <Outlet />
            </FleetProvider>
          </ThemeProvider>
          <Toaster richColors />
          <Scripts />
        </body>
      </html>
    </ConvexBetterAuthProvider>
  );
}
