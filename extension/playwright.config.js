const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  
  reporter: [
    ['list']
  ],

  use: {
    headless: false,
  }
});