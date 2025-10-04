/** @type {import('jest').Config} */
const config = {
  // Use ES modules
  preset: null,
  testEnvironment: 'node',
  
  // Transform configuration for ES modules
  transform: {},
  
  // No need to specify .js files as ESM since package.json has "type": "module"
  // extensionsToTreatAsEsm: ['.js'],
  
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

export default config;