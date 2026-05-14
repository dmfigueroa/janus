import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { pwaInfo } from "virtual:pwa-info";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

import appCss from "../styles.css?url";

import { ThemeProvider } from "next-themes";
import { NotFound } from "@/components/NotFound";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
        title: "Janus",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/janus-logo-dark.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        rel: "icon",
        href: "/janus-logo-light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      ...(pwaInfo?.webManifest
        ? [
            {
              rel: "manifest" as const,
              href: pwaInfo.webManifest.href,
              crossOrigin: pwaInfo.webManifest.useCredentials
                ? ("use-credentials" as const)
                : undefined,
            },
          ]
        : []),
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter(); // Get router instance to access context
  const queryClient = router.options.context.queryClient;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider client={queryClient}>
            <PwaUpdatePrompt />
            {children}
            <Toaster />
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
            <BottomNav />
          </QueryClientProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
