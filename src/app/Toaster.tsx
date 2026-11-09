import { Toaster as ChakraToaster, Toast, createToaster } from "@chakra-ui/react";

type ToastMessage = Parameters<
  NonNullable<React.ComponentProps<typeof ChakraToaster>["children"]>
>[0];

export const toaster = createToaster({});

export function Toaster() {
  return <ChakraToaster toaster={toaster}>{ToastMessage}</ChakraToaster>;
}

function ToastMessage(toast: ToastMessage) {
  return (
    <Toast.Root key={toast.id}>
      <Toast.Indicator />
      <Toast.Title>{toast.title}</Toast.Title>
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
