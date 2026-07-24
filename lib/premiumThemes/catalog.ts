export interface PremiumSection {
  id: string;       // section-type key within a theme, e.g. "hero"
  type: string;     // category label used in the editor UI
  label: string;
  html: string;
  css: string;
}

export interface PremiumTheme {
  id: string;
  name: string;
  description: string;
  price: number; // NGN, one-time
  previewImage: string;
  sections: PremiumSection[];
}

export const PREMIUM_THEMES: PremiumTheme[] = [
  {
    id: "modern-boutique",
    name: "Modern Boutique",
    description: "A bold, editorial storefront with a full-width hero, featured product grid, testimonial banner, and rich footer.",
    price: 6000,
    previewImage: "",
    sections: [
      {
        id: "hero",
        type: "hero",
        label: "Hero banner",
        html: `
<section class="mb-hero">
  <h1 data-editable="hero-title" data-label="Hero title">New arrivals, curated weekly</h1>
  <p data-editable="hero-subtitle" data-label="Hero subtitle">Handpicked pieces, delivered fast.</p>
  <a data-editable-link="hero-cta" data-label="Hero button link" href="#products" class="mb-hero-btn">Shop now</a>
</section>`,
        css: `
.mb-hero { padding: 64px 24px; text-align: center; background: #111; color: #fff; }
.mb-hero h1 { font-size: 2.25rem; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.02em; }
.mb-hero p { font-size: 1rem; color: #bbb; margin: 0 0 24px; }
.mb-hero-btn { display: inline-block; padding: 12px 28px; background: #fff; color: #111; border-radius: 999px; font-weight: 700; text-decoration: none; }`,
      },
      {
        id: "featured-products",
        type: "product-grid",
        label: "Featured products banner",
        html: `
<section class="mb-featured">
  <h2 data-editable="featured-title" data-label="Featured section title">Featured this week</h2>
  <p data-editable="featured-subtitle" data-label="Featured section subtitle">A few of our favorites right now.</p>
</section>`,
        css: `
.mb-featured { padding: 48px 24px 16px; text-align: center; }
.mb-featured h2 { font-size: 1.5rem; font-weight: 800; margin: 0 0 8px; }
.mb-featured p { color: #666; margin: 0; }`,
      },
      {
        id: "testimonial",
        type: "testimonial",
        label: "Testimonial banner",
        html: `
<section class="mb-testimonial">
  <p data-editable="testimonial-quote" data-label="Testimonial quote">"Fast delivery and the quality exceeded my expectations."</p>
  <p data-editable="testimonial-author" data-label="Testimonial author">— Verified customer</p>
</section>`,
        css: `
.mb-testimonial { padding: 40px 24px; text-align: center; background: #f4f1ea; }
.mb-testimonial p:first-child { font-size: 1.1rem; font-style: italic; color: #222; margin: 0 0 8px; max-width: 480px; margin-left: auto; margin-right: auto; }
.mb-testimonial p:last-child { font-size: 0.85rem; color: #888; margin: 0; }`,
      },
      {
        id: "footer",
        type: "footer",
        label: "Footer",
        html: `
<footer class="mb-footer">
  <p data-editable="footer-text" data-label="Footer text">Thanks for shopping with us.</p>
  <a data-editable-link="footer-whatsapp" data-label="WhatsApp link" href="#">WhatsApp us</a>
</footer>`,
        css: `
.mb-footer { padding: 32px 24px; text-align: center; background: #111; color: #999; }
.mb-footer p { margin: 0 0 8px; font-size: 0.85rem; }
.mb-footer a { color: #fff; font-size: 0.85rem; text-decoration: underline; }`,
      },
    ],
  },
  {
    id: "vibrant-market",
    name: "Vibrant Market",
    description: "A colorful, energetic layout built for fashion and lifestyle brands, with a split hero and a bold promo banner.",
    price: 6000,
    previewImage: "",
    sections: [
      {
        id: "hero",
        type: "hero",
        label: "Hero banner",
        html: `
<section class="vm-hero">
  <div class="vm-hero-text">
    <h1 data-editable="hero-title" data-label="Hero title">Wear your story</h1>
    <p data-editable="hero-subtitle" data-label="Hero subtitle">Bold pieces for bold people.</p>
    <a data-editable-link="hero-cta" data-label="Hero button link" href="#products" class="vm-hero-btn">Explore the collection</a>
  </div>
</section>`,
        css: `
.vm-hero { padding: 56px 24px; background: linear-gradient(135deg, #ff6b6b, #ffd93d); border-radius: 0 0 32px 32px; }
.vm-hero-text { max-width: 560px; margin: 0 auto; text-align: center; }
.vm-hero h1 { font-size: 2rem; font-weight: 900; color: #111; margin: 0 0 10px; }
.vm-hero p { color: #222; margin: 0 0 20px; }
.vm-hero-btn { display: inline-block; padding: 12px 24px; background: #111; color: #fff; border-radius: 12px; font-weight: 700; text-decoration: none; }`,
      },
      {
        id: "promo-banner",
        type: "banner",
        label: "Promo banner",
        html: `
<section class="vm-promo">
  <p data-editable="promo-text" data-label="Promo banner text">Free delivery on orders over a certain amount — check checkout for details.</p>
</section>`,
        css: `
.vm-promo { padding: 14px 20px; text-align: center; background: #111; color: #ffd93d; font-weight: 700; font-size: 0.85rem; }`,
      },
      {
        id: "featured-products",
        type: "product-grid",
        label: "Featured products banner",
        html: `
<section class="vm-featured">
  <h2 data-editable="featured-title" data-label="Featured section title">Trending now</h2>
</section>`,
        css: `
.vm-featured { padding: 40px 24px 12px; text-align: center; }
.vm-featured h2 { font-size: 1.4rem; font-weight: 800; margin: 0; }`,
      },
      {
        id: "footer",
        type: "footer",
        label: "Footer",
        html: `
<footer class="vm-footer">
  <p data-editable="footer-text" data-label="Footer text">Follow us for new drops every week.</p>
  <a data-editable-link="footer-instagram" data-label="Instagram link" href="#">Instagram</a>
</footer>`,
        css: `
.vm-footer { padding: 32px 24px; text-align: center; background: #fff3d6; }
.vm-footer p { margin: 0 0 8px; color: #444; font-size: 0.85rem; }
.vm-footer a { color: #111; font-weight: 700; text-decoration: none; }`,
      },
    ],
  },
];

export function getPremiumTheme(themeId: string): PremiumTheme | undefined {
  return PREMIUM_THEMES.find((t) => t.id === themeId);
}
