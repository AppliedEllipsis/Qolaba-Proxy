/** @type {import('jest').Config} */
const config = {
  // Use ES modules
  preset: null,
  testEnvironment: 'node',
  
  // Transform configuration for ES modules
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Module name mapping for any static assets
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [],
  
  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ],
  
  // Verbose output
  verbose: true
};

module.exports = config;