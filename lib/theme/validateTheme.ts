import sanitizeHtml from 'sanitize-html';
import postcss from 'postcss';

interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedHtml?: string;
  sanitizedCss?: string;
}

const ALLOWED_TAGS = [
  'div', 'span', 'p', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'button',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'form', 'input', 'label'
];

const ALLOWED_ATTRIBUTES = {
  '*': ['class', 'id', 'style', 'data-*'],
  'a': ['href', 'target'],
  'img': ['src', 'alt', 'loading'],
  'input': ['type', 'name', 'placeholder']
};

const REQUIRED_PLACEHOLDERS = ['{{store.name}}', '{{products}}'];
const MAX_HTML_SIZE = 200000;
const MAX_CSS_SIZE = 100000;

export async function validateTheme(
  html: string,
  css: string
): Promise<ThemeValidationResult> {
  const errors: string[] = [];

  if (html.length > MAX_HTML_SIZE) errors.push('HTML exceeds 200kb limit');
  if (css.length > MAX_CSS_SIZE) errors.push('CSS exceeds 100kb limit');

  if (/<script/i.test(html)) errors.push('Inline <script> tags are not allowed');
  if (/javascript:/i.test(html)) errors.push('javascript: URLs are not allowed');

  const sanitizedHtml = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    disallowedTagsMode: 'discard',
    allowedSchemes: ['https', 'data'],
  });

  for (const ph of REQUIRED_PLACEHOLDERS) {
    if (!html.includes(ph)) errors.push(`Missing required placeholder: ${ph}`);
  }

  let sanitizedCss = css;
  try {
    const result = await postcss().process(css, { from: undefined });
    result.root.walkAtRules('import', (rule) => {
      errors.push('External @import is not allowed in theme CSS');
      rule.remove();
    });
    result.root.walkDecls((decl) => {
      const urlMatch = decl.value.match(/url\((.*?)\)/g);
      if (urlMatch) {
        for (const u of urlMatch) {
          if (!/^url\((['"]?)(https:|data:)/.test(u)) {
            errors.push(`Disallowed CSS url() reference: ${u}`);
          }
        }
      }
    });
    sanitizedCss = result.root.toString();
  } catch (e) {
    errors.push('CSS failed to parse — check for syntax errors');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedHtml: errors.length === 0 ? sanitizedHtml : undefined,
    sanitizedCss: errors.length === 0 ? sanitizedCss : undefined,
  };
}
