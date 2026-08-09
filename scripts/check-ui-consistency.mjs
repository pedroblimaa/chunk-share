/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript validation script. */

import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const PROJECT_ROOT = process.cwd()
const CSS_ROOT = resolve(PROJECT_ROOT, 'src/renderer/src')
const COLOR_TOKEN_FILE = resolve(CSS_ROOT, 'assets/colors.css')
const LAYOUT_TOKEN_FILE = resolve(CSS_ROOT, 'assets/layout.css')
const TYPOGRAPHY_TOKEN_FILE = resolve(CSS_ROOT, 'assets/typography.css')
const SPACING_PROPERTIES = new Set([
  'column-gap',
  'gap',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'row-gap'
])

const cssFiles = await findCssFiles(CSS_ROOT)
const cssSources = await Promise.all(
  cssFiles.map(async (file) => ({ file, source: stripComments(await readFile(file, 'utf8')) }))
)
const declaredTokens = collectDeclaredTokens(cssSources)
const failures = []

for (const { file, source } of cssSources) {
  validateTokenReferences(file, source, declaredTokens, failures)
  validateRawVisualValues(file, source, failures)
  validateSpacingGrid(file, source, failures)
}

if (failures.length > 0) {
  console.error('UI consistency validation failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`UI consistency validation passed for ${cssFiles.length} CSS files.`)
}

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(directory, entry.name)
      return entry.isDirectory() ? findCssFiles(entryPath) : entryPath.endsWith('.css') ? [entryPath] : []
    })
  )

  return files.flat()
}

function collectDeclaredTokens(sources) {
  const tokens = new Set()

  for (const { source } of sources) {
    for (const match of source.matchAll(/(^|[;{])\s*(--[a-z0-9-]+)\s*:/gim)) {
      tokens.add(match[2])
    }
  }

  return tokens
}

function validateTokenReferences(file, source, declaredTokens, failures) {
  for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!declaredTokens.has(match[1])) {
      failures.push(formatFailure(file, source, match.index, `Unknown design token ${match[1]}.`))
    }
  }
}

function validateRawVisualValues(file, source, failures) {
  if (file !== COLOR_TOKEN_FILE && file !== LAYOUT_TOKEN_FILE) {
    reportMatches(
      file,
      source,
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi,
      'Move raw colors into colors.css.',
      failures
    )
  }

  if (file !== TYPOGRAPHY_TOKEN_FILE) {
    reportDeclarationMatches(file, source, 'font-size', /-?\d*\.?\d+px/i, 'Use a typography token.', failures)
  }

  if (file !== LAYOUT_TOKEN_FILE) {
    reportDeclarationMatches(file, source, 'border-radius', /-?\d*\.?\d+px/i, 'Use a radius token.', failures)
    reportMatches(file, source, /\bblur\(\s*-?\d*\.?\d+(?:px|rem|em)\s*\)/gi, 'Use a blur token.', failures)
  }
}

function validateSpacingGrid(file, source, failures) {
  for (const declaration of getDeclarations(source)) {
    if (!SPACING_PROPERTIES.has(declaration.property)) {
      continue
    }

    for (const match of declaration.value.matchAll(/(-?\d*\.?\d+)px/gi)) {
      const value = Number(match[1])
      if (Math.abs(value) % 2 !== 0) {
        failures.push(
          formatFailure(
            file,
            source,
            declaration.index + match.index,
            `${declaration.property} uses ${match[0]}; raw spacing must use the 2px grid.`
          )
        )
      }
    }
  }
}

function reportDeclarationMatches(file, source, property, pattern, message, failures) {
  for (const declaration of getDeclarations(source)) {
    if (declaration.property === property && pattern.test(declaration.value)) {
      failures.push(formatFailure(file, source, declaration.index, message))
    }
    pattern.lastIndex = 0
  }
}

function reportMatches(file, source, pattern, message, failures) {
  for (const match of source.matchAll(pattern)) {
    failures.push(formatFailure(file, source, match.index, message))
  }
}

function getDeclarations(source) {
  return [...source.matchAll(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+);/gim)].map((match) => ({
    index: match.index + match[1].length,
    property: match[2].toLowerCase(),
    value: match[3]
  }))
}

function formatFailure(file, source, index, message) {
  const line = source.slice(0, index).split('\n').length
  return `${relative(PROJECT_ROOT, file)}:${line} ${message}`
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}
