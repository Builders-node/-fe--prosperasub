const path = require("node:path");

/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  viteFinal: async (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve || {};
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias || {}),
      "@": path.resolve(__dirname, "../src"),
    };
    return viteConfig;
  },
};

module.exports = config;
