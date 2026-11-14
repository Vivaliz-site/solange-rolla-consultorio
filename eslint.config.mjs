import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const clientServerImportSources = [
  /^server-only$/,
  /^(?:@\/|(?:\.{1,2}\/)+(?:src\/)?)platform\/env\/server(?:-only)?(?:\/.*)?$/,
  /^(?:@\/|(?:\.{1,2}\/)+(?:src\/)?)platform\/crypto(?:\/.*)?$/,
  /^(?:@\/|(?:\.{1,2}\/)+(?:src\/)?)platform\/supabase\/(?:service-role|admin)(?:\/.*)?$/,
]

const architectureBoundaries = {
  rules: {
    'no-client-server-import': {
      meta: {
        type: 'problem',
        docs: {
          description: 'prevent client components from importing server-only modules',
        },
        messages: {
          serverSecretImport: 'Server-only modules cannot be imported by client components.',
        },
        schema: [],
      },
      create(context) {
        let isClientComponent = false

        function reportForbiddenSource(node, source) {
          if (
            isClientComponent &&
            typeof source?.value === 'string' &&
            clientServerImportSources.some((pattern) => pattern.test(source.value))
          ) {
            context.report({ node, messageId: 'serverSecretImport' })
          }
        }

        return {
          Program(node) {
            isClientComponent = node.body.some(
              (statement) =>
                statement.type === 'ExpressionStatement' && statement.directive === 'use client',
            )
          },
          ImportDeclaration(node) {
            reportForbiddenSource(node, node.source)
          },
          ExportNamedDeclaration(node) {
            reportForbiddenSource(node, node.source)
          },
          ExportAllDeclaration(node) {
            reportForbiddenSource(node, node.source)
          },
          ImportExpression(node) {
            reportForbiddenSource(node, node.source)
          },
          CallExpression(node) {
            if (
              node.callee.type === 'Identifier' &&
              node.callee.name === 'require' &&
              node.arguments.length === 1
            ) {
              reportForbiddenSource(node, node.arguments[0])
            }
          },
        }
      },
    },
  },
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      'architecture-boundaries': architectureBoundaries,
    },
    rules: {
      'architecture-boundaries/no-client-server-import': 'error',
    },
  },
  {
    files: [
      'src/**/domain/**/*.{ts,tsx}',
      'tests/architecture/fixtures/domain-*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              message: 'Domain modules cannot import Supabase SDKs.',
            },
            {
              group: ['next', 'next/*'],
              message: 'Domain modules cannot import Next.js.',
            },
            {
              group: [
                'react',
                'react-dom',
                'react-dom/*',
                '@/shared/ui',
                '@/shared/ui/*',
                '@radix-ui/*',
              ],
              message: 'Domain modules cannot import UI libraries.',
            },
            {
              group: ['@aws-sdk/*', '@google-cloud/*', 'openai', 'resend', 'twilio'],
              message: 'Domain modules cannot import provider SDKs.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.worker-dist/**',
    '.worktrees/**',
    '**/node_modules.npm-partial/**',
    'out/**',
    'coverage/**',
    '.worktrees/**',
    'vendor/braces/**',
    'backups/**',
    'playwright-report/**',
    'test-results/**',
    'supabase/.temp/**',
  ]),
])
