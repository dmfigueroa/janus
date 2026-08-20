import { Toaster as ChakraToaster, Toast, createToaster } from "@chakra-ui/react";

type ToastMessage = Parameters<
  NonNullable<React.ComponentProps<typeof ChakraToaster>["children"]>
>[0];

export const toaster = createToaster({
  placement: "bottom-end",
  offsets: {
    bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 1rem)",
    right: "1rem",
    left: "1rem",
    top: "1rem",
  },
  pauseOnPageIdle: true,
});

export function Toaster() {
  return (
    <ChakraToaster toaster={toaster} width={{ base: "calc(100vw - 2rem)", md: "24rem" }}>
      {ToastMessage}
    </ChakraToaster>
  );
}

function ToastMessage(toast: ToastMessage) {
  return (
    <Toast.Root key={toast.id} data-toast-id={toast.id}>
      <Toast.Indicator />
      <Toast.Title flex="1" minW="0">
        {toast.title}
      </Toast.Title>
      <Toast.Description>{toast.description}</Toast.Description>
      <ToastAction action={toast.action} />
      <ToastClose closable={toast.closable === true} />
    </Toast.Root>
  );
}

function ToastAction({ action }: { action: ToastMessage["action"] }) {
  if (!action) {
    return null;
  }

  return <Toast.ActionTrigger>{action.label}</Toast.ActionTrigger>;
}

function ToastClose({ closable }: { closable: boolean }) {
  if (!closable) {
    return null;
  }

  return <Toast.CloseTrigger />;
}
