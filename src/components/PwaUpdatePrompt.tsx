import { useEffect, useRef } from "react";
import { loadPwaRegistration } from "@/lib/PwaRegistration";
import { toaster } from "@/app/Toaster";

const UPDATE_TOAST_ID = "pwa-update-available";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export function PwaUpdatePrompt() {
  const hasPromptedRef = useRef(false);
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    const activateWaitingUpdate = () => {
      const updateServiceWorker = updateServiceWorkerRef.current;

      if (!updateServiceWorker) {
        return;
      }

      void updateServiceWorker(true).catch((error) => {
        console.error("PWA update activation failed:", error);
      });
    };

    const showUpdatePrompt = () => {
      if (hasPromptedRef.current) {
        return;
      }

      hasPromptedRef.current = true;

      toaster.create({
        id: UPDATE_TOAST_ID,
        title: "Update available",
        duration: Number.POSITIVE_INFINITY,
        closable: false,
        action: {
          label: "Update",
          onClick: activateWaitingUpdate,
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
      toaster.remove(UPDATE_TOAST_ID);
    };
  }, []);

  return null;
}
