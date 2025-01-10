/** @type {import('jest').Config} */
module.exports = {
  automock: false,
  transform: {
    "\\.ts$": ['ts-jest', { isolatedModules: true }],
  },
};
