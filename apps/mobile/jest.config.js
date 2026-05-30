module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.pnpm/)?(react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@react-native-google-signin))',
  ],
  setupFilesAfterEnv: [],
};
