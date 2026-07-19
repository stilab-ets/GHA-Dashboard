const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,

  reporter: [
    ['list']
  ],

  use: {
    headless: false,
    viewport: {
      width: 1920,
      height: 1080,
    },
  }
});
