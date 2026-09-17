const path = require("node:path");

const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "online.kfcguild.wow-trader-companion",
    appCategoryType: "public.app-category.utilities",
    executableName: "wow-trader-companion",
    extendInfo: {
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    },
    extraResource: [
      path.resolve(__dirname, "dist-utility"),
      path.resolve(__dirname, "../addon/WowTraderCollector"),
      path.resolve(__dirname, "resources/addon-manifest.json"),
    ],
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-dmg", platforms: ["darwin"] },
    { name: "@electron-forge/maker-squirrel", platforms: ["win32"] },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        port: 39100,
        loggerPort: 39101,
        mainConfig: "./webpack.main.config.cjs",
        renderer: {
          config: "./webpack.renderer.config.cjs",
          entryPoints: [
            {
              html: "./src/renderer/index.html",
              js: "./src/renderer/index.tsx",
              name: "main_window",
              preload: { js: "./src/preload/index.ts" },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};
