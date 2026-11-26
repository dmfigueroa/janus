import { useEffect } from "react";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { pwaInfo } from "virtual:pwa-info";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installForegroundRevalidation } from "@/app/ForegroundRevalidation";
import { BottomNav } from "@/components/BottomNav";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

import { NotFound } from "@/components/NotFound";
import { RouteError } from "@/components/RouteError";
import { Provider } from "@/app/Provider";
import { Toaster as ChakraToaster } from "@/app/Toaster";

function getManifestCrossOrigin(useCredentials: boolean) {
  if (useCredentials) return "use-credentials" as const;
  return undefined;
}

function getManifestLinks(manifest: NonNullable<typeof pwaInfo>["webManifest"] | undefined) {
  if (!manifest) return [];
  return [
    {
      rel: "manifest" as const,
      href: manifest.href,
      crossOrigin: getManifestCrossOrigin(manifest.useCredentials),
    },
  ];
}

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
        href: "/janus-logo.png",
      },
      ...getManifestLinks(pwaInfo?.webManifest),
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = router.options.context.queryClient;

  useEffect(() => installForegroundRevalidation(), []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Provider>
          <QueryClientProvider client={queryClient}>
            <PwaUpdatePrompt />
            {children}
            <ChakraToaster />
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
        </Provider>
        <Scripts />
      </body>
    </html>
  );
}
