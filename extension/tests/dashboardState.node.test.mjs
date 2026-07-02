import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowCollectionSetup } from '../src/dashboardState.mjs';

test('shows initial collection setup before data is loaded', () => {
  assert.equal(
    shouldShowCollectionSetup({
      collectionStarted: false,
      loading: false,
      hasData: false,
      configuringCollection: false,
    }),
    true,
  );
});

test('shows collection setup while configuring more data after partial data exists', () => {
  assert.equal(
    shouldShowCollectionSetup({
      collectionStarted: true,
      loading: false,
      hasData: true,
      configuringCollection: true,
    }),
    true,
  );
});

test('hides collection setup during active loading', () => {
  assert.equal(
    shouldShowCollectionSetup({
      collectionStarted: true,
      loading: true,
      hasData: true,
      configuringCollection: true,
    }),
    false,
  );
});

test('keeps dashboard visible when data exists and collection setup is not requested', () => {
  assert.equal(
    shouldShowCollectionSetup({
      collectionStarted: true,
      loading: false,
      hasData: true,
      configuringCollection: false,
    }),
    false,
  );
});
