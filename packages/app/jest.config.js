export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/src/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/tests/**',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.+?/node_modules)?(@tauri-apps|@radix-ui|zustand|framer-motion|lucide-react|class-variance-authority|clsx|tailwind-merge|react-markdown|remark-gfm|rehype-highlight|rehype-raw|unist-util-visit|unist-util-is|decode-uri-component|vfile|micromark|@types|hast|html-void-elements|property-information|space-separated-tokens|comma-separated-tokens|sonner|cmdk|@tanstack/react-query|devlop))/',
  ],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
      },
    },
  },
};
