# The Forge & Fable — Website

## Files included
- `index.html` — Homepage
- `gallery.html` — Photo gallery
- `order.html` — Order request form
- `pricing.html` — Pricing & policies
- `stl-sources.html` — STL licensing guide
- `style.css` — All shared styles
- `images/gallery/` — Put your mini photos here

---

## Before going live — checklist

### 1. Set up Formspree (order form emails)
1. Go to https://formspree.io and create a free account
2. Create a new form
3. Copy your form endpoint URL (looks like `https://formspree.io/f/xpznkwvj`)
4. Open `order.html` and find this line:
   ```
   action="https://formspree.io/f/YOUR_FORMSPREE_ID"
   ```
5. Replace `YOUR_FORMSPREE_ID` with your actual ID

### 2. Add your photos to the gallery
In both `index.html` and `gallery.html`, each image card has a placeholder div:
```html
<div class="preview-img-placeholder">YOUR PHOTO HERE</div>
```
Replace it with a real image tag:
```html
<img src="images/gallery/your-photo.jpg" alt="Description of your mini">
```
Save your photos to the `images/gallery/` folder.
Recommended: square crops, 800×800px minimum.

### 3. Update your branding (optional)
- Search for `EST. 2025` and update the year if needed
- The footer shows `LIMA, OHIO` — update if your location changes

### 4. Delete the photo note box
In `gallery.html`, delete the `<div class="photo-note" id="photo-note">` block once real photos are added.

---

## Deploying to Vercel

1. Go to https://vercel.com and sign up (free)
2. Click "Add New Project"
3. Choose "Deploy from your computer" and drag this folder
   — OR — push to GitHub first, then connect your repo
4. Vercel deploys automatically — you'll get a .vercel.app URL
5. Add your custom domain (theforgeandfable.com) in Vercel settings
6. In Porkbun, add the DNS records Vercel shows you (usually 2 records)
7. Wait ~10 minutes for DNS to propagate — your site is live!

---

## Adding more gallery cards

Copy this template and paste it inside the `<div class="gallery-grid">` in `gallery.html`:

```html
<div class="g-card" data-tags="hero resin">
  <div class="g-img">
    <img src="images/gallery/your-new-photo.jpg" alt="Description">
    <div class="g-badge-wrap">
      <span class="pill pill-resin">RESIN</span>
    </div>
  </div>
  <div class="g-info">
    <div class="g-name">Your Mini Name</div>
    <div class="g-meta">32MM · 4K RESIN</div>
    <div class="g-tags">
      <span class="g-tag">HERO</span>
      <span class="g-tag">D&D</span>
    </div>
  </div>
</div>
```

**data-tags options:** `hero` `monster` `terrain` `display` `resin` `pla`
Use multiple tags separated by spaces. These control which filter button shows the card.

---

## Phase 2 — Adding the dashboard & database later

When you're ready to add the internal dashboard and live inventory:
1. Convert these HTML files to a Next.js project
2. Connect Supabase for orders, inventory, and gallery storage
3. Add password-protected `/dashboard` route
4. The design and CSS carry over unchanged

The Forge & Fable dashboard mockup (built in Claude) is a complete
reference for what Phase 2 should look like.
