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
    <Toast.Root
      key={toast.id}
      width="fit-content"
      alignItems="center"
      gap="4"
      css={{ "&[data-type=success]": { bg: "bg.surface", color: "fg.default" } }}
    >
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

  return (
    <Toast.ActionTrigger bg="accent.solid" color="accent.contrast" _hover={{ bg: "pink.600" }}>
      {action.label}
    </Toast.ActionTrigger>
  );
}

function ToastClose({ closable }: { closable: boolean }) {
  if (!closable) {
    return null;
  }

  return <Toast.CloseTrigger />;
}
