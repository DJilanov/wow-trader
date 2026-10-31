const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const exec = promisify(execFile);

const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "online.kfcguild.wow-trader-companion",
    appCategoryType: "public.app-category.utilities",
    executableName: "wow-trader-companion",
    icon: path.resolve(__dirname, "resources/icon"),
    extendInfo: {
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    },
    extraResource: [
      path.resolve(__dirname, "dist-utility"),
      path.resolve(__dirname, "../addon/WowTraderCollector"),
      path.resolve(__dirname, "resources/addon-manifest.json"),
      path.resolve(__dirname, "resources/icon.png"),
    ],
  },
  hooks: {
    postPackage: async (_config, { outputPaths, platform }) => {
      if (platform !== "darwin") return;
      // Packaging changes Electron's bundle, so replace its invalid original signature.
      // Ad-hoc signing provides local integrity; it is not Developer ID notarization.
      for (const outputPath of outputPaths) {
        const bundle = path.join(outputPath, "WoW Trader Companion.app");
        await exec("codesign", ["--force", "--deep", "--sign", "-", bundle]);
        await exec("codesign", ["--verify", "--deep", "--strict", bundle]);
      }
    },
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "win32", "linux"] },
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
