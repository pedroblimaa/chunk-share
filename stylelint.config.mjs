const rawColorPatterns = [
  '/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\\b/i',
  '/\\brgba?\\(/i',
  '/\\bhsla?\\(/i'
]
const colorProperties =
  '/^(?:background|background-color|border|border-(?:top|right|bottom|left)|border-(?:top|right|bottom|left)-color|border-color|box-shadow|color|fill|outline|outline-color|stroke|text-shadow)$/'

function createVisualValueRules({ allowColors = false, allowFontSizes = false, allowRadii = false } = {}) {
  return {
    ...(allowColors ? {} : { [colorProperties]: rawColorPatterns }),
    ...(allowFontSizes ? {} : { 'font-size': ['/-?\\d*\\.?\\d+px/'] }),
    ...(allowRadii ? {} : { 'border-radius': ['/-?\\d*\\.?\\d+px/'] })
  }
}

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-recommended'],
  ignoreFiles: ['**/node_modules/**', '**/out/**', '**/dist/**'],
  rules: {
    'declaration-property-value-disallowed-list': createVisualValueRules(),
    'no-descending-specificity': null
  },
  overrides: [
    {
      files: ['src/renderer/src/assets/colors.css'],
      rules: {
        'declaration-property-value-disallowed-list': createVisualValueRules({ allowColors: true })
      }
    },
    {
      files: ['src/renderer/src/assets/layout.css'],
      rules: {
        'declaration-property-value-disallowed-list': createVisualValueRules({
          allowColors: true,
          allowRadii: true
        })
      }
    },
    {
      files: ['src/renderer/src/assets/typography.css'],
      rules: {
        'declaration-property-value-disallowed-list': createVisualValueRules({ allowFontSizes: true })
      }
    },
    {
      files: ['src/renderer/src/views/**/*.css'],
      rules: {
        'selector-disallowed-list': [
          '/\\.chunk-button-(?:danger|danger-ghost|ghost|icon|primary|secondary)/',
          '/\\.chunk-card-(?:active|danger|dashed|default|interactive|panel)/',
          '/\\.chunk-badge-(?:active|danger|default|disabled|info|success|warning)/'
        ]
      }
    }
  ]
}
