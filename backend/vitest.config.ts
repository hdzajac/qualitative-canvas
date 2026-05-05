import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/tests/globalSetup.js'],
    sequence: { concurrent: false },
    // All integration tests share a single database; running files in parallel causes
    // race conditions (e.g. lease endpoint picking up a queued job from a different file).
    // singleFork ensures every test file runs sequentially inside one worker process.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
