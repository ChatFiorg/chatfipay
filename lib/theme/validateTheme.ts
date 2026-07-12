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
  'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'main', 'button',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'form', 'input', 'label'
];

const ALLOWED_ATTRIBUTES = {
  '*': ['class', 'id', 'style', 'data-*'],
  'a': ['href', 'target'],
  'img': ['src', 'alt', 'loading'],
  'input': ['type', 'name', 'placeholder']
};

// Card/payment-credential input types have no legitimate use in a storefront
// theme — real checkout happens through our own payment flow, never through
// fields typed directly into a merchant's custom HTML.
const BLOCKED_INPUT_TYPES = ['password'];

// Flags content that looks like it's trying to harvest payment credentials
// directly (rather than routing through the platform's real checkout).
// This is a heuristic, not a guarantee — it catches obvious/lazy attempts
// and gives a manual review signal, not airtight protection.
const PAYMENT_HARVEST_PATTERNS = [
  /card\s*number/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /card\s*expiry/i,
  /\bbvn\b/i,
  /\botp\b/i,
  /pin\s*code/i,
  /account\s*pin/i,
];

// Basic blocklist for overtly harmful/abusive content. This is a coarse
// keyword pass for moderation signal, not a substitute for human review of
// flagged submissions.
const HARMFUL_CONTENT_PATTERNS = [
  /\brape\b/i,
  /\bkill\s*(yourself|urself)\b/i,
  /\bchild\s*(porn|abuse)\b/i,
  /\bterroris[tm]\b/i,
];

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

  for (const pattern of BLOCKED_INPUT_TYPES) {
    const re = new RegExp(`type\\s*=\\s*["']?${pattern}["']?`, 'i');
    if (re.test(html)) errors.push(`Input type "${pattern}" is not allowed — payment/credential fields must go through checkout, not the theme`);
  }

  for (const pattern of PAYMENT_HARVEST_PATTERNS) {
    if (pattern.test(html)) {
      errors.push('Content resembling a payment/credential collection form was found — this template was blocked for review. Payment must go through checkout, never through custom theme fields.');
      break;
    }
  }

  for (const pattern of HARMFUL_CONTENT_PATTERNS) {
    if (pattern.test(html)) {
      errors.push('This template contains content that violates our content policy and was blocked.');
      break;
    }
  }

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
