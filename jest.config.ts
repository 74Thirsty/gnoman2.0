import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/?(*.)+(test).ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^backend/(.*)$': '<rootDir>/backend/$1',
    '^main/(.*)$': '<rootDir>/main/$1'
  },
  collectCoverageFrom: ['src/**/*.ts', 'backend/**/*.ts', 'main/**/*.ts', '!**/__tests__/**'],
  coverageDirectory: '<rootDir>/coverage'
};

export default config;
