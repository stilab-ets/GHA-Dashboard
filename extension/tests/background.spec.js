const { test, expect } = require('./fixtures');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('service worker exists', async ({ context }) => {
  let [worker] = context.serviceWorkers();

  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  expect(worker.url()).toContain('background');
});

test('background normalizes run ids before cache merge', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'background.js'), 'utf8');
  const sandbox = {
    console,
    WebSocket: function WebSocket() {},
    chrome: {
      runtime: { onMessage: { addListener: () => {} } },
      tabs: {
        onRemoved: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
      },
      storage: {
        local: {
          set: () => {},
          remove: () => {},
        },
        session: {
          get: () => {},
        },
      },
    },
  };

  vm.runInNewContext(source, sandbox);

  const runIds = [
    sandbox.getRunId({ id: 123 }),
    sandbox.getRunId({ id: '123' }),
    sandbox.getRunId({ id: '' }),
    sandbox.getRunId({}),
    sandbox.getRunId(null),
  ];

  expect(runIds).toEqual(['123', '123', null, null, null]);
});
