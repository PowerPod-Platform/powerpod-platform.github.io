# PowerPod Platform — website

Static site. No build step, no dependencies, no JavaScript.

```
index.html                        landing page
styles/site.css                   sitewide stylesheet (tokens, glaze, type)
fonts/DMSans-Variable-latin.woff2 DM Sans variable, weights 100–1000
.nojekyll                         disables GitHub Pages' Jekyll processing
```

## Local preview

Serve over HTTP rather than opening the file directly — `file://` origins can
block the font fetch under CORS rules.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Deploying to GitHub Pages

1. Push to GitHub.
2. Settings → Pages → Source: **Deploy from a branch** → `main` → `/ (root)`.

Every path in the site is relative, so it works both at a domain root
(`<username>.github.io`) and under a project subpath (`/<repo-name>/`).

GitHub Pages is a static host: client-side JavaScript runs normally, but there
is no server-side execution, no API routes and no secrets — anything committed
here is public.

## Adding a page

Create `<name>.html`, link `styles/site.css`, and copy the `.glaze` / `.grain`
blocks from `index.html` if the page should carry the ceramic background. All
colour, type and geometry values are custom properties under `:root` in
`styles/site.css` — change them there and every page follows.

## Notes

- **Typeface.** DM Sans is self-hosted, so there is no third-party request and
  the page renders identically offline. The latin subset is used; it covers
  U+2122 (™). Add the latin-ext file if extended-latin glyphs are ever needed.
- **Background.** Four blurred colour fields drift on mutually prime periods
  (29/37/43/53s) while their opacity cycles on separate periods, so the
  composite never visibly repeats. Only `transform` and `opacity` are
  animated, keeping the whole effect on the compositor.
- **Reduced motion.** `prefers-reduced-motion: reduce` freezes the background
  while keeping it a full ceramic surface.
