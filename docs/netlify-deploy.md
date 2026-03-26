# Netlify Deploy Checklist

This app is ready to deploy on Netlify as a static Vite frontend.

## 1. Netlify build settings

- Build command: `npm run build`
- Publish directory: `dist`

These are already defined in [netlify.toml](/c:/Users/JS_Mi/OneDrive/Desktop/DEV%20AREA/Crypto_website_charts/netlify.toml).

## 2. Required environment variables

Set these in Netlify under `Site configuration > Environment variables`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

You can copy the variable names from [.env.example](/c:/Users/JS_Mi/OneDrive/Desktop/DEV%20AREA/Crypto_website_charts/.env.example).

## 3. SPA routing

The app uses React Router with `BrowserRouter`, so direct visits to routes like:

- `/dashboard`
- `/portfolio`
- `/transactions`
- `/performance`
- `/markets`
- `/live-charts`

must rewrite to `index.html`.

This is already configured in [netlify.toml](/c:/Users/JS_Mi/OneDrive/Desktop/DEV%20AREA/Crypto_website_charts/netlify.toml).

## 4. Supabase settings to verify

Because auth, storage, and app data are handled by Supabase, also verify:

- your Netlify site URL is added in Supabase Auth URL settings
- your custom domain is added too, if used
- storage bucket and database policies are already configured for the deployed frontend

Recommended URLs to add in Supabase:

- `https://<your-netlify-site>.netlify.app`
- `https://crypto-dashboard.michael-gonaus.dev`

## 5. Custom domain

If you want to use:

- `crypto-dashboard.michael-gonaus.dev`

connect the domain in Netlify and point the subdomain DNS record from Namecheap to Netlify.

## 6. Important note

Netlify only hosts the frontend here.

These features still depend on external services:

- Supabase auth
- Supabase database
- Supabase storage
- Crypto.com public REST/WebSocket APIs

So the frontend is Netlify-ready, but full functionality also depends on those services being configured and available.
