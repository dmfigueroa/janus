"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { loadPwaRegistration } from "@/lib/pwa-registration";

const UPDATE_TOAST_ID = "pwa-update-available";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export function PwaUpdatePrompt() {
  const hasPromptedRef = useRef(false);
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    const showUpdatePrompt = () => {
      if (hasPromptedRef.current) {
        return;
      }

      hasPromptedRef.current = true;

      toast("Update available", {
        id: UPDATE_TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        dismissible: false,
        action: {
          label: "Update",
          onClick: () => {
            toast.dismiss(UPDATE_TOAST_ID);
            void updateServiceWorkerRef.current?.(true);
          },
        },
      });
    };

    void loadPwaRegistration()
      .then(({ registerSW }) => {
        updateServiceWorkerRef.current = registerSW({
          onNeedRefresh: showUpdatePrompt,
          onRegisteredSW(_swScriptUrl, registration) {
            if (!registration) {
              return;
            }

            if (registration.waiting) {
              showUpdatePrompt();
            }

            void registration.update().catch((error) => {
              console.error("PWA startup update check failed:", error);
            });
          },
          onRegisterError(error) {
            console.error("PWA worker registration failed:", error);
          },
        });
      })
      .catch((error) => {
        console.error("PWA registration bootstrap failed:", error);
      });

    return () => {
      toast.dismiss(UPDATE_TOAST_ID);
    };
  }, []);

  return null;
}
