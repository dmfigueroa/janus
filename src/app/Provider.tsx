import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import { janusSystem } from "./Theme";

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={janusSystem}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </ChakraProvider>
  );
}
