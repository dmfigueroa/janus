import { useEffect } from "react";
import { loadPwaRegistration } from "@/lib/PwaRegistration";
import { toaster } from "@/app/Toaster";

const UPDATE_TOAST_ID = "pwa-update-available";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

function logIfActive(isIgnored: () => boolean, message: string, error: unknown) {
  if (!isIgnored()) {
    console.error(message, error);
  }
}

function requestRegistrationUpdate(
  registration: ServiceWorkerRegistration,
  isIgnored: () => boolean,
) {
  void registration.update().catch((error) => {
    logIfActive(isIgnored, "PWA startup update check failed:", error);
  });
}

function promptIfWaiting(registration: ServiceWorkerRegistration, showUpdatePrompt: () => void) {
  if (registration.waiting) {
    showUpdatePrompt();
  }
}

function activateServiceWorkerUpdate(
  getUpdateServiceWorker: () => UpdateServiceWorker | null,
  isIgnored: () => boolean,
) {
  const updateServiceWorker = getUpdateServiceWorker();
  if (isIgnored() || !updateServiceWorker) {
    return;
  }

  void updateServiceWorker(true).catch((error) => {
    logIfActive(isIgnored, "PWA update activation failed:", error);
  });
}

function createUpdateToast(onActivate: () => void) {
  toaster.create({
    id: UPDATE_TOAST_ID,
    title: "Update available",
    duration: Number.POSITIVE_INFINITY,
    closable: false,
    action: {
      label: "Update",
      onClick: onActivate,
    },
  });
}

export function PwaUpdatePrompt() {
  useEffect(() => {
    let ignore = false;
    let hasPrompted = false;
    let updateServiceWorker: UpdateServiceWorker | null = null;
    const isIgnored = () => ignore;

    const showUpdatePrompt = () => {
      if (ignore || hasPrompted) {
        return;
      }

      hasPrompted = true;
      createUpdateToast(() => activateServiceWorkerUpdate(() => updateServiceWorker, isIgnored));
    };

    const handleRegistered = (
      _serviceWorkerScriptUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => {
      if (ignore || !registration) {
        return;
      }

      promptIfWaiting(registration, showUpdatePrompt);
      requestRegistrationUpdate(registration, isIgnored);
    };

    void loadPwaRegistration()
      .then(({ registerSW }) => {
        if (ignore) {
          return;
        }

        updateServiceWorker = registerSW({
          onNeedRefresh: showUpdatePrompt,
          onRegisteredSW: handleRegistered,
          onRegisterError: (error) => {
            logIfActive(isIgnored, "PWA worker registration failed:", error);
          },
        });
      })
      .catch((error) => {
        logIfActive(isIgnored, "PWA registration bootstrap failed:", error);
      });

    return () => {
      ignore = true;
      updateServiceWorker = null;
      toaster.remove(UPDATE_TOAST_ID);
    };
  }, []);

  return null;
}
