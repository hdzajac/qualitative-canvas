// Vitest configuration to ensure we clean up test-created media artifacts once after all tests
export default {
  test: {
    globalSetup: ['./src/tests/globalSetup.js'],
    sequence: { concurrent: false },
  },
};
