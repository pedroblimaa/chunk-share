import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import { builtinModules } from 'node:module'

function restrictNodeImports(message) {
  return builtinModules.flatMap((moduleName) => [
    { name: moduleName, message },
    { name: `node:${moduleName}`, message }
  ])
}

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictNodeImports('Node APIs belong in the main process.'),
            { name: 'electron', message: 'Use the typed window.chunkShare preload API.' }
          ],
          patterns: [
            {
              group: ['**/main/**', '**/preload/**'],
              message: 'Use the typed window.chunkShare preload API.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictNodeImports('Shared modules must remain process-independent.'),
            { name: 'electron', message: 'Shared modules must remain process-independent.' },
            { name: 'react', message: 'React belongs in the renderer.' },
            { name: 'react-dom', message: 'React belongs in the renderer.' }
          ],
          patterns: [
            {
              group: ['**/main/**', '**/preload/**', '**/renderer/**'],
              message: 'Shared modules cannot depend on an Electron process layer.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/main/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'React belongs in the renderer.' },
            { name: 'react-dom', message: 'React belongs in the renderer.' }
          ],
          patterns: [
            { group: ['**/renderer/**'], message: 'Main and preload cannot depend on renderer modules.' }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
