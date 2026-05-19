import type { Preview } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "../src/contexts/AuthContext";
import { LanguageProvider } from "../src/i18n";
import "../src/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
    },
  },
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <LanguageProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <div className="min-h-screen bg-background p-6 text-foreground">
                  <Story />
                </div>
              </BrowserRouter>
            </QueryClientProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    ),
  ],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "hsl(var(--background))" },
        { name: "surface", value: "hsl(var(--card))" },
      ],
    },
    layout: "fullscreen",
  },
};

export default preview;
