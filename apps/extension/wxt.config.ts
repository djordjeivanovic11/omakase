import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Omakase',
    description: 'Save rendered webpages to your local Omakase learning studio.',
    permissions: ['activeTab', 'storage', 'scripting', 'nativeMessaging', 'contextMenus'],
    action: {
      default_title: 'Save to Omakase',
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
});
