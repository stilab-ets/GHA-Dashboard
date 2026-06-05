const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  use: {
    headless: process.env.E2E_HEADLESS === 'true'
  }
});