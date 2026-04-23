import { Toaster } from "@rhemify-monorepo/ui/components/sonner";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { ConvexClientProvider } from "@/lib/convex";

import appCss from "../index.css?url";

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Rhemify — The payment layer for agent companies",
      },
      {
        name: "description",
        content:
          "Deploy autonomous agents that pay for tools, manage budgets, and delegate — all on your card.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexClientProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <Outlet />
            </ThemeProvider>
          </QueryClientProvider>
        </ConvexClientProvider>
        <Toaster richColors />
        <Scripts />
      </body>
    </html>
  );
}
