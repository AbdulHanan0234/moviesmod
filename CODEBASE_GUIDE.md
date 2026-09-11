# MoviesMod — Complete Codebase Guide

This document explains **every part of your website**: what each file does, how the logic works, and why it was built that way — written for you, the site owner, to understand the whole system without having to decode the code alone.

Since the site was built with AI assistance, this guide never assumes you already know a technique: the first time anything unfamiliar appears (useState, CORS, gzip, code splitting, MongoDB projection…), it gets a plain-English explanation right there, plus Section 9 is a full glossary referencing where each technique is used.

## The site in one paragraph

MoviesMod is a movie/series catalog. Visitors browse a paginated grid of titles, filter by language/genre/year/type/OTT/tags, and open detail pages with derived titles, download links, screenshots and episode lists. All catalog data lives in **MongoDB Atlas**; movie metadata and images come live from the **TMDB API**. A **React (Vite) single-page app** is the frontend; a small **Express API** serves the data. You (admin) add titles through the `/AddMovies` panel, which searches TMDB, builds quality/season/episode link structures, and publishes them to the database.

## How to read this guide

- **New here?** Read Section 0 first — the big picture and a full walkthrough of what happens when someone opens your site.
- **Want to understand a specific page or file?** Jump to its section via the table of contents; every file is referenced by its real path (e.g. `backend/routes/movieRoutes.js`).
- **Stuck on jargon?** Section 9 (Glossary) explains every technique used anywhere in the project, with pointers to where it lives.
- Keep the repo open next to the guide — every claim points at real code you can click through.

## Table of contents

- **0. The Big Picture** — architecture, folder map, "life of a page view", env vars, running the project
- **1. Backend — Express Server & MongoDB** — server, schema field-by-field, every API endpoint, pagination, compression, caching
- **2. Frontend Foundation** — Vite, the HTML shell, SPA routing, code splitting, deployment
- **3. The Data Layer** — API client + caching, data transformations, the tag/filter engine
- **4. TMDB Integration** — the `useTmdbMovie` hook: caching, race conditions, season parallelization
- **5. Home Page & Navigation** — the two data modes, filtering pipeline, Navbar, Sidebar, grid
- **6. Movie Details Page** — data merging, fallback chains, screenshots rescue, all detail components
- **7. Episode Page & Admin Panel** — EpisodePage + the full AddMovies management UI
- **8. Styling & Assets** — CSS architecture, dark theme, responsive grid, fonts, icons
- **9. Glossary of Techniques** — ~40 concepts explained generally and located in this repo

---
## 00. The Big Picture

This section is the map for everything else in this guide. It covers what the site actually is, how the pieces fit together, what happens in the second after someone types your URL, and how to run and deploy the thing. Later sections zoom into individual files.

### What this product is

MoviesMod is a **public movie and TV-series download catalog** with a **private admin page** bolted onto it. In practice it has two kinds of visitors:

- **Readers** browse a poster grid, open a title, and click download links (per-quality links for movies, per-episode links for series).
- **You (the admin)** open `/AddMovies`, search TMDB for a title, paste your download links, and publish it to the catalog.

Three ideas explain almost every file in the repo:

1. **Every catalog entry is keyed by its TMDB ID.** `tmdbId` is the primary key of the whole site — the MongoDB document uses it, the URL uses it (`/movie-details/12345`), and the TMDB lookups use it. You never invent your own IDs.
2. **MongoDB stores only what you typed; TMDB supplies the pretty stuff.** The database holds the entry you published (title, language, poster URL, download links, publish date). Posters and screenshots are not uploaded anywhere — they are loaded straight from TMDB's image servers using the path you saved.
3. **TMDB metadata is re-fetched in the browser at view time.** Ratings, genres, cast, episode counts and screenshots are pulled live from the TMDB API by the visitor's browser when a details page opens, with your stored values as fallback. That is why a details page can look slightly different from what you stored, and why it needs `VITE_TMDB_API_KEY` to look its best.

### The four routes

Routing is handled by `frontend/src/App.jsx`. **What this is:** React Router is a library that lets a single-page app (SPA — one HTML page that JavaScript re-draws instead of the server sending new pages) change the URL and swap the visible component without a full page reload.

| Route | Page component | What the visitor sees |
| --- | --- | --- |
| `/` | `frontend/src/pages/HomePage.jsx` | Poster grid of the newest titles, navbar, filter chips, pagination, footer. Query params in the URL (`?tag=`, `?q=`, `?lang=`, `?genre=`, `?year=`, `?type=`, `?ott=`, `?page=`) turn the same page into a filtered view. |
| `/movie-details/:id` | `frontend/src/pages/MovieDetails.jsx` | The full page for one title (`:id` is the TMDB ID): release-style heading, info card, storyline, screenshots, download buttons (or season list for series), related posts, comment box, sidebar. |
| `/AddMovies` | `frontend/src/pages/AddMovies.jsx` | The admin screen: left panel to search TMDB, build quality links, publish/edit/delete; right panel is a live preview of how the entry will look. |
| `/series/:movieId/season/:seasonNum` | `frontend/src/pages/EpisodePage.jsx` | One season of one series, for one quality (the quality is picked by `?q=<index>`), listing a button per episode. |

Two things worth noticing:

- **All filtering happens on one route.** `/?genre=Action`, `/?lang=hi&type=tv` and `/?q=batman` are all `HomePage` reading the query string. There is no `/genre/action` route — the navbar in `frontend/src/components/Navbar.jsx` is just a big list of pre-built query strings.
- **`/AddMovies` is not password-gated to reach.** Anyone can open the page, but editing and deleting require the admin password (see section on `movieRoutes.js`). Adding is currently open to anyone — worth knowing.

### The architecture

```
                ┌──────────────────────────────┐
                │   Visitor's browser          │
                │   React SPA (Vite build)     │
                │  - React 19 + React Router 7 │
                └───┬───────────────┬──────────┘
                    │               │
        JSON over   │               │  images + metadata
        HTTP (fetch)│               │  (fetched directly by the browser)
                    │               │
                    ▼               ▼
      ┌───────────────────┐   ┌──────────────────────────────┐
      │  Express API      │   │  TMDB (third party)          │
      │  Node.js          │   │  api.themoviedb.org  (search,│
      │  backend/server.js│   │  details, credits, seasons)  │
      │  /api/movies/...  │   │  image.tmdb.org      (posters,│
      └─────────┬─────────┘   │  backdrops, episode stills)  │
                │             └──────────────────────────────┘
                │  Mongoose (ODM)
                ▼
      ┌───────────────────┐
      │  MongoDB Atlas    │
      │  db "moviesmod"   │
      │  collection       │
      │  "movies"         │
      └───────────────────┘
```

Reading the diagram left to right:

- **Browser SPA** (`frontend/`) — all rendering happens here. It knows nothing about MongoDB; it only speaks JSON to your API.
- **Express API** (`backend/`) — the only thing allowed to touch the database. It serves one resource: `/api/movies`.
- **MongoDB Atlas** — cloud-hosted MongoDB, reached through Mongoose. **What this is:** Mongoose is an ODM ("object-document mapper") — a library that lets you describe your data as a JavaScript schema and get back plain JS objects instead of raw database drivers.
- **TMDB** — a third party, called **directly from the browser**, never through your backend. Your server has no TMDB code at all.

**Why is TMDB called from the browser and not the server?** Because the key is a `VITE_` variable. **What this is:** anything in a `.env` file whose name starts with `VITE_` is baked into the JavaScript bundle at build time and therefore ships to every visitor. That is why `VITE_TMDB_API_KEY` is effectively public, and why the server-side secrets (`MONGODB_URI`, `ADMIN_PASSWORD`) live only in the backend `.env`, which never leaves the machine.

**Where CORS comes in.** **What this is:** CORS (Cross-Origin Resource Sharing) is the browser's security rule that a page from `https://a.com` may not read responses from `https://b.com` unless `b.com` says it is allowed. In development your frontend is on `http://localhost:5173` and the API on `http://localhost:5000` — different origins — so without CORS the browser would block every API response. `backend/server.js` handles it:

```js
const corsOrigin = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.includes(",")
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : process.env.CORS_ORIGIN)
  : "*";

app.use(cors({ origin: corsOrigin }));
```

In dev, `CORS_ORIGIN` is unset so it falls back to `"*"` (allow everybody — convenient, and only safe because a dev machine holds no real data). In production you must set it to your Vercel domain, otherwise any other website could script your API. Note that `api.themoviedb.org` already sends permissive CORS headers, which is the only reason the browser can call TMDB directly.

### Life of a page view: someone opens the home URL

Step by step, from keystroke to poster grid.

**1. The browser asks a server for one HTML file.** In production (Vercel) that file is the built version of `frontend/index.html`:

```html
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

That is the entire body: one empty `div` and a script tag. The `<head>` also pulls in Google's Roboto font, Bootstrap 5's CSS, Font Awesome icons, and four `<link rel="preconnect">` hints. **What this is:** `preconnect` tells the browser "I'm about to talk to this domain — open the network connection now," so the later font/image/API requests start a round-trip ahead. `image.tmdb.org` and `api.themoviedb.org` are preconnected for exactly that reason.

**2. The browser downloads CSS and the JavaScript bundle.** In dev, Vite serves your source files directly. In production, Vite has already bundled everything into hashed files (the ones visible in `frontend/dist/assets/`, e.g. `index-BEVWfTZC.js`). Because the page has no visible HTML, nothing appears until this JavaScript runs — the page is "blank until JS" by design.

**3. `main.jsx` boots React into that empty div:**

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**What this is:** React is a library that builds the page from components — functions that return markup — and re-draws only what changes. `StrictMode` is a dev-only wrapper that runs components twice to surface bugs; it does nothing in a production build.

**4. `App.jsx` matches the URL to a route — and code-splits the rest:**

```jsx
const MovieDetails = lazy(() => import("./pages/MovieDetails"))
const AddMovies = lazy(() => import("./pages/AddMovies"))
const EpisodePage = lazy(() => import("./pages/EpisodePage"))
```

**What this is:** code splitting (here via React `lazy`) means the bundler puts each of those pages in its own separate JS file, downloaded only the first time that route is visited. So the home page never pays the cost of downloading the big admin screen. `Suspense` renders `null` while the chunk is in flight. You can see the split in `dist/assets/`: `AddMovies-*.js`, `MovieDetails-*.js`, `EpisodePage-*.js` are separate files.

**5. `HomePage` mounts and fires the API call inside `useEffect`:**

```jsx
useEffect(() => {
  let active = true;
  const request = filteredMode
    ? moviesApi.list({ all: 1 }).then((r) => { ... })
    : moviesApi.list({ page, limit: PAGE_SIZE }).then((r) => { ... });
  request.catch(() => {});
  return () => { active = false; };
}, [filteredMode, tag, q, page]);
```

**What this is:** `useEffect` is React's way of running side effects (network requests, timers, subscriptions) *after* rendering. Effects can return a cleanup function that runs when the component unmounts or the dependencies change — here `active` is set to `false`, so a stale response that arrives after a redirect is ignored instead of overwriting the new page.

Two modes live in that one effect:

- **Default view** → `GET /api/movies?page=1&limit=20` — one light page at a time from the server.
- **Filtered view** (any `tag`/`q`/`lang`/`genre`/`year`/`type`/`ott` in the URL) → `GET /api/movies?all=1` — the whole light list once, then filtering/sorting/pagination happens in the browser. This is a deliberate trade: filters are instant once loaded, at the cost of one bigger (but still trimmed) response.

`frontend/src/api/moviesApi.js` builds the URL and caches it:

```js
const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");
const API = baseUrl ? `${baseUrl}/api/movies` : "/api/movies";
```

The `listCache` Map in the same file means going Home → Details → Back does not refetch the list, and `add`/`update`/`remove` call `listCache.clear()` so your new movie appears immediately.

**6. Express receives the request.** `backend/server.js` runs three pieces of middleware first. **What this is:** middleware is a chain of functions Express runs on every request before the route handler (parse body, check permissions, compress, log…).

```js
app.use(cors({ origin: corsOrigin }));
app.use(compression()); // gzip JSON — the movie list shrinks ~5-10x on the wire
app.use(express.json());
```

**What this is:** `compression()` is gzip — the response is squeezed before being sent and the browser unzips it, which matters a lot for the `?all=1` list.

**7. The route handler queries MongoDB with a projection.** From `backend/routes/movieRoutes.js`:

```js
const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
const [movies, total] = await Promise.all([
  Movie.find().select(LIST_PROJECTION).sort(sort)
    .skip((page - 1) * limit).limit(limit).lean(),
  Movie.countDocuments(),
]);
```

**What this is:** a *projection* (`select("-field")`) tells MongoDB to leave those fields out of the result. Download links, per-episode URLs, screenshots and the long synopsis are the bulky parts of a document and the grid never shows them, so the list endpoint skips them — the `?all=1` payload stays small. `.lean()` tells Mongoose to return plain JSON-friendly objects instead of full document objects (faster, smaller). `Promise.all` runs the page query and the `count` in parallel. The response shape is `{ movies, total, page, totalPages }`, sorted by `publishedAt` descending so the newest is first.

**8. The JSON travels back and React renders the grid.** `HomePage` maps every document through `transformPublished` (`frontend/src/assets/moviesStore.js`), which renames the raw database fields into the shape the UI expects everywhere (`tmdbId` → `id`, `mediaType` → `type` = `"Movie"|"Series"`, `poster` → `imageUrl`, plus a placeholder poster when none was saved, and a merge of legacy `seasonEpisodes` into each quality's `seasons`). Then `frontend/src/components/Postcards.jsx` draws one card per movie:

```jsx
<img src={imgSrc} alt={title} className="movie-card-img"
     width="300" height="450" loading="lazy" decoding="async" />
```

**What this is:** `loading="lazy"` tells the browser not to download an image until it is close to the viewport, so a 20-poster page does not fetch 20 posters up front. Fixed `width`/`height` reserve the space so the page does not jump as images arrive.

**9. Posters come from TMDB's image CDN, not from you.** The `poster` field in MongoDB is a *path* like `/abc123.jpg`, and `frontend/src/hooks/useTmdbMovie.js` turns it into a full URL:

```js
const TMDB_IMG = "https://image.tmdb.org/t/p";
export const tmdbPoster = (path, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
```

So the `<img>` on a card points at `https://image.tmdb.org/t/p/w500/abc123.jpg`. Different sizes (`w92` thumbnails in the admin search, `w500` posters, `w780` screenshots, `w1280` backdrops, `w300` episode stills) are the same image at different resolutions — smaller ones are cheaper to download.

**What changes on the details page.** `/movie-details/12345` does all of the above plus: `moviesApi.get(id)` fetches the *full* document (with download links), `useTmdbMovie` calls TMDB for live metadata (details + credits + images, and each season for series — the season fetches are started in parallel with the details request), and `MovieDetails.jsx` merges the two with the rule "TMDB wins, stored value is the fallback" (`const title = t.title || movie.title;`). If TMDB fails or the key is missing, a second "rescue" effect fetches just the backdrops so screenshots still look real.

### Repo folder tree, one line per file

```
moviesmod/
├── .gitignore                          # keeps node_modules, dist and .env secrets out of git
├── README.md                           # setup instructions and stack summary (human-facing)
├── docs/sections/                      # this documentation
│
├── backend/                            # ── Express + MongoDB API ──
│   ├── .env                            # real secrets (MONGODB_URI, ADMIN_PASSWORD, PORT); never committed
│   ├── .env.example                    # template showing which variables the server expects
│   ├── .gitignore                      # ignores node_modules and .env
│   ├── package.json                    # dependencies + scripts: "dev" = node --watch server.js, "start" = node server.js
│   ├── package-lock.json               # auto-generated exact dependency versions (do not hand-edit)
│   ├── server.js                       # entry point: dotenv, CORS, gzip, JSON parsing, mounts /api/movies, starts listening
│   ├── config/
│   │   └── db.js                       # connectDB(): one Mongoose connection, warns if the URI has no database name
│   ├── models/
│   │   └── Movie.js                    # the Movie schema: tmdbId, mediaType, downloadLinks (nested seasons/episodes), publishedAt + index
│   └── routes/
│       └── movieRoutes.js              # all five endpoints (list, get one, create, update, delete) + admin password check
│
└── frontend/                           # ── React + Vite SPA ──
    ├── .env                            # local VITE_ variables (currently only VITE_TMDB_API_KEY)
    ├── .env.example                    # template incl. VITE_API_BASE_URL for production
    ├── .gitignore                      # ignores node_modules, dist, .env
    ├── eslint.config.js                # linting rules (JS recommended + react-hooks + react-refresh), ignores dist
    ├── index.html                      # the single HTML shell: #root div, fonts, Bootstrap CSS, Font Awesome, preconnects
    ├── package.json                    # dependencies (react, react-dom, react-router-dom) + scripts (dev/build/lint/preview)
    ├── package-lock.json               # auto-generated exact dependency versions
    ├── vercel.json                     # rewrite every path to /index.html so deep links like /movie-details/123 work on Vercel
    ├── vite.config.js                  # minimal Vite config; just registers the React plugin
    ├── public/
    │   └── favicon.png                 # browser-tab icon, copied as-is into the build
    └── src/
        ├── main.jsx                    # boots React, renders <App/> into #root inside StrictMode
        ├── App.jsx                     # route table + lazy-loaded (code-split) pages
        ├── App.css                     # one rule: dark body background and white text
        ├── index.css                   # global reset: box-sizing, image sizing, base typography, smooth scroll
        ├── api/
        │   └── moviesApi.js            # the only place that talks to your API: list/get/add/update/remove + admin password storage + list cache
        ├── hooks/
        │   └── useTmdbMovie.js         # custom hook that calls TMDB for a title and normalises the result (also exports poster/backdrop URL helpers)
        ├── assets/
        │   ├── Tags.js                 # language/genre code tables, sidebar tag rules and OTT bucket heuristics
        │   ├── movieDetails.js         # builds the "release-style" display data: release title, blurb, categories, download label list, screenshots
        │   ├── moviesStore.js          # transformPublished(): converts a raw MongoDB document into the app's canonical movie shape
        │   ├── moviesmod.png           # header logo image
        │   └── tgmoviesmod.jpg         # "Join us on Telegram" banner in the sidebar
        ├── components/
        │   ├── Alert.jsx               # dismissible "we moved our domain" banner on the home page
        │   ├── Alert.css               # styles for that banner
        │   ├── Navbar.jsx              # logo, search box, and the mega-menu of filter links built from a navItems array
        │   ├── Navbar.css              # navbar + dropdown styling (incl. mobile menu toggle)
        │   ├── Social.jsx              # row of quick-filter buttons under the navbar (English Movies, Anime, K-Drama…)
        │   ├── Social.css              # styling for those buttons
        │   ├── Postcards.jsx           # MovieGrid + PosterCard: the poster card used by the grid and related posts
        │   ├── Postcards.css           # poster grid layout and card hover effects
        │   ├── Pagination.jsx          # numbered page bar with ellipsis logic (1 … 4 5 6 … 20) + prev/next
        │   ├── Pagination.css          # pagination styling
        │   ├── Footer.jsx              # static footer links (DMCA, Contact Us…)
        │   ├── Footer.css              # footer styling
        │   ├── MovieHeader.jsx         # details-page breadcrumb, big release title and "uploaded X days ago" line
        │   ├── MovieHeader.css         # header/breadcrumb styling
        │   ├── MovieInfoCard.jsx       # the IMDb-style info box: poster, rating, plot, director, actors
        │   ├── MovieInfoCard.css       # info card styling
        │   ├── SeriesInfo.jsx          # "Movie Info / Series Info" bullet list (name, year, seasons, size, quality) + storyline
        │   ├── SeriesInfo.css          # info list styling
        │   ├── Screenshots.jsx         # screenshot row that hides any image whose URL fails to load
        │   ├── Screenshots.css         # screenshot grid styling
        │   ├── DownloadSection.jsx     # movie download buttons + the colour-coded quality label parser
        │   ├── DownloadSection.css     # download buttons/labels styling (also used by series and admin preview)
        │   ├── SeriesSeasons.jsx       # series version: per quality, a Batch/Zip button and an "Episodes (n)" link per season
        │   ├── RelatedPosts.jsx        # "RELATED POSTS" row reusing PosterCard
        │   ├── RelatedPosts.css        # related posts styling
        │   ├── CommentSection.jsx      # comment form; purely visual — submit is prevented and nothing is stored
        │   ├── CommentSection.css      # comment form styling
        │   ├── Sidebar.jsx             # details-page sidebar: search box, Telegram banner, tag chips, popular posts
        │   ├── Sidebar.css             # sidebar styling
        │   ├── Socialmini.jsx          # smaller quick-filter button row used mid-page on details
        │   └── Socialmini.css          # styling for those buttons
        └── pages/
            ├── HomePage.jsx            # route "/" : decides server-paged vs client-filtered mode, applies filters, renders the grid
            ├── HomePage.css            # home layout, search-results note, grid wrapper
            ├── MovieDetails.jsx        # route "/movie-details/:id": loads doc + TMDB data, merges them, assembles the whole page
            ├── MovieDetails.css        # details page layout (content column + sidebar)
            ├── AddMovies.jsx           # route "/AddMovies": TMDB search, link builder, season/episode editor, publish/update/delete, admin modal
            ├── AddMovies.css           # admin panel, chips, forms, modal styling
            ├── EpisodePage.jsx         # route "/series/:movieId/season/:seasonNum": episode buttons for one season/quality
            └── EpisodePage.css         # episode page styling
```

(Not listed: `node_modules/` — installed dependencies, and `frontend/dist/` — the build output Vercel generates.)

### Environment variables

Five variables matter. Two live in `frontend/.env` (baked into the bundle), three in `backend/.env` (kept on the server).

| Variable | Lives in | What it does | Dev value | Production value |
| --- | --- | --- | --- | --- |
| `VITE_TMDB_API_KEY` | `frontend/.env` (and set in the Vercel dashboard) | Your TMDB v3 API key. Used by `useTmdbMovie.js`, `MovieDetails.jsx` (screenshot rescue) and `AddMovies.jsx` (search + details). Without it, pages still render from stored data but lose live ratings/genres/screenshots, and the admin search does not work at all. | The key from your TMDB account | Same key, set in Vercel → Project → Settings → Environment Variables. Treat it as public — restrict it in your TMDB account settings |
| `VITE_API_BASE_URL` | `frontend/.env` (and Vercel) | Root URL of the backend, used by `moviesApi.js` to build `${baseUrl}/api/movies`. | Can be omitted: when missing, the code falls back to `http://localhost:5000` in dev (`import.meta.env.DEV`). Your local `.env` currently omits it, so it works. | **Must be set** to your deployed backend URL with no trailing slash (e.g. `https://your-backend.onrender.com`). If left empty in a production build, the app requests `/api/movies` from its own Vercel domain, where nothing serves it |
| `MONGODB_URI` | `backend/.env` (and the host's dashboard) | Atlas connection string, e.g. `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/moviesmod?retryWrites=true&w=majority`. `config/db.js` connects with it and warns if the database name is missing. | Local `.env` value | Set on the Node host. Keep the `/moviesmod` database name in it |
| `ADMIN_PASSWORD` | `backend/.env` | The password for edit/delete. Checked by `verifyAdmin` middleware (`x-admin-password` header) and by `POST /api/movies/verify-admin` (body `{ password }`). | Your chosen password | Set on the host; long and random, since it is the only thing protecting edits |
| `CORS_ORIGIN` | `backend/.env` | Which browser origins may call the API. Comma-separated list is supported; falls back to `"*"` when unset. | Omit (or `http://localhost:5173`) | Your Vercel domain, e.g. `https://your-app.vercel.app` |

Three footnotes on that table:

- **`VITE_` variables are build-time constants, not runtime config.** Changing `frontend/.env` requires a restart of the dev server, and changing it in production requires a *redeploy* — the value is written into the JS files.
- **`PORT`** also exists in `backend/.env` (`process.env.PORT || 5000`). Locally it is 5000; on hosts like Render the platform injects `PORT` and your code picks it up automatically.
- **`TMDB_API_KEY` in `backend/.env` is dead configuration.** No file under `backend/` reads it (grep for `process.env` in the backend finds only `CORS_ORIGIN`, `PORT`, `ADMIN_PASSWORD`, `MONGODB_URI`). All TMDB calls happen in the browser. You can delete it or leave it; it does nothing.

### Running the project locally

Two terminals, because there are two programs.

```bash
# Terminal 1 — the API (http://localhost:5000)
cd backend
npm install
npm run dev        # runs: node --watch server.js

# Terminal 2 — the frontend (http://localhost:5173)
cd frontend
npm install
npm run dev        # runs: vite
```

What each command actually does:

- `node --watch server.js` starts Express and **restarts it automatically whenever a backend file changes** — Node's built-in equivalent of hot reload. Expect a `MongoDB Connected: ...` log line on success, and a whitelist error if your IP is not allowed in Atlas (the error message in `server.js` links to the exact Atlas page to fix it).
- `vite` starts a dev server on port 5173 that serves your source files as-is. **What this is:** Vite is the build tool and dev server; while developing it uses native ES modules plus instant hot module replacement (HMR — edited code appears in the browser without a full reload and without losing component state).
- Then open **`http://localhost:5173`**. The browser talks to Vite on 5173, and Vite's page talks to Express on 5000 — that cross-port request is exactly why `CORS_ORIGIN`/`"*"` matters in dev.

Useful extras: `npm run build` in `frontend/` produces the production bundle in `dist/`, and `npm run preview` serves that bundle locally so you can test the built version; `npm run lint` runs ESLint over the frontend.

### What happens on deploy

**Frontend → Vercel.** Vercel detects Vite, runs `npm run build`, and serves `frontend/dist` from its CDN. Three consequences:

- **`vercel.json` makes deep links work.**
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
  **What this is:** a rewrite sends every URL to the same `index.html`, letting React Router read the real path from the address bar. Without it, refreshing `https://your-app.vercel.app/movie-details/12345` would 404, because Vercel would look for a file at that path.
- **Environment variables must be added in the Vercel dashboard** (`VITE_TMDB_API_KEY`, `VITE_API_BASE_URL`), then a redeploy triggered — they are compiled into the bundle at build time.
- **The output is hashed and split.** Each deploy gets files like `MovieDetails-o6rhZJA-.js`; the hash changes only when that chunk's contents change, so returning visitors reuse their cached files and only re-download what changed.

**Backend → a Node host (Render per the comments in `backend/.env.example`).** The host runs `npm start` (`node server.js`), gives you a public URL, and injects `PORT`. You set `MONGODB_URI`, `ADMIN_PASSWORD` and `CORS_ORIGIN` in that host's dashboard. Two Atlas-specific gotchas: add the host's outgoing IPs to Atlas → Network Access (or allow `0.0.0.0/0`), and keep the database name inside `MONGODB_URI` — `config/db.js` prints a warning if it is missing, because without it Mongoose silently writes to a default database and your data appears to vanish.

**The full path of one production request.** Visitor's browser → Vercel CDN (HTML, CSS, hashed JS) → your Render URL for `/api/movies?...` (allowed by `CORS_ORIGIN`, gzipped by `compression()`) → Atlas over Mongoose → back as JSON → React renders the grid → `<img>` tags fetch posters from `image.tmdb.org`.

### Key takeaways

- Two apps in one repo: a React SPA in `frontend/` that does all rendering, and an Express API in `backend/` that is the only thing allowed to touch MongoDB. They communicate only through JSON at `/api/movies`.
- `tmdbId` is the universal key: it is the MongoDB unique field, the URL segment, and the TMDB lookup value.
- Four routes total — `/`, `/movie-details/:id`, `/AddMovies`, `/series/:movieId/season/:seasonNum` — and every filter (tag, search, language, genre, year, type, OTT) is just a query string on `/`.
- The home page has two data modes: server-paginated by default (`?page=&limit=`), and one full light list (`?all=1`) filtered in the browser when a filter/search/tag is active.
- List responses use a MongoDB projection to drop download links, screenshots and overview, so grids stay cheap; the single-movie endpoint returns everything.
- TMDB is called **from the browser** for metadata and images, which is why `VITE_TMDB_API_KEY` is public-by-design and why details pages need it to look complete. Stored MongoDB values are always the fallback.
- Secrets split cleanly: `VITE_*` variables ship to visitors; `MONGODB_URI`, `ADMIN_PASSWORD` and `CORS_ORIGIN` stay on the server. `TMDB_API_KEY` in the backend `.env` is unused.
- Adding a movie needs no password; editing and deleting check `ADMIN_PASSWORD` via the `x-admin-password` header, and the frontend keeps it in `sessionStorage` for the tab's session.
- Locally: `npm run dev` in both folders, use `http://localhost:5173`. Deployed: Vercel for the frontend (with the `vercel.json` rewrite and `VITE_API_BASE_URL` set), a Node host for the backend (with Atlas IP access and `CORS_ORIGIN` locked to your domain).
## 01. Backend — Express Server & MongoDB

The backend of this site is a small HTTP API. It has one job: sit between the React frontend and a MongoDB database, and answer questions like "give me the 20 newest movies" or "save this movie". The frontend never talks to MongoDB directly — it only talks to this API over HTTP.

Five files make up the whole backend:

| File | Job |
|---|---|
| `backend/package.json` | Declares the dependencies and the start commands |
| `backend/server.js` | Entry point: starts Express, wires up middleware, listens on a port |
| `backend/config/db.js` | Connects to MongoDB (Atlas) through Mongoose |
| `backend/models/Movie.js` | Defines the shape of a movie document |
| `backend/routes/movieRoutes.js` | The actual API endpoints (list, get one, create, update, delete, admin check) |

### The big picture: one request's journey

```
Browser (React)
   |
   |  GET /api/movies?page=2
   v
server.js  -- cors -> compression -> express.json -> router mount
   |
   v
movieRoutes.js  (matches GET /, runs the Mongoose query)
   |
   v
Movie.js model  (translates the query into MongoDB language)
   |
   v
MongoDB Atlas (the database, running in the cloud)
```

Then the response travels back the same way, getting gzip-compressed on the way out.

---

### backend/package.json — the backend's manifest

**What this is:** `package.json` is Node's project description file. It lists the name, the commands you can run, and the third-party libraries ("dependencies") the project needs. `npm install` reads it and downloads everything into `node_modules/`.

```json
"type": "module",
"scripts": {
  "dev": "node --watch server.js",
  "start": "node server.js"
},
```

- **`"type": "module"`** — this is why every file uses `import express from "express"` instead of the older `const express = require("express")`. The modern `import` syntax is called ESM (ES Modules). Without this line, Node would refuse to run the `import` statements.
- **`npm run dev`** — starts the server with `--watch`, which makes Node automatically restart whenever you edit and save a source file. This is the command you use while developing.
- **`npm start`** — plain start, no auto-reload. This is what a hosting service (Render, Railway, etc.) runs in production.

The dependencies, one by one:

| Package | What it does here |
|---|---|
| `express` | The web server framework. Turns an ordinary Node script into a program that can receive HTTP requests. |
| `mongoose` | The translator between JavaScript objects and MongoDB documents (an "ODM" — explained below). |
| `mongodb` | The low-level MongoDB driver that Mongoose itself is built on. It's listed explicitly but this code only uses Mongoose. |
| `cors` | Middleware that lets a browser on a different domain call this API. |
| `compression` | Middleware that gzips responses before sending them. |
| `dotenv` | Loads the `.env` file into `process.env`. |

---

### backend/server.js — the entry point

**What this is:** Express is the most popular Node.js web framework. You create an "app" object, tell it which middleware to run and which URLs to respond to, and then start listening on a port. A *middleware* is just a function that gets a chance to look at every incoming request before it reaches your route handlers — and can modify the request, short-circuit it, or add something to the response.

#### Loading environment variables

```js
dotenv.config();
```

**What this is:** *Environment variables* are settings that live outside your code — database passwords, port numbers, the admin password. They matter because you don't want secrets committed to Git, and because a cloud host needs to give you a different port than your laptop uses. `dotenv` reads a file called `backend/.env` (which is in `.gitignore`) and copies every line into `process.env`, the standard Node object for these settings. The file `backend/.env.example` documents which variables the app expects:

- `MONGODB_URI` — the connection string (required)
- `PORT` — optional; cloud hosts set it automatically
- `CORS_ORIGIN` — optional; which websites may call this API
- `ADMIN_PASSWORD` — the password for edit/delete (required)

#### Deciding who is allowed to call the API (CORS)

```js
const corsOrigin = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.includes(",")
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : process.env.CORS_ORIGIN)
  : "*";

app.use(cors({ origin: corsOrigin }));
```

**What this is:** *CORS* (Cross-Origin Resource Sharing) is a browser security rule. A browser will normally block a web page at `https://mysite.com` from reading responses coming from `https://api.other.com`. The server has to explicitly say "I allow requests from that origin" by sending a header. The `cors` package adds those headers for you.

This block is a small piece of configuration logic:

- If `CORS_ORIGIN` is **not set** at all → fall back to `"*"`, meaning *any* website may call the API. Convenient for development, loose for production.
- If it is **set and contains a comma** → split it into a list and trim the spaces. So `CORS_ORIGIN=https://a.com,https://b.com` becomes an array of two allowed origins.
- If it is set with **just one domain** → use it as-is.

`app.use(...)` means "run this middleware on *every* request, no matter the URL".

#### The middleware chain

```js
app.use(cors({ origin: corsOrigin }));
app.use(compression()); // gzip JSON — the movie list shrinks ~5-10x on the wire
app.use(express.json());
```

Express runs these in the order written, for every request:

1. **`cors(...)`** — adds the `Access-Control-Allow-Origin` headers described above. It has to run early because browsers send a "preflight" `OPTIONS` request before some real requests, and that needs an answer.
2. **`compression()`** — **What this is:** *gzip compression* squeezes a response before sending it and the browser un-squeezes it. Text like JSON has lots of repetition (`"downloadLink"`, `"resolution"` repeated hundreds of times), so it compresses extremely well — the code comment says the movie list shrinks 5–10x. That's the difference between a 500 KB and a 50 KB download for your visitors.
3. **`express.json()`** — a *body parser*. When a client sends a POST/PUT with a JSON body, the body arrives as raw bytes on the network stream. This middleware reads the stream and turns it into a JavaScript object attached to `req.body`. Without it, `req.body` would be `undefined` and creating a movie would fail.

#### The two routes defined directly in server.js

```js
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/movies", movieRoutes);
```

- `GET /` is a health check. Visiting the root URL in a browser shows plain text; it's also what uptime monitors ping to know the server is alive.
- `app.use("/api/movies", movieRoutes)` hands off everything starting with `/api/movies` to the router in `backend/routes/movieRoutes.js`. That's why the route file only writes `"/"` and `"/:tmdbId"` — the `/api/movies` prefix is added here.

#### Listening, and connecting to the database

```js
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err.message);
  console.error("Add your current IP to MongoDB Atlas whitelist: https://cloud.mongodb.com/v2/ -> Network Access -> Add IP Address");
});
```

- `process.env.PORT || 5000` — "use whatever port the host assigned, otherwise 5000". Cloud platforms inject `PORT` because they may run several apps on one machine.
- Note that `connectDB()` is **not awaited** and is called *after* `app.listen`. That's deliberate: the HTTP server starts immediately, so a slow or broken database connection doesn't stop the server from booting (the routes will just fail until Mongo is reachable). Any connection error lands in that `.catch(...)`, which prints a human-friendly hint — the single most common cause of a failed connection with Atlas is your IP address not being on the allow-list.

One thing server.js does **not** have: a global 404 handler or a central error-handler middleware. Instead, every route in `movieRoutes.js` wraps itself in its own `try/catch` and sends its own error response (see "Error handling style" at the end).

---

### backend/config/db.js — connecting to MongoDB

#### What MongoDB and Atlas are

**What this is:** *MongoDB* is a document database. Instead of tables with rows and fixed columns (like SQL), it stores flexible JSON-like **documents** grouped into **collections**. A whole movie — title, cast array, nested download links — is one document in the `movies` collection. That flexibility fits this project well, because a movie and a TV show have quite different download structures.

*MongoDB Atlas* is MongoDB's official hosted/cloud version — the company runs the database servers for you, you connect over the internet with a URL, and you manage it in a web console at cloud.mongodb.com. That's why the connection string looks like `mongodb+srv://...mongodb.net/...` and why "add your IP to the whitelist" is a thing: Atlas refuses connections from unknown IP addresses by default.

#### What Mongoose is

**What this is:** *Mongoose* is an ODM — "Object-Document Mapper". Raw MongoDB calls take plain objects and enforce nothing. Mongoose lets you declare a **schema** (the allowed fields and their types) and then gives you a **model**, a JavaScript class whose methods (`find`, `findOne`, `create`, ...) translate into database queries. So `Movie.find()` is readable code that Mongoose turns into the actual MongoDB command.

#### The connection function

```js
const conn = await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
```

- `async`/`await` — **What this is:** talking to a database takes time, so the call returns a *Promise* instead of the result immediately. `await` pauses the function until the promise settles, letting you write asynchronous code that reads top-to-bottom instead of nesting callbacks.
- `serverSelectionTimeoutMS: 10000` — give up after 10 seconds if no server can be reached. Without a cap, a bad URI or blocked IP can hang the request for the default 30 seconds, which makes the failure much slower to notice.

#### The "my data vanished" guard

```js
if (!conn.connection.name) {
  console.warn(
    "⚠️  MONGODB_URI has no database name (add /moviesmod before the '?')." +
    " Data is going into a default database and may appear 'missing' later."
  );
}
console.log(`MongoDB Connected: ${conn.connection.host} / db: ${conn.connection.name || "(default)"}`);
```

This is a guard against a genuinely sneaky Atlas mistake. An Atlas URI looks like:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/moviesmod?retryWrites=true&w=majority
                                                    ^^^^^^^^ the database name
```

If you forget the `/moviesmod` part, the connection still **succeeds** — MongoDB just silently puts everything into a fallback database (`test`). Your data isn't lost, but it's in the wrong place, so the site looks empty. Since Mongoose doesn't error, this code checks `conn.connection.name` and warns loudly instead of letting you debug it for an hour.

Finally, on failure the function logs and `throw error;` — which is what gets caught by the `.catch(...)` in `server.js`. `connectDB` is exported as the default export and imported at the top of `server.js`.

---

### backend/models/Movie.js — the Movie schema

This file defines what a movie document looks like. There are two schemas here: a small reusable one for download links, and the main movie one.

#### The reusable downloadLinkSchema

```js
const downloadLinkSchema = new mongoose.Schema({
  resolution: String,
  quality: String,
  audioTag: String,
  size: String,
  customSuffix: String,
  label: String,
  downloadLink: String,
  episodeLink: String,
  batchLink: String,
  seasons: [ ... ],
}, { _id: false });
```

A movie's download section on the website is a list of "quality rows" — e.g. *480p / 720p / 1080p*, each with its own button. Each row is one document in the `downloadLinks` array, and every field here is one piece of text that row displays or links to:

| Field | What it means on the site |
|---|---|
| `resolution` | The video resolution, e.g. `"480p"`, `"720p"`, `"1080p"`, `"2160p"`. Shown as the row's main label. |
| `quality` | Extra quality wording, e.g. `"WEB-DL"`, `"HDRip"`, `"10bit"`. Qualifies *how* the encode was made. |
| `audioTag` | The audio track description, e.g. `"Hindi 5.1"`, `"English 2.0"`, `"Dual Audio"`. One row per audio option when a release has multiple. |
| `size` | File size, e.g. `"450MB"`, `"2.1GB"` — so visitors can judge the download before clicking. |
| `customSuffix` | Free-form extra text appended to the row's label, for anything the fixed fields don't cover. |
| `label` | The exact button text. If set it overrides/clarifies the auto-built label; if empty the UI builds one from resolution + quality + audioTag. |
| `downloadLink` | The actual URL the download button opens (the file host link). |
| `episodeLink` | A link to a **single episode** — used for TV entries when a row points at one episode rather than a movie file. |
| `batchLink` | A link to a **batch** download — a zip of a whole season or a whole series in one file. |
| `seasons` | Only for TV. An array of season objects, each with its own per-episode links (structure below). |

Two things to notice:

- **`{ _id: false }`** — MongoDB gives every document an auto-generated `_id`. For these small link rows an id is pure noise (they're never looked up individually, only displayed as part of their parent movie), so it's switched off to keep documents smaller.
- **Nothing is `required`.** These are all display strings supplied from the admin form; a movie row can legitimately omit `size` or `audioTag`.

#### The nested seasons → episodes arrays

```js
seasons: [
  {
    season: Number,
    batchLink: String,
    episodes: [
      {
        episodeNumber: Number,
        episodeLink: String,
      },
    ],
  },
],
```

This is a **three-level nested array**: movie → seasons → episodes. For a TV show, the download card can render:

- one **"Download Season 2 (batch)"** button per season from `season.batchLink`, and/or
- a per-episode list ("Episode 1", "Episode 2", ...) from `episodes[]`, where `episodeNumber` is the display number and `episodeLink` is the URL.

Movies simply leave `seasons` empty. This is exactly why MongoDB was a good pick — modelling this in SQL tables would need three linked tables.

#### The main movieSchema, field by field

```js
tmdbId:      { type: Number, required: true, unique: true },
mediaType:   { type: String, enum: ["movie", "tv"], required: true },
```

- **`tmdbId`** — the ID of the title on [TMDB](https://www.themoviedb.org) (The Movie Database, the public movie-metadata API the site pulls posters and descriptions from). It is **`required`** (saving without one fails validation) and **`unique`** (MongoDB builds a unique index, so two documents with the same ID are impossible at the database level). It doubles as the public URL identifier — the site routes to `/movie/968051`-style paths and the API looks movies up by this field, not by MongoDB's internal `_id`.
- **`mediaType`** — `"movie"` or `"tv"`. `enum` means any other value is rejected by validation, so nothing can accidentally save with a typo like `"series"`. The frontend uses this to switch between a movie detail page and a TV detail page.

The descriptive fields — most come straight from the TMDB API response:

```js
title:       { type: String, required: true },
poster:      String,
genre:       String,
lang:        { type: String, default: "English" },
imdbID:      { type: String, default: "" },
overview:    { type: String, default: "" },
rating:      { type: Number, default: 0 },
votes:       { type: Number, default: 0 },
runtime:     Number,
released:    String,
director:    { type: String, default: "" },
writer:      { type: String, default: "" },
actors:      [{ type: String }],
```

| Field | Meaning on the site |
|---|---|
| `title` | Display name. The only other required field. |
| `poster` | URL of the poster image shown in the grid and on the detail page header. |
| `genre` | e.g. `"Action, Sci-Fi"` — shown as a badge / used in filtering. |
| `lang` | Language of the release. Defaults to `"English"` so the admin form doesn't have to fill it every time. |
| `imdbID` | Optional IMDb identifier, used to build an "IMDb" external link. Empty string by default rather than null, so the frontend never has to null-check it. |
| `overview` | The plot synopsis paragraph. Note this is one of the fields stripped from list responses (see `LIST_PROJECTION`) because it's long. |
| `rating` | The TMDB score, e.g. `7.4`, displayed as the star/rating badge. |
| `votes` | Number of TMDB votes behind that score. |
| `runtime` | Length in minutes. Left without a default — absent means "not applicable / unknown". |
| `released` | Release date as a plain string. Stored as text (not a real Date) because it's only ever displayed verbatim. |
| `director`, `writer` | Credit strings for the detail page. |
| `actors` | Array of cast names, rendered as the cast list. |

The structural fields:

```js
downloadLinks: [downloadLinkSchema],
seasonEpisodes: [downloadLinkSchema],
screenshots: [{ type: String }],
publishedAt: { type: Date, default: Date.now },
```

- **`downloadLinks`** — array of the quality rows described above. This is what a *movie* entry uses.
- **`seasonEpisodes`** — **the same schema again**, a second array. This is the TV-shaped set of rows: for shows, the admin puts the season/episode structures in here instead of in `downloadLinks`. The frontend then renders `downloadLinks` as simple quality buttons and `seasonEpisodes` as the season/episode browser. Having two separate arrays keeps "movie-style" and "tv-style" links from mixing in one list.
- **`screenshots`** — array of image URLs (the preview stills gallery on the detail page).
- **`publishedAt`** — a real JavaScript `Date`. `default: Date.now` stamps the moment of creation if the client doesn't send one — this is what the homepage sorts by ("newest first").

One line at the bottom does two extra things:

```js
{ timestamps: true }
```

**What this is:** Mongoose's `timestamps` option automatically adds and maintains two fields on every document: `createdAt` (set once on save) and `updatedAt` (rewritten on every modification). These are for housekeeping/debugging — the site itself sorts by `publishedAt`, not `timestamps`.

And finally:

```js
const Movie = mongoose.model("Movie", movieSchema);
export default Movie;
```

`mongoose.model("Movie", ...)` compiles the schema into a usable model. Mongoose derives the collection name by lowercasing and pluralizing — so documents live in a collection called `movies`.

---

### backend/routes/movieRoutes.js — the REST API

**What this is:** *REST* is the convention that URLs name resources and HTTP verbs name the action: `GET` to read, `POST` to create, `PUT` to update, `DELETE` to remove. `express.Router()` is Express's way of grouping those routes in a separate file; the group is mounted in `server.js` at `/api/movies`, so `router.get("/")` here really means `GET /api/movies`.

#### The MOVIE_FIELDS whitelist

```js
const MOVIE_FIELDS = [
  "tmdbId", "mediaType", "title", "poster", "genre", "lang",
  "imdbID", "overview", "rating", "votes", "runtime",
  "released", "director", "writer", "actors",
  "downloadLinks", "seasonEpisodes", "screenshots",
];

const pickMovieFields = (body) =>
  MOVIE_FIELDS.reduce((data, field) => {
    if (body[field] !== undefined) data[field] = body[field];
    return data;
  }, {});
```

**What this is:** *whitelisting* means "ignore everything except this approved list", as opposed to *blacklisting* ("reject these bad ones"). It matters because taking `req.body` as-is would let a client overwrite any field — including `publishedAt` (fake the "newest" ordering) and tamper with identity fields.

`pickMovieFields` builds a fresh object containing only the allowed keys that are actually present in the request body. (`reduce` walks the array while accumulating a result — here, the cleaned object.) Note that `publishedAt` is deliberately **absent** from the list, so a client can never set it; it's always the server's `Date.now` default. `tmdbId` *is* in the list because creating a movie obviously needs one — but see the PUT handler, which strips it back out for updates.

#### The verifyAdmin middleware

```js
const verifyAdmin = (req, res, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return res.status(500).json({ message: "ADMIN_PASSWORD is not configured on the server" });
  }
  const providedPass = req.headers["x-admin-password"];
  if (!providedPass || providedPass !== adminPass) {
    return res.status(401).json({ message: "Unauthorized: Invalid or missing admin password" });
  }
  next();
};
```

**What this is:** a route *middleware* is a function that runs before the handler for specific routes. It receives `(req, res, next)`; calling `next()` says "OK, continue to the actual handler", while returning a response stops the chain right there.

This one is attached to PUT and DELETE. Step by step:

1. If `ADMIN_PASSWORD` was never set in `.env`, it's a **server misconfiguration**, so it returns `500` (server error) rather than pretending the password was wrong.
2. It reads the password from the **`x-admin-password` HTTP header** — a custom header the frontend adds to every edit/delete request. A header is used instead of the request body because DELETE usually has no body at all, and because the password then travels identically for every request type.
3. No header, or wrong value → `401 Unauthorized` and the update never runs.
4. Otherwise `next()` hands control to the handler.

Worth being clear-eyed about: this is a **single shared password compared with a plain string equality check**. There are no user accounts, no hashing, no tokens. Anyone who reads the header (or guesses the password) can edit or delete. That's a reasonable trade-off for a personal project with one admin, but it's the least secure part of the codebase — over plain HTTP it would also be readable in transit, so this assumes HTTPS (which hosts provide by default).

#### POST /verify-admin — the login check

```js
router.post("/verify-admin", (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  const { password } = req.body || {};
  if (!adminPass) {
    return res.status(500).json({ success: false, message: "ADMIN_PASSWORD is not configured on the server" });
  }
  if (password === adminPass) {
    return res.json({ success: true, message: "Admin verified successfully" });
  }
  return res.status(401).json({ success: false, message: "Invalid admin password" });
});
```

This is the endpoint the admin login form posts to. It doesn't create a session or a token — it just answers yes/no, and the frontend remembers the answer to unlock its edit/delete UI. The real security still lives in `verifyAdmin` on each protected route; this endpoint is a convenience so the UI can tell the user "wrong password" before attempting an edit. Note the `{ success, message }` response shape here, versus the plain `{ message }` used everywhere else.

Route-ordering detail: `POST /verify-admin` is registered **before** `POST /`, and Express matches in registration order. That matters because `/:tmdbId`-style parameter routes otherwise swallow plain paths.

#### GET /api/movies — the list endpoint

```js
const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;
```

**What this is:** a *projection* tells MongoDB which fields to return. A leading minus means "exclude these". The database then doesn't even read/transfer those fields, which is much cheaper than sending them and throwing them away in JavaScript.

Why these five are excluded from lists:

- `downloadLinks`, `seasonEpisodes`, `screenshots` — the heavy nested arrays. A grid card and a sidebar row only show poster, title, rating, genre. Including them would mean shipping potentially hundreds of episode URLs per page for nothing.
- `overview` — a long paragraph; multiplies the response size across 20–60 items.
- `__v` — Mongoose's internal document version counter. Never useful to a client.

The handler itself:

```js
const sort = { publishedAt: -1, tmdbId: -1 };

if (req.query.all === "1") {
  const movies = await Movie.find()
    .select(LIST_PROJECTION)
    .sort(sort)
    .lean();
  res.set("Cache-Control", "no-cache"); // revalidate → cheap 304s
  return res.json({ movies, total: movies.length, page: 1, totalPages: 1 });
}
```

- `?all=1` (read from `req.query`) returns **every** movie, still light fields, in one response. This exists for the tag/search pages, which filter the whole catalog in the browser instead of asking the server per keystroke. It reports itself as page 1 of 1 with `total` = the array length.
- `-1` in a sort means descending, so newest `publishedAt` first. `tmdbId: -1` is a **tiebreaker**: when two movies share a timestamp, the higher ID wins, so the order is at least stable instead of random.

Otherwise it paginates:

```js
const limit = Math.min(
  MAX_PAGE_SIZE,
  Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE)
);
const page = Math.max(1, parseInt(req.query.page, 10) || 1);

const [movies, total] = await Promise.all([
  Movie.find()
    .select(LIST_PROJECTION)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(),
  Movie.countDocuments(),
]);
```

**What this is:** *pagination* — returning one slice of the results at a time instead of the entire collection. `skip((page-1) * limit)` throws away the earlier pages' rows and `limit(...)` caps the page size. So `?page=3&limit=20` skips 40 and returns rows 41–60.

- The `Math.min`/`Math.max` sandwich **clamps** the numbers: `limit` is forced between 1 and 60 (so `?limit=999999` can't be used to bypass pagination and hammer the server), and `page` can't go below 1. `parseInt(x, 10) || 20` means "parse it; if it isn't a number, use the default".
- `Promise.all` fires **both queries at the same time** rather than one after the other, and destructures the results into `movies` and `total`. Both are needed because the frontend shows "Page 3 of 12", which requires knowing the total count.

```js
res.json({
  movies,
  total,
  page,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
```

The response shape every list page consumes: `movies` (the slice), `total` (whole-catalog count), `page` (echoed back), `totalPages` (`ceil(total/limit)`, floored at 1 so an empty database still says "1 page" rather than 0).

#### GET /api/movies/:tmdbId — one full movie

```js
const movie = await Movie.findOne({ tmdbId: Number(req.params.tmdbId) }).lean();
if (!movie) return res.status(404).json({ message: "Movie not found" });
```

- `:tmdbId` is a **URL parameter** — Express captures that URL segment into `req.params`. It arrives as a **string**, so `Number(...)` converts it before querying; without that, MongoDB would compare a string against a Number field and always miss.
- **No projection** here — the detail page needs everything: overview, all download rows, screenshots.
- `findOne` returns `null` when nothing matches, hence the explicit `404 Not Found`.

#### POST /api/movies — create

```js
const existing = await Movie.findOne({ tmdbId: req.body.tmdbId });
if (existing) {
  return res.status(409).json({ message: "Movie already exists" });
}
const movie = await Movie.create(pickMovieFields(req.body));
res.status(201).json(movie);
```

- First a **duplicate check** and a `409 Conflict` with a friendly message. This is a pre-check for a nicer error; the *real* guarantee is the `unique` index on `tmdbId` in the schema, which would reject the insert even if two requests raced.
- `Movie.create(...)` runs the schema **validators** (required fields present, `mediaType` in the enum). Any validation failure throws, is caught below, and comes back as `400 Bad Request`.
- `201` is the conventional "Created" status, and the newly saved document (with its generated `_id`, `publishedAt`, `createdAt`) is returned so the UI can update immediately.

#### PUT /api/movies/:tmdbId — update (admin only)

```js
router.put("/:tmdbId", verifyAdmin, async (req, res) => {
  const updateData = pickMovieFields(req.body);
  delete updateData.tmdbId; // the URL param identifies the movie — never rename it
  if (!updateData.poster) {
    delete updateData.poster; // don't wipe a saved poster with an empty value
  }
  const movie = await Movie.findOneAndUpdate(
    { tmdbId: Number(req.params.tmdbId) },
    updateData,
    { new: true, runValidators: true }
  );
```

- `verifyAdmin` in the middle of the route definition is the gate — this line is why the password header is required for edits.
- **`delete updateData.tmdbId`** — since the movie is identified by the `:tmdbId` in the URL, letting the body change `tmdbId` would be a renaming bug (or a duplicate-key crash). It's stripped no matter what the client sends.
- **The poster guard** — if the body has no poster (or an empty one), the poster key is removed from the update entirely. `findOneAndUpdate` with `$set`-style behaviour only touches the keys present, so an absent key leaves the stored poster untouched. In practice this protects the admin form path where the poster field may be blank but the existing image should stay.
- `{ new: true }` — return the **updated** document; the default is to return the *pre-update* version, which would be confusing.
- `{ runValidators: true }` — re-check the schema rules on update too. By default Mongoose only validates on `create`, so without this an update could sneak in `mediaType: "banana"`.

#### DELETE /api/movies/:tmdbId — delete (admin only)

```js
const movie = await Movie.findOneAndDelete({ tmdbId: Number(req.params.tmdbId) });
if (!movie) return res.status(404).json({ message: "Movie not found" });
res.json({ tmdbId: movie.tmdbId });
```

Also gated by `verifyAdmin`. `findOneAndDelete` removes the document and returns it, so the `!movie` check doubles as the 404 test. The success body is just the deleted `tmdbId`, which is all the frontend needs to remove the item from its list.

---

### Performance details worth understanding

#### `.lean()` on every read

**What this is:** by default Mongoose wraps query results in full **model documents** — objects with the schema attached, change tracking, and methods like `.save()`. `.lean()` skips all that and returns **plain JavaScript objects**, which is significantly faster and lighter on memory for large result sets.

The cost is that a lean object can't call `.save()` or trigger Mongoose hooks. That's fine here because list/get responses are read-only — the document is serialized straight to JSON. Notice the write paths (`Movie.create`, `findOneAndUpdate`) deliberately do **not** use `.lean()`, since they need real document behaviour.

#### gzip compression

Already covered above, but to tie it together: `compression()` in `server.js` gzips every response body. Because the list endpoint returns 20–60 movie objects with repeating field names, this is the single biggest speed win in the whole backend — the comment in the code estimates 5–10x smaller on the wire. Both the browser and Express handle this transparently; nothing in the frontend knows it's happening.

#### `Cache-Control: no-cache` and ETag 304s

```js
res.set("Cache-Control", "no-cache"); // revalidate → cheap 304s
```

**What this is:** HTTP caching headers tell the browser (and any CDN in between) whether it may reuse a previous response. The name `no-cache` is misleading — it does **not** mean "never cache". It means: *"you may store this, but before reusing it you must revalidate with the server."*

That revalidation works via **ETags**: when Express sends a JSON response it also computes a fingerprint (hash) of the body in an `ETag` header. Next time, the browser sends `If-None-Match: <that fingerprint>` and asks "is this still current?" If nothing changed, Express replies with an empty **`304 Not Modified`** — no JSON, no compression work, a few hundred bytes of headers — and the browser uses its stored copy.

Why this codebase picks `no-cache` rather than a "cache for 10 minutes" rule: the catalog changes whenever the admin adds, edits, or deletes a movie, and the homepage must reflect that on the next visit. With `no-cache` the data is always fresh, and the "cost" is just one conditional request per page load that usually comes back as a tiny 304. Note it's set on the JSON endpoints in `movieRoutes.js`, not globally in `server.js`.

---

### Error handling style

Every endpoint follows the same pattern:

```js
router.get("/:tmdbId", async (req, res) => {
  try {
    ...
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
```

- **Each handler has its own `try/catch`.** There is no central `app.use((err, req, res, next))` error middleware and no logger. That's a deliberate simplicity trade-off for a small API — but it does mean errors are only ever visible in the HTTP response, not in the server logs.
- **Status codes follow a rough convention:**
  - `400` for create/update failures — these are usually Mongoose **validation** errors, i.e. the client's fault.
  - `500` for read/delete failures and the unconfigured-password case — a database or server problem.
  - `404` for "no such movie", `401` for a bad admin password, `409` for a duplicate `tmdbId`.
- **The error message is sent to the client verbatim** (`error.message`). Friendly for the site's owner debugging their own API — you can see exactly which validation failed — but it does leak internals (e.g. database error text) to any visitor who triggers an error. Acceptable for a personal catalog site; something to change if the site ever grows.
- A failed response is always JSON of the form `{ "message": "..." }`, which the frontend's alert/toast components display.

---

### Key takeaways

- The entire backend is five files. `server.js` boots Express with three middleware (`cors` → `compression` → `express.json`), mounts the router at `/api/movies`, and starts the HTTP listener *before* connecting to MongoDB, so a database outage doesn't prevent boot.
- Configuration lives in `backend/.env` (loaded by `dotenv`): `MONGODB_URI`, optional `PORT`/`CORS_ORIGIN`, and `ADMIN_PASSWORD`. `.env.example` documents them; the real `.env` is git-ignored.
- MongoDB Atlas is the hosted database; the most common failure is an un-whitelisted IP, and `config/db.js` also warns if the URI is missing a database name (data silently lands in a default database).
- `models/Movie.js` defines the shape: `tmdbId` is the required, unique, public identity key; `downloadLinks` holds movie-style quality rows; `seasonEpisodes` holds the same shape used for TV, including a nested `seasons → episodes` structure; `screenshots`, `publishedAt` and auto `createdAt`/`updatedAt` round it out.
- `movieSchema.index({ publishedAt: -1 })` is a database index matching the list endpoint's sort. **What an index is:** a sorted lookup structure MongoDB maintains so it can read rows in order instead of scanning and sorting the whole collection in memory on every request — it's what keeps "newest first" fast as the catalog grows.
- Six endpoints: `GET /` (paginated light list, or everything with `?all=1`), `GET /:tmdbId` (full document), `POST /` (create, 409 on duplicate), `PUT /:tmdbId` and `DELETE /:tmdbId` (both gated by `verifyAdmin`), plus `POST /verify-admin` (a yes/no password check for the login form).
- The `MOVIE_FIELDS` whitelist is the security boundary for writes: only approved fields are copied from a request body, so `publishedAt` can never be faked and `PUT` additionally strips `tmdbId` and preserves an existing poster.
- The list endpoint is deliberately cheap: a projection (`-downloadLinks -seasonEpisodes -screenshots -overview -__v`) skips fields grids never render, `skip`/`limit` caps pages at 60 items, `.lean()` returns plain objects, gzip shrinks the payload ~5–10x, and `Cache-Control: no-cache` makes repeat visits revalidate into near-free 304 responses.
- Admin auth is a single shared password compared as a plain string, sent in the `x-admin-password` header on edit/delete requests — adequate for a one-admin personal site over HTTPS, and the least hardened part of the codebase.
- Errors are handled locally in each route with `try/catch` and a JSON `{ message }` body; there's no central error handler and no server-side logging of failures.
## 02. Frontend Foundation — Build, Routing & Entry

This section covers the seven files that make the React app actually exist and load:
`frontend/index.html` (the single HTML page), `frontend/vite.config.js` (the build tool),
`frontend/vercel.json` (deployment routing), `frontend/package.json` (dependencies and
scripts), `frontend/eslint.config.js` (code-quality rules), and the two entry files
`frontend/src/main.jsx` and `frontend/src/App.jsx`.

The mental model to hold: **there is only one real HTML page on this whole site.** Every
"page" you can visit — home, a movie's details, the season episode list — is JavaScript
drawing into the same empty `<div id="root">`. Everything in this section exists to serve
that one file and the JavaScript it loads.

---

### frontend/index.html — the single HTML shell

This is the only HTML file the browser ever receives. Vite treats it as the entry point:
when you run the dev server, Vite reads this file, injects its own script wiring, and
serves it. When you build, Vite compiles `src/main.jsx` (referenced on line 23) into a
minified bundle and rewrites this file to point at the built files.

The shell itself is bare on purpose:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
```

`<div id="root">` is the one empty box React takes over. If you ever "view source" on the
deployed site and see nothing but this empty div, that is correct — the content is built
by JavaScript at runtime. (This is why a "View source" looks empty but "Inspect element"
shows a full page.)

`<script type="module" src="/src/main.jsx">` is the handoff point. `type="module"` tells
the browser this is a modern ES module, which enables imports/exports and lets Vite do
its fast development work. Note the path starts with `/src/`, not `frontend/src/` — Vite
uses the folder containing `index.html` as the web root, so inside this project `/src`
means `frontend/src`.

#### Loading Roboto from Google Fonts, and why the URL lists weights

```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
```

This link returns a small CSS file, and that CSS in turn points at the actual font files
on `fonts.gstatic.com`. Google Fonts serves fonts as separate files **per weight** (and per
italic style) because each weight is a genuinely different font file — bold letters need
different outlines than regular ones. If you requested the whole family, you would
download far more than the site uses.

So this URL is a deliberate shopping list of exactly the styles the CSS uses:

| Part of the URL | Meaning |
|---|---|
| `ital,wght@` | declaring "I'm specifying italic and weight axes" |
| `0,400` | normal (non-italic), weight 400 — regular body text |
| `0,500` / `0,600` | medium and semibold — buttons, subtitles, small headings |
| `0,700` / `0,800` | bold and extrabold — page headings, movie titles |
| `1,400` | the `1` prefix means italic, weight 400 |
| `display=swap` | while the font downloads, show a fallback font immediately, then swap in Roboto when it arrives |

`display=swap` matters: without it, browsers hide the text entirely until the font loads
(an invisible-text flash). With it, the user reads the page in a system font within
milliseconds and the text re-renders in Roboto a moment later.

If you ever use a Tailwind/Bootstrap class or CSS rule like `font-weight: 600` but 600 is
not in that URL list, the browser has to fake it (or round to the nearest real weight).
That is why the list looks oddly specific.

#### Bootstrap CSS — but the Bootstrap JavaScript was removed

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
```

This is the full Bootstrap 5.3.8 **stylesheet** loaded from a CDN. "CDN" (Content
Delivery Network) just means a public server that hosts popular libraries so you don't
have to copy them into your repo; the browser downloads it directly and can cache it,
possibly even reusing a copy another website already downloaded.

Bootstrap CSS is what gives the site its grid, spacing, cards, buttons and responsive
utilities (`row`, `col-md-4`, `container`, `d-flex`, and so on in the page components).

Git history shows the original version of `index.html` also loaded this:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" ...></script>
```

It was **removed** in a later commit, and that was the right call. Bootstrap ships in two
halves:

- **Bootstrap CSS** — pure styling. Needs no JavaScript. Works fine with React.
- **Bootstrap JS** — powers *interactive* widgets: dropdown menus, modals, tooltips,
  collapsible navbars. It works by directly reaching into the DOM and adding/removing
  elements and classes itself.

That second part is what conflicts with React. React owns the DOM inside `#root` — it
re-renders sections of it whenever state changes, and it expects to be the only one
touching those nodes. An outside library that mutates the same nodes gets its changes
wiped on the next render, and React gets confused by nodes it did not create. Since this
site's interactivity is all handled with React state (the navbar, the admin modal, the
search box), the Bootstrap JS bundle was ~80KB of dead weight doing nothing. Removing it
cost no features and made the page lighter.

Two attributes on the link are worth understanding because they are a security habit:

- **`integrity="sha384-..."`** — Subresource Integrity. The hash is a fingerprint of the
  exact file. Before running the downloaded CSS, the browser computes the file's hash and
  compares. If a CDN were ever hacked and served modified CSS, the hash would not match
  and the browser would refuse to load it. This only works on files that never change —
  which is exactly what a versioned `@5.3.8` URL guarantees.
- **`crossorigin="anonymous"`** — asks the browser to load the file without sending your
  site's cookies, and makes error details available. It is also *required* for the
  `integrity` check to apply to cross-origin files.

#### Font Awesome icon font

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" integrity="sha512-..." crossorigin="anonymous" referrerpolicy="no-referrer" />
```

Font Awesome is an icon library. You use it by writing an empty `<i>` element with a
class name, e.g. `<i className="fa fa-star"></i>`, and the CSS turns it into a star
glyph. This is the **4.7.0** version — an older but very common one; its class names are
`fa fa-*`, whereas version 5/6 use `fas fa-*` / `fa-solid`. If you ever copy an icon from
the current Font Awesome website and it does not render, that is why: the site shows
v6 names, this page loads v4.

`referrerpolicy="no-referrer"` tells the browser not to send the address of your page
when fetching this file, so cdnjs never learns which of your pages loaded icons.

#### Preconnect links, and the problem they solve

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://image.tmdb.org">
<link rel="preconnect" href="https://api.themoviedb.org" crossorigin>
```

**What this is:** a `preconnect` link tells the browser, early and in the background,
"you will soon need to talk to this server — start the connection handshake now, before
you even know which exact file you need."

The problem: opening a connection to a new server takes real time — a DNS lookup to find
the server's IP, a TCP handshake, and for HTTPS a TLS key exchange. That can be 100–300ms,
and it happens *before* the first byte of the actual file downloads. Worse, it is
serialised: the browser can't fully start downloading the font CSS until it has connected
to `fonts.googleapis.com`.

These four links cover every third-party server the page talks to:

- `fonts.googleapis.com` — the font CSS itself.
- `fonts.gstatic.com` — the actual font files the CSS points to (a separate host, so it
  needs its own preconnect). `crossorigin` is required here because fonts are always
  fetched in "anonymous" CORS mode; without that attribute the preconnect would open a
  connection the browser wouldn't reuse, achieving nothing.
- `image.tmdb.org` — where every movie poster, backdrop and screenshot comes from. This
  is the highest-value one on the page: the homepage immediately requests dozens of
  poster images from this host, and pre-warming the connection makes the whole grid
  appear sooner.
- `api.themoviedb.org` — the TMDB API used to enrich movie details.

The practical effect: by the time React has mounted and the movie data has arrived, the
image server connection is already open, so posters start downloading immediately instead
of each paying the handshake tax.

Finally, `<meta name="viewport" ...>` (line 6) makes the layout responsive on phones —
without it, mobile browsers render the page at desktop width and zoom out. `lang="en"`
helps screen readers and translation tools, and `/favicon.png` is the browser tab icon.

---

### frontend/vite.config.js — what Vite is doing

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

Six lines, but they switch on the entire build. **Vite** (French for "fast") is the build
tool and dev server for this project. It has three jobs:

1. **Dev server.** `npm run dev` starts a local server (default `http://localhost:5173`).
   It serves `index.html`, and when the browser asks for `/src/main.jsx`, Vite compiles
   the JSX on the fly and serves it. You never wait for a "build" to finish — changes
   appear almost instantly.
2. **Hot Module Replacement (HMR).** When you save a file, Vite does not reload the whole
   page. It sends just the changed module over a websocket and swaps it in place, keeping
   your React state. Change a colour in `HomePage.css` and the page updates without
   losing your scroll position or refetching the movie list.
3. **Production bundling.** `npm run build` produces the `dist/` folder: it minifies the
   JavaScript, removes unused code, hashes filenames for caching, and rewrites
   `index.html` to point at the built assets.

**What this is:** a Vite *plugin* is a drop-in that teaches Vite a new language or
framework. `@vitejs/plugin-react` is what makes JSX understandable, and — importantly — it
enables **React Fast Refresh**, the mechanism that lets HMR replace a component in place
while preserving its state. Without this plugin, `.jsx` files would fail to parse and
every save would be a full page reload.

`defineConfig` is just a helper function that gives you autocomplete and type hints in
editors. There is no proxy config here — the frontend talks to the backend by absolute
URL instead (see the env-var section below).

---

### frontend/vercel.json — why deep links would 404 without it

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

One rule, and it is essential. Read it as: "for **any** path the visitor requests
(`/(.*)` is a regular expression matching everything), serve `index.html`."

Recall the mental model: the site is one HTML file. But the URL bar shows real paths like
`/movie-details/9123` because React Router is faking extra pages in the browser. Now
follow what happens when a visitor lands straight on a deep link — say they refresh the
page while on a movie, or open a shared link:

1. The browser asks Vercel's server for `/movie-details/9123`.
2. The server looks for a file at that path. There is no such file — `dist/` contains
   `index.html` and an `assets/` folder, nothing else.
3. Without a rewrite, Vercel answers **404 Not Found**. The site never loads.

With this rewrite, step 2 returns `index.html` anyway. The page boots, React Router looks
at the URL, sees `/movie-details/9123`, matches it to the right route, and renders the
correct page. The server's job is just "always hand over the app"; figuring out what to
show is the client's job.

**What this is:** this is the signature problem of **SPA routing** (Single Page
Application). It is also worth noting why it works *inside* the running app without the
rewrite — clicking a link uses JavaScript to swap the view and only updates the URL, so
no request hits the server at all. The rewrite is purely for the "first load at a URL the
server has never heard of" case.

Vercel finds `vercel.json` automatically because it sits at the root of the deploy
directory. No build settings are stored here — Vercel auto-detects Vite and runs
`npm run build` with `dist` as the output folder.

---

### frontend/package.json — dependencies, devDependencies and scripts

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview"
},
```

Four commands, all run from the `frontend/` folder:

- **`npm run dev`** — starts the dev server with HMR. What you use while coding.
- **`npm run build`** — produces the optimised `dist/` folder for deployment.
- **`npm run preview`** — serves the `dist/` folder locally so you can check the
  *production* build before deploying. Worth doing: minified builds occasionally behave
  differently from dev.
- **`npm run lint`** — runs ESLint over the whole frontend and reports problems.

Note that `dev`, `build` and `preview` are not commands npm understands — they are just
names that map onto the `vite` command line tool listed in devDependencies.

#### dependencies vs devDependencies

```json
"dependencies": {
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "react-router-dom": "^7.18.2"
},
```

- **`dependencies`** — code that ends up *inside the shipped bundle*. `react` is the
  component engine, `react-dom` is the part that actually puts components into the real
  DOM (`createRoot`, next section), and `react-router-dom` is the SPA routing library.
  Three runtime dependencies is genuinely minimal.
- **`devDependencies`** — tools used only while developing: `vite`, the React plugin,
  ESLint and its plugins, and `@types/react` (editor autocomplete/type information only;
  it is never bundled). These never reach visitors.

The `^` in `^19.2.8` means "19.2.8 or any newer 19.x is acceptable" — patch and minor
updates are allowed, breaking major bumps are not.

Also note `"type": "module"` at the top. It tells Node to treat `.js` files in this
folder as modern ES modules, which is what lets `vite.config.js` and
`eslint.config.js` use `import` statements instead of the older `require()`.

---

### frontend/eslint.config.js — the code-quality rules

**What this is:** ESLint is a linter — a tool that reads your code without running it and
flags likely mistakes and style problems: unused variables, missing dependencies in a
`useEffect`, unreachable code.

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
```

Walking through it:

- `globalIgnores(['dist'])` — never lint the build output; it is machine-generated
  minified code and would produce thousands of meaningless warnings.
- `files: ['**/*.{js,jsx}']` — the rules below apply to every JS and JSX file.
- Three rule sets are layered on:
  - `js.configs.recommended` — general JavaScript best practices.
  - `reactHooks.configs.flat.recommended` — the most valuable one here. It knows the
    Rules of Hooks and will error if you call `useEffect` inside an `if`, or if your
    `useEffect` dependency array is missing a variable the effect uses. These are the
    exact bugs that otherwise cause stale data and infinite refetch loops.
  - `reactRefresh.configs.vite` — warns about patterns that break Fast Refresh, such as
    a file that both exports a component and exports something else. When that happens,
    HMR gives up and does a full page reload instead.
- `globals: globals.browser` — tells ESLint that `window`, `document`, `fetch`,
  `sessionStorage` and friends exist, so it does not report them as undefined variables.
- `ecmaFeatures: { jsx: true }` — lets the parser read JSX syntax.

Run it with `npm run lint`. It is a dev-time safety net only; nothing here affects the
deployed site.

---

### frontend/src/main.jsx — where React takes over

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

This is the file `index.html` loads, and it is the bridge from HTML to React. It is
deliberately tiny — it does exactly two things.

**`document.getElementById('root')`** finds the empty div from `index.html`. This is the
only moment your code touches the DOM by hand.

**What this is:** `createRoot` is React 18+ (this project uses React 19) — the entry
point that says "React, this DOM element is yours. Build and manage everything inside
it." Older React used a `ReactDOM.render()` API that updated the whole tree on every
render; `createRoot` enables the modern renderer that can update parts of the page
independently.

**`<StrictMode>`** is a development-only wrapper. It renders nothing and ships nothing to
production — it exists purely to catch problems. Two things it does:

- It runs extra checks and warns about deprecated or unsafe patterns.
- **It deliberately renders your components twice** in development. This is the "why does
  my `console.log` appear twice / why does my effect run twice" mystery. StrictMode
  mounts, unmounts and remounts every component to prove it is safe to do so — a check
  that catches effects with missing cleanup (e.g. a `fetch` or a subscription that never
  gets cancelled). It can also reveal effects that fire a duplicate network request.

The double render is **dev only**. In the production build StrictMode does nothing and
every component renders once. So if you see doubled logs locally but not in production,
that is not a bug in your site.

`App.jsx` is imported with no `{ }` because it is the file's single *default* export,
whereas `StrictMode` and `createRoot` are *named* exports inside braces — a JS distinction
that shows up everywhere in this codebase.

---

### frontend/src/App.jsx — the route table and code splitting

This file does two jobs: it declares which URL shows which page, and it controls how much
JavaScript downloads on first load.

```jsx
// Route-level code splitting: the initial bundle only carries the home page.
// Each other route is fetched on first visit (and cached by the browser).
const MovieDetails = lazy(() => import("./pages/MovieDetails"))
const AddMovies = lazy(() => import("./pages/AddMovies"))
const EpisodePage = lazy(() => import("./pages/EpisodePage"))
```

#### SPA routing with BrowserRouter / Routes / Route

**What this is:** `react-router-dom` implements client-side routing — it reads the
browser URL and decides which component to render, without ever asking the server for a
new page. A site that works this way is a Single Page Application (SPA).

```jsx
<BrowserRouter>
  <Routes>
    <Route path='/' element={<HomePage/>}></Route>
    <Route path='/movie-details/:id' element={page(<MovieDetails/>)}></Route>
    <Route path='/AddMovies' element={page(<AddMovies/>)}></Route>
    <Route path='/series/:movieId/season/:seasonNum' element={page(<EpisodePage/>)}></Route>
  </Routes>
</BrowserRouter>
```

- `BrowserRouter` — the top-level wrapper. It listens to the browser's URL and history,
  and enables the `<Link>` / `useNavigate` navigation used across the pages. It is what
  makes the back button work inside the app.
- `Routes` — "look at the current URL and pick exactly one of the children."
- `Route` — one URL pattern to one component. The first match wins.

Two of these patterns contain **dynamic segments**, written with a colon:

- `/movie-details/:id` matches `/movie-details/9123` and `/movie-details/77`, and any
  page can read the actual value with `useParams()`. That single route serves every movie
  in the database — routes are not created per movie.
- `/series/:movieId/season/:seasonNum` matches both a movie id and a season number, e.g.
  `/series/9123/season/2`, which is how the episode list page knows what to load.

`HomePage` is imported normally at the top, but the other three use `lazy`. That
asymmetry is the interesting part.

#### Code splitting with React.lazy + Suspense

**What this is:** *code splitting* means cutting one large JavaScript bundle into several
smaller files and loading each piece only when it is needed. `React.lazy(() =>
import(...))` is React's built-in way to do it per component: the `import()` is a dynamic
import that returns a promise, so the file is not fetched when the app starts — it is
fetched the first time that component is actually rendered.

The reasoning: the admin form (`AddMovies`) and the episode list are heavy pages that most
visitors never open. Bundling them into the initial download would make every visitor pay
their download cost just to see the homepage. With `lazy`, the first page load only
carries React, the router and `HomePage`.

`lazy` components have no content at first (the file is still downloading), so React
needs something to show while it waits — that is `Suspense`:

```jsx
const page = (element) => <Suspense fallback={null}>{element}</Suspense>

<Route path='/movie-details/:id' element={page(<MovieDetails/>)}></Route>
```

`page(...)` is a tiny local helper that wraps a lazy component in `Suspense` with
`fallback={null}` — render nothing while the chunk loads. It is a one-line shorthand so
each `<Route>` does not repeat the wrapper. (The trade-off of `null`: a slow connection
shows a blank area for the fraction of a second the chunk takes to arrive. A spinner in
`fallback` would be the alternative.)

The homepage is *not* lazy-loaded, so it needs no wrapper — it is already inside the
initial bundle.

**Proof it works — this is the actual `frontend/dist/assets/` folder from a real build:**

| File | Size |
|---|---|
| `index-BEVWfTZC.js` | 239 KB — the main bundle (React, router, HomePage) |
| `moviesApi-Ck97s05y.js` | 10 KB — shared API module, used by several pages |
| `AddMovies-DyD3NYCI.js` | 26 KB — only downloaded if you visit `/AddMovies` |
| `MovieDetails-o6rhZJA-.js` | 16 KB — only downloaded on a movie page |
| `Screenshots-DaL1IASs.js` | 4 KB — a further lazy import *inside* MovieDetails |
| `EpisodePage-BJeae-21.js` | 2 KB — only downloaded on a season page |

So a first-time visitor to the homepage downloads the 239 KB main bundle and skips the
other four (~58 KB saved on that first load). Two extra details visible in the real
output:

- Vite's bundler noticed that `moviesApi` is imported by several pages and hoisted it
  into its own shared chunk, so it downloads once and is reused.
- Filenames include a content hash (`index-BEVWfTZC.js`). When you redeploy with changed
  code, the hash changes, so browsers that cached the old file know to fetch the new one
  — visitors get instant loads from cache and never see a stale version.
- In the built `dist/index.html`, the lazy chunks are *not* mentioned at all; they are
  requested at runtime by the `import()` calls. Only the main bundle appears as a
  `<script>` tag.

---

### How `VITE_` environment variables reach the browser

This is not in any of the seven files, but it is the reason the frontend has no secrets
and no config file, so it belongs here.

The frontend reads two variables, `VITE_TMDB_API_KEY` and `VITE_API_BASE_URL`, defined in
`frontend/.env` (documented in `frontend/.env.example`), like this:

```js
const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");
```

**What this is:** `import.meta.env` is Vite's object of environment variables. The rule
that matters: **Vite only exposes variables whose names begin with `VITE_`.** Anything
else in `.env` stays on your machine and is invisible to the frontend. That prefix is the
deliberate safety gate — you can keep a private backend secret in the same `.env` file
and the frontend simply cannot see it.

The key word is **inlined**. Vite does not ship your `.env` file or read it in the
browser — it cannot; `.env` is a local file. Instead, at build time, Vite does a literal
text substitution: every occurrence of `import.meta.env.VITE_API_BASE_URL` in your source
is replaced by the actual string value, baked straight into the JavaScript bundle. The
variable does not exist at runtime; the value is already there, hard-coded in the
downloaded file.

Two consequences you should remember:

- **Changing a `VITE_` variable requires a rebuild.** Editing `.env` does nothing to an
  already-running dev server or an already-deployed site. Restart `npm run dev`, or
  re-run `npm run build`.
- **Never put a secret in a `VITE_` variable.** Anyone can open the deployed JS and read
  it. That is why the TMDB key lives here (it is a public, free key designed to be used
  from browsers) while the admin password and MongoDB connection string stay on the
  backend.

Two built-in variables are also in play: `import.meta.env.DEV` is `true` under
`npm run dev` and `false` in the production build — that is how `moviesApi.js` falls back
to `http://localhost:5000` while developing but expects a real configured URL once
deployed.

---

### Key takeaways

- The entire site is **one HTML file**. Everything else is JavaScript rendering into
  `<div id="root">`, which is why `vercel.json` rewrites every path to `index.html` —
  without it, refreshing or sharing a deep link like `/movie-details/9123` would 404.
- `index.html` is tuned for speed: `display=swap` avoids invisible text, the Google Fonts
  URL lists only the six Roboto weights actually used, and the four `preconnect` links
  pre-open connections to the font, poster and TMDB servers so images start downloading
  sooner.
- **Bootstrap CSS stays, Bootstrap JS was removed** (visible in git history). The CSS is
  styling only, but the JS mutates the DOM directly, which fights React's ownership of
  the DOM — and none of its widgets were being used.
- `vite.config.js` is six lines because `@vitejs/plugin-react` does the heavy lifting:
  JSX compilation plus Fast Refresh, which is what makes edits appear instantly without a
  full page reload.
- `main.jsx` is the whole handoff: `createRoot` gives React ownership of `#root`, and
  `<StrictMode>` double-renders components **in development only** to expose missing
  cleanup and other effect bugs. Doubled logs locally are normal, not a bug.
- `App.jsx` maps four URL patterns (two with dynamic `:id` / `:seasonNum` params) to
  pages, and `React.lazy` + `Suspense` splits the build: 239 KB main bundle on first
  load, with AddMovies (26 KB), MovieDetails (16 KB) and EpisodePage (2 KB) fetched only
  when visited, then browser-cached.
- Only three runtime dependencies (react, react-dom, react-router-dom); everything else
  in `package.json` is dev tooling. `npm run dev` / `build` / `preview` / `lint`.
- `VITE_`-prefixed variables are **text-substituted into the bundle at build time**, so
  changing them needs a rebuild and they must never hold secrets — that prefix is the
  line between "safe to ship to browsers" and "backend only".
## 03. The Data Layer — API Client, Transformations & Tags

This section covers the four files that sit between **MongoDB** and your **React components**:

| File | Job in one line |
| --- | --- |
| `frontend/src/api/moviesApi.js` | Every HTTP call to the Express backend, plus the admin password and the list cache |
| `frontend/src/assets/moviesStore.js` | `transformPublished` — reshapes a raw MongoDB document into the one "movie" shape the whole UI agrees on |
| `frontend/src/assets/movieDetails.js` | `getMovieDetails` — *derives* the page text (release title, download rows, categories, blurbs, screenshots) from that shape |
| `frontend/src/assets/Tags.js` | Language/genre normalisation plus the tag and OTT filtering engine |

The data flows in one direction, and each file hands the next one a cleaner shape:

```
MongoDB
  └─ backend/routes/movieRoutes.js   (sends raw documents as JSON)
       └─ moviesApi.js               (fetch + cache + admin key)
            └─ moviesStore.js        (transformPublished → canonical movie object)
                 └─ movieDetails.js  (getMovieDetails → display-ready strings/rows)
                      └─ Tags.js     (filtering that canonical shape for tags/OTT)
```

Everything below explains one link in that chain at a time.

### The vocabulary you need first: Promises, `fetch` and `async/await`

These three ideas explain 90% of `moviesApi.js`, so let's get them straight before reading any of it.

- **What this is (`fetch`):** a built-in browser function that makes an HTTP request to a URL and returns a Promise. It is how the frontend talks to your Express server.
- **What this is (Promise):** a Promise is JavaScript's way of saying "I don't have the answer yet, but I will." It's a placeholder object for a value that arrives later (when the network responds). A Promise can *resolve* (success — you get the value) or *reject* (failure — you get an error). `.then(...)` runs on success, `.catch(...)` on failure.
- **What this is (`async/await`):** nicer syntax for working with Promises. Marking a function `async` lets you write `await somePromise` inside it, which *pauses* that function until the Promise resolves — without freezing the page. `await` makes asynchronous code read top-to-bottom instead of nesting `.then()` callbacks.
- **What this is (JSON):** JavaScript Object Notation — text that looks exactly like a JS object. Every request body here is serialised with `JSON.stringify(...)` before sending, and every response is parsed back with `res.json()`.
- **What this is (HTTP status codes):** the server attaches a number to every response — `200` OK, `201` Created, `401` Unauthorized, `404` Not Found, `500` Server Error. `fetch` does **not** throw on 404 or 500 (a common gotcha); it only rejects on network failure. That's why this code checks `res.ok` (true for anything in 200–299) and `res.status` by hand.

The pattern repeated all over `moviesApi.js` is therefore:

```js
const res = await fetch(`${API}/${tmdbId}`);   // 1. ask the server
if (res.status === 404) return null;           // 2. treat "missing" as data, not an error
if (!res.ok) throw new Error("Failed to fetch movie");  // 3. turn real failures into errors
return res.json();                             // 4. parse the body
```

Two more small terms used below:

- **What this is (immutable/pure helper):** a function that takes data in and returns new data out, without touching anything else (no network, no state). `transformPublished`, `getMovieDetails`, `matchesLang`, `matchesGenre` are all pure — which is why they're easy to call from any component and safe to call repeatedly.
- **What this is (cache):** keeping a copy of an expensive result so the next identical request is instant. This codebase has one tiny in-memory cache for list responses, described below.

---

### `frontend/src/api/moviesApi.js` — one object that owns every call to our own backend

#### Why the API calls live in a single file

Every component that needs movie data (`HomePage`, `MovieDetails`, `EpisodePage`, `AddMovies`) imports the same object:

```js
export const moviesApi = { ... };
export default moviesApi;
```

This is deliberate: the URL, the headers, the error messages and the cache are written **once**. If the backend route changes, you fix one file instead of hunting through components. It also means components never see `fetch` for **our own backend** at all — they see verbs like `list()`, `get()`, `add()`.

#### Scope check: this file owns the Express calls, not the TMDB ones

"Every `fetch` is in here" is a claim you'll see again in the takeaways, and it's only true **if you scope it to calls against our Express API**. There are 7 `fetch` calls in `moviesApi.js`, all of them hitting `API` (`/api/movies`) — and 6 more elsewhere in `frontend/src`, every one of them pointed at TMDB's public API rather than at us:

| Where | Calls | What it asks TMDB for |
| --- | --- | --- |
| `frontend/src/hooks/useTmdbMovie.js` | 3 (lines 55, 81, 88) | find-by-IMDb-id, one request per season, and the movie/TV detail payload |
| `frontend/src/pages/AddMovies.jsx` | 3 (lines 389, 415, 569) | the admin search box, full details for a picked result, and details when re-editing a managed entry |
| `frontend/src/pages/MovieDetails.jsx` | 1 (line 77) | the screenshot "rescue" fetch, used only when the hook came back empty |

So the division of labour is two halves, not one:

- **`moviesApi.js` owns every call to our Express backend** — that's why a route rename is a one-file fix, and why `listCache` can invalidate itself on every write.
- **TMDB calls are scattered**, because each of those three files needs a different slice of TMDB data at a different moment (a hook's metadata, a form's search results, a page's missing screenshots). `04-tmdb-hook.md` covers the biggest of them, `useTmdbMovie.js`.

If you're tracing a bug, the first question is therefore "which server is this request going to?" — `api.themoviedb.org` means `useTmdbMovie.js`, `AddMovies.jsx` or `MovieDetails.jsx`; anything else means this file.

#### Where the server URL comes from

```js
const rawBase = import.meta.env.VITE_API_BASE_URL;
const baseUrl = rawBase
  ? rawBase.trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000" : "");

const API = baseUrl ? `${baseUrl}/api/movies` : "/api/movies";
```

- **What this is (`import.meta.env`):** Vite injects build-time environment variables into the frontend here. Only variables prefixed with `VITE_` are exposed to browser code (everything else stays secret on the server, which is the right default).
- **What this is (`import.meta.env.DEV`):** a boolean Vite sets to `true` while you run the dev server and `false` in a production build.

So the resolution order is: use `VITE_API_BASE_URL` if it's set (strip any trailing slashes so `https://x.com/` doesn't become `https://x.com//api/movies`); otherwise guess `http://localhost:5000` in development; otherwise use `""`, which makes `API` the relative path `/api/movies` — meaning "same origin as the site". The relative fallback is what lets the built site work when the Express server serves the frontend itself, or behind a proxy that forwards `/api`. (CORS — the browser rule that normally blocks cross-origin requests — is only relevant in the first two cases, which is exactly why the base URL is configurable.)

`ADMIN_KEY` is just the storage name for the admin password (see next subsection), and `listCache` is explained further down.

#### The admin password lives in `sessionStorage`

Four small methods wrap browser storage:

```js
getAdminPassword()      { return sessionStorage.getItem(ADMIN_KEY) || ""; },
setAdminPassword(pass)  { if (pass) sessionStorage.setItem(ADMIN_KEY, pass);
                          else sessionStorage.removeItem(ADMIN_KEY); },
clearAdminPassword()    { sessionStorage.removeItem(ADMIN_KEY); },
isAdminUnlocked()       { return Boolean(sessionStorage.getItem(ADMIN_KEY)); },
```

- **What this is (`sessionStorage`):** a small key/value store the browser gives every tab. It survives page reloads but is wiped when the tab closes — unlike `localStorage`, which lives forever, and unlike a React variable, which dies on every reload.

That "dies when the tab closes" behaviour is the whole point: the admin password is a credential, so keeping it in `sessionStorage` means closing the tab logs you out automatically. `AddMovies.jsx` also calls `isAdminUnlocked()` as the initial value of its `useState`, so a reload within the same tab keeps the admin panel unlocked.

Note the asymmetry: `isAdminUnlocked()` only checks that **something** is stored. It never validates the password — the server does that on every protected request. This flag is purely "has the user typed a password before", a UI convenience.

#### `verifyAdminPassword` — checking the password against the server

```js
async verifyAdminPassword(password) {
  const res = await fetch(`${API}/verify-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Invalid admin password");
  }
  this.setAdminPassword(password);
  return true;
}
```

Step by step:

1. It POSTs the typed password to `POST /api/movies/verify-admin`. The backend (`backend/routes/movieRoutes.js`) compares it with its `ADMIN_PASSWORD` env var and answers `200` or `401`.
2. `res.json().catch(() => ({}))` — defensive parsing. If the server ever returns a non-JSON body (a proxy error page, for example), `res.json()` would reject; the `.catch` swaps that for an empty object so the code can still read `data.message` safely.
3. `data.message || "Invalid admin password"` uses the server's own message when there is one.
4. Only on success does it remember the password, so the UI never stores a password the server rejected.

**What this is (`this` in an object method):** inside a method written like this, `this` refers to the object the method was called on — here `moviesApi`. That's why `this.setAdminPassword(...)` works. It only works because callers write `moviesApi.verifyAdminPassword(x)` (calling the method *on* the object); if the function were detached and called bare, `this` would be `undefined`. Worth remembering if you ever destructure these methods.

#### `list()` — two modes, one normalised result

```js
// list({ page, limit }) — one page of light-weight movie docs
// list({ all: 1 })      — every movie, light fields (tag/search pages)
async list(opts = {}) {
  const key = listKey(opts);
  if (listCache.has(key)) return listCache.get(key);

  const params = opts.all
    ? "?all=1"
    : `?page=${opts.page || 1}&limit=${opts.limit || 20}`;

  const res = await fetch(`${API}${params}`);
  if (!res.ok) throw new Error("Failed to fetch movies");

  const data = await res.json();
  const normalized = Array.isArray(data)
    ? { movies: data, total: data.length, page: 1, totalPages: 1 }
    : data;
  listCache.set(key, normalized);
  return normalized;
}
```

What's happening:

- **Two query-string modes.** `list({ page: 2, limit: 20 })` builds `?page=2&limit=20` — server-side pagination, used by the home grid. `list({ all: 1 })` builds `?all=1` — the whole catalog in one response, used by tag/search/filter views (`HomePage.jsx`) and admin pages that need to filter client-side. The backend answers both with the light `LIST_PROJECTION`, so the "all" response stays small even with hundreds of titles. (A MongoDB *projection* means "select only these fields" — the server deliberately drops `downloadLinks`, `seasonEpisodes`, `screenshots` and `overview` from lists, because grids and sidebars never render them.)
- **The response is always `{ movies, total, page, totalPages }`.** The `Array.isArray(data)` check is a compatibility shim: a backend that is still running old code returns a bare array and ignores the pagination params. Normalising it here means the components can always write `r.movies` and `r.totalPages` no matter which version of the server is running. This kind of reshaping at the boundary is called **normalisation** — making messy outside data match the shape the rest of the app expects.
- `listKey` builds the cache key: `opts.all ? "all" : \`page:${opts.page || 1}:limit:${opts.limit || 20}\``. So `list({page:1, limit:20})` and `list({page:1})` are the same cache entry.

#### `listCache` — the one cache in the frontend, and how it gets invalidated

```js
// In-memory cache for list responses so revisiting pages (Home → Details →
// back, or switching tags) doesn't refetch. Cleared by add/update/remove.
const listCache = new Map();
```

- **What this is (`Map`):** a built-in object that stores key → value pairs, like a plain object but with nicer methods (`has`, `get`, `set`, `clear`) and no weird default keys.

This variable lives at **module level** — outside any component or function. That means it is created once when the app loads and survives as you navigate between pages (React Router swaps components, but the module stays loaded). That's the point: going Home → Movie Details → Back doesn't hit the network again, and neither does bouncing between two tags.

The trade-off, and why every write method starts with `listCache.clear()`:

```js
async add(movie) {
  listCache.clear();
  const res = await fetch(API, { method: "POST", ... });
```

Clearing the cache is called **invalidation** — throwing away cached data that a mutation just made stale. Here it happens **before** the request, not after. That's the conservative choice: even if the add fails, the next `list()` refetches from the server rather than showing data that might be wrong. (Caching bugs are silent and confusing; one extra request after a failed save is not.) This is the classic **cache-aside** pattern: read from cache, fall back to the network, drop the cache whenever the underlying data changes.

What is *not* cached:

- `get(tmdbId)` — single movie documents. Detail pages always want the freshest download links, and they're fetched once per visit anyway.
- `exists(tmdbId)` — same endpoint, boolean answer, cheap.
- `verifyAdminPassword` and everything in `sessionStorage` — not cache, just storage.

#### `get()` — one full movie document, or `null`

```js
async get(tmdbId) {
  const res = await fetch(`${API}/${tmdbId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch movie");
  return res.json();
}
```

The important design decision is `return null` on 404. "This movie isn't published yet" is a **normal answer**, not a crash, so it comes back as data. Components then decide what to show (`MovieDetails` renders its "Movie not found" panel; `EpisodePage` sets its movie to `null`). Anything else that isn't `ok` — a 500, a network hiccup — throws, because those *are* exceptional. This distinction (404 = expected empty, 5xx = error) is repeated in `exists()`.

#### `add()` — create

`add(movie)` POSTs the whole movie object as JSON to `POST /api/movies`. No admin header is sent — the backend allows creating without one (only edit/delete are protected). Errors are unpacked from `err.message` so the server's own text (e.g. "Movie already exists", its 409) reaches the form.

#### `update()` and `remove()` — the protected mutations

These two are near-identical, so read them together:

```js
async update(movie, adminPass) {
  listCache.clear();
  const pass = adminPass || this.getAdminPassword();
  const res = await fetch(`${API}/${movie.tmdbId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": pass,
    },
    body: JSON.stringify(movie),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error(err.message || "Admin authorization required to edit this movie.");
    }
    throw new Error(err.message || "Failed to update movie");
  }
  return res.json();
}
```

Details worth knowing:

- The movie is identified by `movie.tmdbId` in the URL (`PUT /api/movies/:tmdbId`, `DELETE /api/movies/:tmdbId`), matching the backend's `findOne({ tmdbId: ... })`.
- The password travels in a **custom HTTP header**, `x-admin-password`. (`x-` is just a convention for non-standard headers.) The backend's `verifyAdmin` middleware compares it with `process.env.ADMIN_PASSWORD` and returns `401` on mismatch. The password is deliberately *not* in the JSON body for `remove()` — a DELETE has no body to speak of, and a header works the same for both.
- `const pass = adminPass || this.getAdminPassword();` lets a caller pass the password explicitly (a form the user just typed into), falling back to the remembered one. This is exactly what saves the edit flow when the session password expires mid-edit.
- The explicit `401` branch exists so the UI can show "admin authorization required" instead of a generic "failed to update" — the user's fix is different in that case (unlock admin) than in a validation failure.

#### `exists()` — "is this TMDB id already published?"

```js
async exists(tmdbId) {
  const res = await fetch(`${API}/${tmdbId}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error("Failed to check movie");
  return true;
}
```

It calls the *same* endpoint as `get()` but throws the body away, answering only yes/no. `AddMovies.jsx` uses it before saving, so you can't accidentally create a duplicate. It costs a full document download, but it's only called on the add/edit form — not on hot paths — so simplicity beats a dedicated `/exists` route.

---

### `frontend/src/assets/moviesStore.js` — `transformPublished`, the canonical movie shape

#### Why this file exists

MongoDB documents look like `{ tmdbId, mediaType, title, poster, genre, lang, downloadLinks, ... }`. But the UI components — `HomePage`'s grid, `Postcards`, `MovieDetails` — were written against a different, richer field set (`id`, `imageUrl`, `type`, `uploadedAt`, `rating`, ...). Rather than make every component know two shapes, this file converts **once**, right after the fetch:

```js
export const transformPublished = (entry) => {
  const isTv = entry.mediaType === "tv";
```

Callers: `HomePage.jsx` (`r.movies.map(transformPublished)`), `MovieDetails.jsx`, and `EpisodePage.jsx`. After that line, no component ever thinks about `mediaType` or `poster` again.

- **What this is (a transform/adapter function):** a function that takes one data shape and returns another, filling gaps as it goes. Doing this in one place is called having a "single source of truth" for shape — it's why a poster renders identically everywhere.

#### The placeholder poster

```js
const PLACEHOLDER =
  "https://placehold.co/300x450/09090b/e4e4e7/png?text=No+Poster";
```

If a saved movie has no `poster`, `imageUrl` gets this URL. `placehold.co` is a free service that generates an image from the URL itself: `300x450` is the size, `09090b` the background colour, `e4e4e7` the text colour, and `?text=No+Poster` the label. Those colours are the site's dark zinc palette, so a missing poster looks intentional rather than broken. (Placeholder images also mean the `<img>` never 404s, which keeps the layout stable.)

#### Merging legacy `seasonEpisodes` into `downloadLinks`

The most interesting few lines in the file:

```js
const downloadLinks = (Array.isArray(entry.downloadLinks) ? entry.downloadLinks : []).map(
  (d) => {
    if (isTv && (!d.seasons || d.seasons.length === 0) && Array.isArray(entry.seasonEpisodes) && entry.seasonEpisodes.length) {
      return { ...d, seasons: entry.seasonEpisodes };
    }
    return d;
  }
);
```

Background: the newer data model stores episodes **on each quality row** — every download link carries its own `seasons` array (season number + episode list), because different qualities can have different episode sets. Older saved documents instead stored one flat `seasonEpisodes` array at the top level of the document.

This code migrates the old shape **at read time** instead of writing a database migration: for TV entries, any download row that has no `seasons` of its own inherits the document-level `seasonEpisodes`. Three guards make it safe:

- `isTv` — movies have no seasons at all.
- `!d.seasons || d.seasons.length === 0` — never overwrite real per-quality data.
- `Array.isArray(...) && ...length` — skip when there's nothing to inherit.

`{ ...d, seasons: entry.seasonEpisodes }` is a **spread**: build a copy of the row, then override one field. The original row is untouched (immutability), which matters because React compares object references when deciding to re-render.

Result: everything downstream (`SeriesSeasons.jsx`, `getMovieDetails`) can assume `downloadLinks[].seasons` always exists for series, and the legacy field effectively disappears.

#### Every field and its default

The returned object is the canonical movie shape. The defaults are the "why" of this file — no component should ever have to write `movie.rating || 0` again:

| Field | Source | Fallback | Why |
| --- | --- | --- | --- |
| `id` | `Number(entry.tmdbId)` | `NaN` if missing | The app's primary key; routes are `/movie-details/:id` |
| `title` | `entry.title` | `"Untitled"` | A card with no text breaks the layout |
| `genre` | `entry.genre` | `""` | Filters and categories read it |
| `lang` | `entry.lang` | `"English"` | Language filters and audio tags |
| `type` | `"Series"` if `mediaType === "tv"`, else `"Movie"` | — | Translates TMDB's `movie`/`tv` into display words |
| `imageUrl` | `entry.poster` | `PLACEHOLDER` | See above |
| `link` | always `"#"` | — | Legacy field kept so old card code doesn't crash; cards link via `<Link>` now |
| `uploadedAt` | `new Date(entry.publishedAt)` | `new Date()` (now) | A real `Date` object, so `.getFullYear()` and sorting work; unknown dates sort as newest |
| `_published` | always `true` | — | The flag that tells `getMovieDetails` which branch to use (see below) |
| `downloadLinks` | merged array (above) | `[]` | Download rows, each with `label`, `resolution`, `size`, `quality`, `downloadLink`, `seasons` |
| `seasonEpisodes` | `entry.seasonEpisodes` | `[]` | Kept for compatibility even after the merge |
| `imdbID` / `overview` / `released` / `director` / `writer` | stored value | `""` | Metadata shown on the details page |
| `rating` / `votes` | stored value | `0` | Numbers, so `>= 8` comparisons in `Tags.js` work |
| `runtime` | stored value | `null` | "not known" rather than `0 minutes` |
| `actors` / `screenshots` | stored value | `[]` | `Array.isArray` guards against a document that saved `null` |

`_published: true` deserves its own line: it is **not** data from the database. It's a stamp this transform adds, meaning "this object came from our MongoDB store." `getMovieDetails` checks it to decide whether to build the page from stored download links or from generated defaults, and `MovieDetails.jsx` uses it to decide whether TMDB metadata should be looked up by `tmdbId` or by `imdbID`.

---

### `frontend/src/assets/movieDetails.js` — deriving everything the details page shows

#### The problem this file solves

Your details page needs a lot of text: an SEO-ish release title, a paragraph of blurb, a list of download buttons, category chips, size/quality summary strings. None of that is stored in MongoDB — storing it would be redundant and would drift out of date whenever a quality or size changed. Instead, `getMovieDetails(movie)` **derives** it from the movie object on every render.

- **What this is (derived data):** values computed from existing data at display time rather than stored. The rule of thumb is: store the *facts* (title, language, resolutions), derive the *presentation* (sentences, labels).

The function handles two worlds, and the first line picks the branch:

```js
export const getMovieDetails = (movie) => {
  // ── Published (user-added) movies: render from stored data ───────────────
  if (movie._published) { ... }
  // ... else: generated/demo branch
```

- **`_published` branch** — a movie saved through `AddMovies.jsx`. Real download URLs, real sizes. Everything is built from `movie.downloadLinks`.
- **fallback branch** — a movie object that only has the basics (`title`, `lang`, `type`, `genre`). It generates plausible-looking rows so cards and detail pages never render empty. `Postcards.jsx` calls this for every card, since it only needs `releaseTitle`.

#### `genScreenshots` — the placeholder screenshot generator

```js
const SCREEN_BASE = "https://placehold.co/640x360/09090b/e4e4e7/png?text=";

const textPart = (text) =>
  encodeURIComponent(text)
    .replace(/%20/g, "+")
    .replace(/%27/g, "'");

const genScreenshots = (movie) => {
  if (Array.isArray(movie.screenshots) && movie.screenshots.length > 0) {
    return movie.screenshots;
  }
  return [1, 2, 3].map((n) => `${SCREEN_BASE}${textPart(movie.title)}+Screen+${n}`);
};
```

If the movie has stored screenshots, they're used as-is. Otherwise it fabricates three 640x360 placeholders (16:9, same dark colours as the poster fallback) that say things like `Inception+Screen+1`.

- **What this is (`encodeURIComponent`):** a built-in that makes a string safe to put inside a URL — spaces become `%20`, apostrophes `%27`, and so on. Without it, a title like `Don't Look Up` would produce a broken URL.
- The two `.replace` calls are cosmetic cleanups: `%20` back to `+` (the more readable "space" character in query strings) and `%27` back to a literal `'` (apostrophes are actually legal in URLs, so keeping the real character looks nicer in the generated image).

`MovieDetails.jsx` treats these placeholders as the **last** resort in a screenshot chain: TMDB backdrops → a direct "rescue" fetch to TMDB → stored `movie.screenshots` → these placeholders. So the generator guarantees the section is never empty, even when the API key is missing.

#### `VIDEO_AUDIO` and `getAudioTag` — turning a language into marketing copy

```js
const VIDEO_AUDIO = {
  English: "English With Subtitles",
  Hindi: "Hindi",
  Dubbed: "Dual Audio {Hindi-English}",
  Subbed: "Org Audio With English Subs",
  "Multi Audio": "Multi Audio {Hindi-English-Spanish}",
};

const getAudioTag = (movie) => {
  const lang = movie.lang;
  if (lang === "Dubbed") return "{Hindi-English}";
  if (lang === "Multi Audio") return "{Hindi-English-Spanish}";
  if (lang === "Hindi") return "{Hindi}";
  if (lang === "Subbed") return "{Org Audio}";
  return "{English}";
};
```

`movie.lang` is a short category name; these two mappings expand it into the two places it appears: a long phrase inside the blurb, and a short `{...}` tag inside download labels and release titles. `DownloadSection.jsx` colours those `{...}` tokens red with a regex, so the short form is a deliberate formatting convention, not decoration.

Note the default: anything unexpected becomes `{English}` — the same "last resort" style as the poster and screenshot fallbacks.

#### `parseSeasonRange` — reading season numbers out of a title

```js
export const parseSeasonRange = (title) => {
  const rangeMatch = title.match(/(?:Season|S)\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const list = [];
    for (let i = start; i <= end; i++) list.push(i);
    return { start, end, list };
  }
  const singleMatch = title.match(/(?:Season|S)\s*(\d+)/i);
  if (singleMatch) { ... }
  return { start: 1, end: 1, list: [1] };
};
```

- **What this is (regular expression / regex):** a text-matching pattern. Here `/(?:Season|S)\s*(\d+)\s*[-–]\s*(\d+)/i` means: the word "Season" or the letter "S", optional spaces, a number, a hyphen (either the ASCII `-` or the typographic `–`), another number — case-insensitive. The parentheses are *capture groups*, and `match()` returns the captured strings, so `rangeMatch[1]` is the first number.
- **What this is (`parseInt(x, 10)`):** converts text to a whole number. The `10` says "base 10" and avoids surprises like `"08"` being read as octal in old engines.

Three outcomes: a range like `"Breaking Bad Season 1-5"` gives `{ start: 1, end: 5, list: [1,2,3,4,5] }`; a single season gives a one-item list; no season mentioned at all falls back to `{ start: 1, end: 1, list: [1] }` so the page still renders. The returned `list` array is what lets `genDownloads` produce one set of rows **per season**, and `SeriesSeasons.jsx` uses the same shape for its season picker.

#### `genDownloads` — fabricating rows for the non-published branch

```js
if (movie.type === "Series") {
  const { list } = parseSeasonRange(movie.title);
  const downloads = [];
  for (const s of list) {
    downloads.push(
      { label: `Season ${s} ${audioTag} 480p x264 Msubs [200MB]`, cls: "480" },
      { label: `Season ${s} ${audioTag} 720p 10Bit Msubs [350MB]`, cls: "720" },
      { label: `Season ${s} ${audioTag} 1080p x264 Msubs [1GB]`, cls: "1080" }
    );
  }
  return downloads;
}
```

Three fixed qualities per season, with `cls` set to `"480" / "720" / "1080"`. `DownloadSection.jsx` reads `cls` to reconstruct "480p" when it builds its heading, and falls back to parsing the label when `cls` is missing. These rows have no `href`, so their Download buttons point at `"#"` — they're display scaffolding for movies that came from TMDB rather than from your admin form.

#### `buildCategories` — the chip list, sorted

```js
const buildCategories = (movie) => {
  const categories = new Set();
  const isSeries = movie.type === "Series";
  categories.add(isSeries ? "Series" : "Movies");
  categories.add(movie.genre);
  const lang = movie.lang || "";
  if (lang === "Dubbed") categories.add("Dual Audio");
  if (lang === "Hindi") categories.add("Hindi");
  if (lang === "Subbed") categories.add("Subbed");
  if (lang === "English") categories.add("English");
  return Array.from(categories).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
};
```

- **What this is (`Set`):** a collection that stores each value only once. Perfect here — adding the same category twice is harmless, so the `if` chain doesn't need dedup logic.
- **What this is (`localeCompare`):** the built-in, locale-aware string comparison — better than `a < b` for real text. `{ numeric: true }` makes `"1080p"` sort after `"720p"` numerically instead of character-by-character (`"1080p" < "720p"` alphabetically!), and `sensitivity: "base"` ignores case and accents.

Categories are the sidebar/chip words: the type (`Movies`/`Series`), the genre, and whichever language category applies. `MovieDetails.jsx` renders this array directly.

#### `BOILERPLATE`

```js
const BOILERPLATE =
  "MoviesMod.Org is The Best Website/Platform For Bollywood And Hollywood HD Movies. ...";
```

A fixed closing paragraph appended to every description. `getMovieDetails` returns `description: [blurb, "", BOILERPLATE]` — an array of paragraphs, where the empty string acts as a spacer, and `MovieDetails.jsx` renders it with `p ? <p>...</p> : null` (so the blank entry produces no tag). It mirrors the layout of the site this project is modelled on.

#### The `_published` branch — real data end to end

This is the branch your admin-added movies take. In order:

**1. Which seasons exist?** Derived from the download rows themselves, not from the title:

```js
const seasonNums = new Set();
(movie.downloadLinks || []).forEach((d) =>
  (d.seasons || []).forEach((s) => seasonNums.add(s.season))
);
const seasonList = [...seasonNums].filter(Boolean).sort((a, b) => a - b);
```

Collect every `season` number found on any quality row into a `Set` (dedupes across rows), then `filter(Boolean)` drops undefined entries and `.sort((a, b) => a - b)` sorts numerically (the classic ascending-comparator; without it `.sort()` would sort 1, 10, 2 as text). If nothing is found, the same `{ start: 1, end: 1, list: [1] }` fallback as before applies.

**2. The download rows the page actually renders:**

```js
const downloads = (movie.downloadLinks || []).map((d) => ({
  label: d.label,
  cls: null,
  href: d.downloadLink || "#",
  seasons: isSeries ? (d.seasons || []) : [],
  isSeries,
}));
```

Stored `label` and `downloadLink` pass through (with `"#"` if the link is empty so the button still renders). `cls: null` is intentional: the real resolution is already inside the stored label, and `DownloadSection` falls back to reading it from there. `seasons` is emptied for movies — a single movie has nothing to pick per season. `SeriesSeasons.jsx` then uses `seasons` (or `seasonRange.list` as a fallback) to build the per-season episode buttons.

**3. The audio tag, as a nested ternary** (same mapping as `getAudioTag`, inlined):

```js
const audioTag = movie.lang === "Dubbed" ? "{Hindi-English}"
  : movie.lang === "Multi Audio" ? "{Hindi-English-Spanish}"
  : movie.lang === "Hindi" ? "{Hindi}"
  : movie.lang === "Subbed" ? "{Org Audio}"
  : "{English}";
```

- **What this is (nested ternary):** `condition ? a : b` chained, i.e. an if/else ladder written as an expression. Read it top-down: the first true condition wins, and the final `:` is the fallback. It's compact but harder to scan than `getAudioTag`'s `if` list — that duplication exists because the published branch was written self-contained.

**4. Size and quality summary strings:**

```js
const quals = (movie.downloadLinks || [])
  .map((d) => `${d.resolution}${d.size ? ` [${d.size}]` : ""}`)
  .filter(Boolean);
const qualityText = quals.length
  ? quals.join(" || ")
  : "480p [200MB] || 720p [350MB] || 1080p [1GB]";
```

Each row becomes `720p [350MB]`, all rows are joined with ` || `, and if a document somehow has no rows, a realistic default is used so the headline never says "Download ... " with nothing after it. The same pattern produces:

- `size` — every stored `size` joined with `" & "`, else `"200MB & 350MB & 1GB"`.
- `quality` — `resolution quality` per row joined with `" & "` (e.g. `480p & 720p & 1080p – WeB-DL`), with its own default.

**5. The release title — the page's `<h1>`:**

```js
const releaseTitle = `Download ${movie.title}${
  isSeries && !/Season/i.test(movie.title) ? ` (${seasonText})` : ""
} ${audioTag} Esubs WeB-DL ${qualityText}`;
```

- **What this is (template literal):** a backtick string with `${...}` placeholders — much easier to read than gluing strings with `+`.
- `/Season/i.test(...)` returns true if the title already mentions a season; the season suffix is only *added* when it isn't already there, so you never get `"Show (Season 1-3) Season 1-3"`.

So a stored movie produces something like: `Download Breaking Bad (Season 1-5) {Hindi-English} Esubs WeB-DL 480p [200MB] || 720p [350MB] || 1080p [1GB]`.

**6. The blurb:**

```js
const blurb = `Download ${movie.title} ${
  VIDEO_AUDIO[movie.lang] || movie.lang
} and is available in 480p, 720p & 1080p. This ${
  movie.type.toLowerCase()
} is based on ${movie.genre || "your favorite title"}. Click on the links below to proceed.`;
```

Assembled from three facts (title, language phrase, type/genre) with two softeners: `VIDEO_AUDIO[...] || movie.lang` uses the stored language if the map has no entry, and `|| "your favorite title"` keeps the sentence grammatical when genre is empty. Note it hardcodes "480p, 720p & 1080p" even if the stored links differ — a deliberate simplification, since the accurate per-quality text appears in `qualityText` and in the download rows themselves.

**7. Everything else** is fixed: `format: "Mkv"`, `subtitles: "Yes (English)"`, `season` (the `Season 1-5` text or `null` for movies), and `seasonRange` (used by `SeriesSeasons.jsx` and the TMDB hook to know how many seasons to look up).

#### The fallback branch (non-published movies)

Same output shape, generated instead of stored:

```js
const hasSeasonInTitle = isSeries && /:\s*Season\s*\d+|:\s*S\d+|\(\s*Season\s/i.test(movie.title);
const seasonTag = isSeries ? (hasSeasonInTitle ? "" : ` (${seasonText})`) : "";
const releaseTitle =
  `Download ${movie.title}${seasonTag} ${audioTag} Esubs WeB-DL 480p [200MB] || 720p [350MB] || 1080p [1GB]`;
```

Differences from the published branch worth noticing:

- `imdbID` is `""` — there's no stored IMDb id, so `MovieDetails.jsx` knows to fall back to TMDB lookups by other means.
- Season detection is title-based (`parseSeasonRange`), with a *more aggressive* `hasSeasonInTitle` regex that also catches `": Season 3"` and `"(Season "` forms, so the `(Season N)` suffix isn't duplicated.
- `size` and `quality` are hardcoded strings — `"200MB & 350MB & 1GB (Each Episode)"` and `"480p & 720p & 1080p – WeB-DL"` — because these rows are fabricated anyway.
- `blurb` is nearly identical but reads `${movie.genre}` directly, so an empty genre would show "based on ." — acceptable here because this branch is only for demo/TMDB-derived objects that always carry a genre.

Both branches return the **same keys**, which is the real contract of this file: `MovieDetails.jsx` and `Postcards.jsx` can consume either without checking which one they got.

---

### `frontend/src/assets/Tags.js` — normalisation and the tag engine

#### Why normalisation is needed at all

Three different vocabularies describe the same movie:

- **TMDB** (the external API and what gets saved) uses codes and long names: `en`, `hi`, `ta`, and genres like `Science Fiction`.
- **Your navbar and tag links** use display words: `English`, `Hindi`, `Sci-Fi`.
- **The stored `lang` field** on a movie is a *code* like `en`, because that's what TMDB gave the admin form.

Without a translation layer, a "Hindi" nav link would match nothing. The comment at the top of the file says it plainly: *"Everything funnels through these helpers so tags, nav dropdowns and the home page agree."*

#### `langCode` and `langName` — the two-way dictionary

```js
const LANG_CODES = { english: "en", hindi: "hi", spanish: "es", tamil: "ta", telugu: "te",
  kannada: "kn", malayalam: "ml", korean: "ko", japanese: "ja",
  french: "fr", german: "de", chinese: "zh", mandarin: "zh", italian: "it" };
const LANG_NAMES = { en: "English", hi: "Hindi", ... };

export const langCode = (v) => {
  const s = String(v || "").trim().toLowerCase();
  return LANG_CODES[s] || s;
};
export const langName = (v) => LANG_NAMES[langCode(v)] || String(v || "");
```

- `langCode` accepts anything (`"English"`, `" EN "`, `"en"`, `"Hindi"`), lowercases/trims it, and returns the two-letter code. Unknown input passes through unchanged (`LANG_CODES[s] || s`), so a code that's already a code is its own answer.
- `langName` goes the other way, and `HomePage.jsx` uses it to render readable headings like `Hindi · Series · 2024` from a `?lang=hi` URL.
- Note `mandarin: "zh"` — an alias so either word finds the same movies, and there's deliberately no `LANG_NAMES.zd`-style entry for `mandarin`, so `langName("Mandarin")` returns `"Chinese"`.

`SOUTH_INDIAN = ["ta", "te", "kn", "ml"]` is the list used by the "south" alias below.

#### `matchesLang` — one function for every language filter

```js
const isMultiAudio = (m) => !["en", "hi"].includes(m.lang);

export const matchesLang = (m, value) => {
  const code = langCode(value);
  if (code === "multi" || code === "dual audio" || code === "dubbed" || code === "multi audio") {
    return isMultiAudio(m);
  }
  if (code === "south" || code === "south indian") return SOUTH_INDIAN.includes(m.lang);
  return m.lang === code;
};
```

Three rules, in priority order:

1. **Group aliases.** `multi`, `dual audio`, `dubbed` and `multi audio` all mean "not native English or Hindi" — that's `isMultiAudio`. This matches how the site actually buckets things: anything Tamil, Korean, Spanish, etc. is presented as dual/multi audio.
2. **Regional aliases.** `south` and `south indian` match the four South Indian codes (`ta`, `te`, `kn`, `ml`) regardless of the actual language.
3. **Exact code.** Anything else is a straight comparison against the movie's stored `m.lang`, after normalisation — so `?lang=hi` finds every `lang: "hi"` document.

`HomePage.jsx` uses this for the `lang` URL param, and `Tags.js` itself reuses the aliases internally.

#### `matchesGenre` — with the Sci-Fi fix

```js
const genreAlias = (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (s === "sci-fi" || s === "scifi") return "science fiction";
  return s;
};

export const matchesGenre = (m, value) =>
  String(m.genre || "").toLowerCase() === genreAlias(value);
```

Both sides are lowercased before comparing (case differences would otherwise silently match nothing). The one special case is `Sci-Fi`/`scifi` → `science fiction`, because TMDB calls the genre "Science Fiction" while people (and nav links) write "Sci-Fi". Everything else is a plain equality after normalisation.

#### `tagRules` — every tag, and exactly what it selects

```js
const tagRules = [
  { name: "English",        test: (m) => m.lang === "en" },
  { name: "Hindi",          test: (m) => m.lang === "hi" },
  { name: "Multi Audio",    test: isMultiAudio },
  { name: "Spanish",        test: (m) => m.lang === "es" },
  { name: "2026",           test: (m) => (m.uploadedAt ? new Date(m.uploadedAt).getFullYear() === 2026 : false) },
  { name: "Drama Series",   test: (m) => m.type === "Series" && matchesGenre(m, "Drama") },
  { name: "Spanish Series", test: (m) => m.lang === "es" && m.type === "Series" },
  { name: "Netflix",        test: (m) => m.type === "Series" && (m.rating || 0) >= 8 },
];
```

Reading each rule as a question about a movie:

- **English** — stored language code is `en`.
- **Hindi** — stored language code is `hi`.
- **Multi Audio** — anything that isn't `en` or `hi` (the `isMultiAudio` helper reused as the test directly).
- **Spanish** — `es` only.
- **2026** — the *upload* year (`uploadedAt` → `getFullYear()`), not the release year, and movies without a date are excluded. `uploadedAt` is a `Date` only because `transformPublished` made it one; here `new Date(...)` re-wraps it defensively either way.
- **Drama Series** — compound rule: must be a Series **and** match the Drama genre through the alias-aware helper.
- **Spanish Series** — compound: `es` and Series. (Note it's stricter than the "Spanish" tag, which includes Spanish movies.)
- **Netflix** — series rated 8 or higher. The comment above it is important: **there is no OTT/platform field in the data**, so this is an honest approximation ("top-rated series"), not real platform information.

Two structural points:

- A rule is just `{ name, test }` — a name plus a predicate function. Adding a tag means adding one line here; the rest of the system picks it up automatically.
- `getTags()` returns `tagRules.map((t) => ({ name: t.name }))` — the *names only*, with the test functions stripped out. That's what `MovieHeader.jsx` and `MovieDetails.jsx` render as links; the predicates are an internal detail.

#### `getMoviesForTag`

```js
export const getMoviesForTag = (name, movies = []) => {
  const rule = tagRules.find(
    (t) => t.name.toLowerCase() === String(name).toLowerCase()
  );
  if (!rule) return [];
  return movies.filter(rule.test);
};
```

Look up the rule by name (case-insensitively, so `?tag=netflix` works), then `filter` the given array with it. Two things to notice:

- **It filters the array you hand it** — it never fetches. `HomePage.jsx` passes in the already-language/genre/year-filtered list, so tags compose with the other filters. Unknown tag names return `[]` rather than throwing, so a mistyped URL shows an empty grid instead of crashing.
- `HomePage` actually merges this with a plain text search (`textMatches` plus `ruleMatches`, deduped by `id` in a `Set`), so a tag also catches titles that merely *mention* the word.

#### The OTT buckets — honest heuristics

```js
const OTT_BUCKETS = {
  netflix:          (m) => m.type === "Series" && (m.rating || 0) >= 8,
  "amazon prime":   (m) => m.type === "Series" && (m.rating || 0) >= 7 && (m.rating || 0) < 8,
  "disney+ hotstar":(m) => matchesGenre(m, "Animation"),
  sonyliv:          (m) => m.lang === "hi" && m.type === "Series",
  zee5:             (m) => m.lang === "hi" && m.type === "Movie",
  "mx player":      (m) => isMultiAudio(m) && m.type === "Series",
};
```

- **What this is (heuristic):** a rule of thumb that gives a useful answer without complete information. Since no document stores "which platform this is on", each OTT name is mapped to a *guessable* combination of the fields you do have — type, language, genre, rating:

| Bucket | Approximated by | Rationale |
| --- | --- | --- |
| `netflix` | Series rated ≥ 8 | "premium / top-rated series" |
| `amazon prime` | Series rated 7 to <8 | the next tier down, so the two buckets don't overlap |
| `disney+ hotstar` | Animation genre | Disney's identity genre |
| `sonyliv` | Hindi series | Hindi-language TV platform |
| `zee5` | Hindi movies | its sibling bucket |
| `mx player` | Multi-audio series | the free/dubbed-content bucket |

The ranges are deliberately **disjoint** — a series rated 8.2 can only ever be "Netflix", never also "Prime" — so no movie appears under two platforms. Note the difference in key style: lookup keys are lowercase (`"amazon prime"`, `"disney+ hotstar"`), which is why `getMoviesForOtt` lowercases its input.

#### `getMoviesForOtt`

```js
export const getMoviesForOtt = (name, movies = []) => {
  const bucket = OTT_BUCKETS[String(name || "").trim().toLowerCase()];
  return bucket ? movies.filter(bucket) : [];
};
```

Same shape as `getMoviesForTag`: normalise the name, find the function, filter. Unknown names return `[]`. In `HomePage.jsx` it runs early in the filter chain (`if (ottParam) base = getMoviesForOtt(ottParam, base)`), so OTT can be combined with a language or year filter on top.

---

### Key takeaways

- **One file owns the network to our own backend.** Every `fetch` against the Express API lives in `frontend/src/api/moviesApi.js`; components only call `list/get/add/update/remove/exists` plus the admin-password helpers, so URLs, headers, error text and caching are defined once. It is *not* every `fetch` in the app: 6 more calls hit TMDB directly, in `useTmdbMovie.js` (3), `AddMovies.jsx` (3) and `MovieDetails.jsx` (1) — those bypass this file, and with it the cache and the shared error handling.
- **`fetch` never throws on 404/500** — that's why every method checks `res.ok`/`res.status` itself, and why `get()`/`exists()` treat 404 as a normal `null`/`false` answer while real server errors throw.
- **`list()` has two modes**: `?page=&limit=` for the paginated home grid, `?all=1` for tag/search/filter views, and it normalises both into `{ movies, total, page, totalPages }` so components don't care which backend version answered.
- **`listCache` is a module-level `Map`** that makes Home → Details → Back free; `add`, `update` and `remove` call `listCache.clear()` *before* the request (fail-safe invalidation). `get()` and `exists()` are deliberately never cached.
- **The admin password is a `sessionStorage` value**, so it survives reloads in the tab and vanishes when the tab closes; it's sent to the backend in the `x-admin-password` header, and the backend — not the browser — decides if it's valid.
- **`transformPublished` is the single adapter** between MongoDB documents and the UI: it merges legacy `seasonEpisodes` into each `downloadLinks[].seasons` at read time, fills every field with a safe default, and stamps `_published: true`.
- **`getMovieDetails` derives, never stores**: release title, download rows, categories, blurb, size/quality strings and screenshots are computed from the movie object on every render, in two branches — real stored links when `_published`, generated placeholder rows otherwise. Both branches return the same keys.
- **Fallbacks are everywhere on purpose** (`placehold.co` poster, generated screenshot stills, `"{English}"` audio tag, default quality text, `parseSeasonRange`'s `[1]`), so a sparse document still renders a complete-looking page.
- **`Tags.js` is the translation + filtering layer**: `langCode`/`langName` reconcile TMDB codes with display names, `matchesLang` understands group aliases (`multi`, `south`) and `matchesGenre` fixes `Sci-Fi` → `science fiction`; `tagRules` and `OTT_BUCKETS` are plain predicate tables, with the OTT platform names being explicit heuristics over type/lang/genre/rating until real platform data exists.
- **If you add a tag, an OTT bucket, or a movie field**, the pattern is: one entry in the relevant table/object, and (for fields) one line with a default in `transformPublished` — the rest of the app needs no changes.
## 04. TMDB Integration — the useTmdbMovie Hook

`frontend/src/hooks/useTmdbMovie.js` is 219 lines and does one job: given a movie or series, go to TMDB (The Movie Database), fetch the real metadata and images, reshape them into a single predictable object, and hand it to whoever asked. It is **not** the only file in `frontend/src` that talks to `api.themoviedb.org` — two others hold their own separate copies of the fetching logic instead of importing this one:

- **`frontend/src/pages/AddMovies.jsx`** searches TMDB and stores the metadata into MongoDB at publish time (its own `/search/multi` and detail calls, covered later).
- **`frontend/src/pages/MovieDetails.jsx`** makes one direct call of its own, at line 77: the "screenshot rescue" fetch that re-requests backdrops when the hook comes back empty. It's covered below (the `include_image_language` note, the screenshots chain, and the failure-modes section) and in full in Section 06.

What the hook *is*, uniquely, is the shared TMDB client for metadata — everything that renders a details page reads its output, and neither of the other two files duplicates the reshaping, caching, or `/find` discovery done here.

Everything on a details page that looks "professional" — the poster, the backdrop, the screenshots, the rating, the cast list — comes from this hook, not from your database. (The one exception is the screenshots in the rescue case above, where `MovieDetails` fetches the backdrops itself.)

### What TMDB is, and why the site leans on it

**What this is:** TMDB (themoviedb.org) is a free, community-maintained movie/TV database with a REST API. It exposes metadata (titles, plots, cast, ratings, air dates, season/episode lists) plus a full image CDN. You sign up, get an API key, and call endpoints like `https://api.themoviedb.org/3/movie/550?api_key=...`.

The site uses it for two reasons:

- **You don't have to type it.** The Add Movies page (`frontend/src/pages/AddMovies.jsx`) searches TMDB, and publishing copies the metadata into MongoDB. But the *display* page still re-fetches from TMDB live, because the stored copy is a denormalised snapshot (it exists so the page renders if TMDB ever fails).
- **You don't have to host images.** TMDB gives you *paths* like `/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg`. You build a full URL pointing at their CDN. Your MongoDB documents (`backend/models/Movie.js`) store only paths and link strings — no image bytes ever touch your server.

The API key is read from Vite's environment:

```js
const key = import.meta.env.VITE_TMDB_API_KEY;
```

**What this is:** `import.meta.env` is how Vite exposes environment variables to browser code. Only variables prefixed `VITE_` are included, and Vite *inlines their values into the built JavaScript bundle* — the key ships to every visitor. That's normal for a client-side TMDB app (the key is free and not a secret in the billing sense), but it's worth knowing it is public. It's declared in `frontend/.env.example` and the real value lives in `frontend/.env`, which `.gitignore` excludes.

### The file at a glance

`frontend/src/hooks/useTmdbMovie.js` contains exactly four things:

| Export / binding | Kind | Purpose |
|---|---|---|
| `tmdbPoster(path, size)` | named export | Build a poster URL |
| `tmdbBackdrop(path, size)` | named export | Build a backdrop URL |
| `tmdbCache` | module-level `const {}` | Session-wide results cache |
| `useTmdbMovie` (default) | custom hook | Fetch + reshape, returns `{ data, loading, error }` |

### The image URL helpers

```js
const TMDB_IMG = "https://image.tmdb.org/t/p";
export const tmdbPoster = (path, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const tmdbBackdrop = (path, size = "w1280") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
```

TMDB image URLs are always `<base>/<size><path>`; the size prefix is a resize directive (`w300`, `w500`, `w780`, `w1280`) so the browser downloads a right-sized file instead of the original. Note the guard: a missing `path` returns `null`, not a broken URL string. `null` is important downstream — `MovieDetails.jsx` does `t.poster || movie.imageUrl`, and `null` is falsy so the fallback kicks in, whereas the string `"https://image.tmdb.org/t/p/w500undefined"` would render as a broken image.

### Custom hooks in React

**What this is:** a custom hook is any function whose name starts with `use` that calls built-in hooks (`useState`, `useEffect`, …) internally and returns a small API (usually state plus nothing else). It's just a way to package stateful logic so several components can share it. Custom hooks obey the Rules of Hooks: call them at the top level of a component, never inside conditions or loops.

`useTmdbMovie(identifier, seasonRange)` hides all of the fetching, caching, error handling and reshaping behind a one-line call. Its only consumer is `frontend/src/pages/MovieDetails.jsx`:

```js
const { data: tmdb, loading: tmdbLoading } = useTmdbMovie(
  tmdbIdentifier,
  movie?._published ? null : siteData?.seasonRange,
);
```

`seasonRange` is only needed for TV — it's the list of season numbers to fetch, `{ start, end, list: [1, 2, 3] }`, built by `frontend/src/assets/movieDetails.js` (`parseSeasonRange` for the legacy titles, or from the stored download links for published ones).

### Two identifier shapes: `{imdbID}` legacy vs `{tmdbId, mediaType}`

The hook accepts two different shapes, and the caller picks based on where the record came from (`MovieDetails.jsx` lines 55-57):

```js
const tmdbIdentifier = movie?._published
  ? { tmdbId: movie.id, mediaType: movie.type === "Series" ? "tv" : "movie" }
  : { imdbID: siteData?.imdbID };
```

| Shape | Who uses it | Why |
|---|---|---|
| `{ tmdbId, mediaType }` | Published (user-added) entries, flagged `_published` by `frontend/src/assets/moviesStore.js` | They were created *from* a TMDB search result, so the TMDB id is already the primary key — `tmdbId` is `required` and `unique` in `backend/models/Movie.js`. Direct lookup, no discovery step. |
| `{ imdbID }` | Legacy/built-in entries in `frontend/src/assets/movieDetails.js` | Those predate the TMDB integration; the only external id they carry is an IMDb id (`tt0111161`). The hook must *discover* the TMDB id from it. |

Inside the hook both are unpacked loosely with optional chaining:

```js
const imdbID = identifier?.imdbID;
const tmdbId = identifier?.tmdbId;
const mediaTypeHint = identifier?.mediaType;
const seasonList = seasonRange?.list || [];
const cacheKey = `${imdbID || tmdbId}_s${seasonList.join(",") || "0"}`;
```

`mediaType` is called a *hint* because in the legacy path it isn't supplied — the hook has to work out whether an IMDb id is a film or a show. Note that `identifier?.imdbID` reads a property off possibly-`undefined`; **what this is:** optional chaining (`?.`) short-circuits to `undefined` instead of throwing `TypeError: Cannot read properties of undefined`, which matters because `MovieDetails` calls the hook with `{ imdbID: siteData?.imdbID }` before the document has loaded.

### The find-by-imdb fallback

When only an IMDb id is known, the hook calls TMDB's `/find` endpoint, which translates an external id into a TMDB one:

```js
const findRes = await fetch(
  `https://api.themoviedb.org/3/find/${imdbID}?api_key=${key}&external_source=imdb_id`
);
const findData = await findRes.json();
if (cancelled) return;

const movieResult = findData.movie_results?.[0];
const tvResult = findData.tv_results?.[0];
mediaType = movieResult ? "movie" : tvResult ? "tv" : null;
id = movieResult?.id || tvResult?.id;
```

The response always contains both buckets (`movie_results`, `tv_results`), and exactly one is populated. The hook checks movies first, then TV, and derives the media type from whichever matched — that's why it's a *hint* and not a requirement. If neither matches, it fails soft with a readable message:

```js
if (!id || !mediaType) {
  setState({ data: null, loading: false, error: "Not found on TMDB" });
  return;
}
```

There is a third path worth noticing: the `else if (!id || !mediaType)` branch right after it. That fires when the identifier is effectively empty — which is the normal case for legacy entries, because `movieDetails.js` hard-codes `const imdbID = "";` for them. No id at all means no TMDB data and no error: `loading` was initialised to `false` (`Boolean(imdbID || tmdbId)`), and the effect bails at `if (!imdbID && !tmdbId) return;`. Those entries render purely from stored data and placeholder screenshots.

### The module-level tmdbCache, and why it survives navigation

```js
const tmdbCache = {};
```

**What this is:** module scope. Code at the top level of an ES module runs exactly once, when the module is first imported — no matter how many components use it or how often they mount and unmount. State inside a component dies with the component; state in module scope lives for as long as the page is open.

That distinction is the whole point. React Router unmounts `MovieDetails` every time you navigate away and mounts a fresh one when you come back. A cache kept in `useState` inside the hook would be thrown away on every navigation. A module-level object survives, so:

- Click movie A, go back home, click movie A again → **zero** network requests. The effect's first check is `if (isCacheValid(cacheKey)) { setState({ data: tmdbCache[cacheKey], ... }); return; }`.
- For a series this is a big deal: a 5-season show is 1 detail request + 5 season requests. Without the cache, every re-visit pays all six again (and hits TMDB's rate limits, ~50 requests/second, faster than you'd think when a user is browsing around).

The cache key packs both the identity and the season selection:

```js
`${imdbID || tmdbId}_s${seasonList.join(",") || "0"}`   // e.g. "550_s0", "1399_s1,2,3"
```

Including the season list matters: the same show fetched for "Season 1" and for "Seasons 1-5" produces different `seasonsData`, so they must be separate entries. Minor wart: with no id the key is the literal string `"undefined_s0"`, which is truthy but never stored into, so it's harmless.

The cache is never evicted. Within one page session that's fine (TMDB data changes slowly), and a hard refresh (F5) clears it, because refreshing the page destroys all module state.

### The lazy `useState` initialiser

```js
const [state, setState] = useState(() => {
  if (cacheKey && isCacheValid(cacheKey)) {
    return { data: tmdbCache[cacheKey], loading: false, error: null };
  }
  return { data: null, loading: Boolean(imdbID || tmdbId), error: null };
});
```

**What this is:** passing a *function* to `useState` is the lazy-initialiser form — React calls it only on the first render and uses its return value as the initial state. It's used here so the cache can be consulted at mount time without an extra render flicker: if the data is already cached, the component's very first paint already has it, and `loading` never becomes `true` (which matters because `MovieInfoCard` renders a "Loading..." box while `tmdbLoading` is true).

Otherwise the initial state is `loading: true` only when there's actually something to fetch.

### The useEffect + cancelled flag pattern

```js
let cancelled = false;
...
fetchFromTmdb();
return () => { cancelled = true; };
```

**What this is:** `useEffect` runs *after* render and is used for anything that touches the outside world — fetching, timers, subscriptions. It can return a **cleanup function**, which React calls right before the effect runs again, or when the component unmounts. **What this is:** a race condition is a bug where the result depends on the timing of overlapping operations rather than the order you intended.

The race this prevents, concretely:

1. You open Movie A. The effect runs and starts a fetch that takes 3 seconds.
2. You press Back, then open Movie B. Movie A's component unmounted; a *new* component for B mounts and starts its own fetch.
3. Movie A's slow response finally arrives. Without protection it would call `setState` on a component that is now supposed to be showing Movie B — you'd see Movie A's title and poster on Movie B's page.

The cleanup closes that window: when the component unmounts (or the effect re-runs for a new id), React calls the old cleanup, which flips that run's private `cancelled` variable to `true`. Every `await` in the chain re-checks it before touching state — there are four checkpoints: after the `/find` response (line 59), after the detail response (line 92), after `await seasonFetch` (line 127), and in the `catch` (line 204, so a stale failure can't clobber fresh data either). Because each effect run closes over its own `cancelled`, only the latest run is allowed to write.

Two related details in the same effect:

- **`prevCacheKeyRef` (line 22)** — a `useRef` that the effect writes but nothing ever reads. **What this is:** `useRef` is a mutable box that persists across renders without causing a re-render when changed. Here it's dead weight — almost certainly the remnant of an earlier "skip if the key hasn't changed" check that the dependency array now handles. Safe to delete.
- **The dependency array** (lines 210-213) is `[imdbID, tmdbId, cacheKey]` with an `eslint-disable-next-line react-hooks/exhaustive-deps`. **What this is:** the dependency array tells React when to re-run an effect — after any listed value changes. `mediaTypeHint` and `seasonList` are deliberately left out: they are new array/object references on every render of the parent, so including them would tear the fetch down and restart it on every render, endlessly. They're only used to shape the *response*, so the identity fields are enough.

### `append_to_response` and `include_image_language`

```js
const detailRes = await fetch(
  `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${key}&append_to_response=credits,external_ids,images&include_image_language=en,null`
);
```

- **What this is:** `append_to_response` is TMDB's bulk-loading parameter. Instead of three extra round trips (`/movie/550/credits`, `/movie/550/external_ids`, `/movie/550/images`), one request returns the base detail plus `credits`, `external_ids` and `images` as extra keys on the same JSON body. Fewer requests = faster page, and fewer of your rate-limit tokens spent.
- `include_image_language=en,null` applies to the `images` block. TMDB tags every image with a language, and by default it only returns images matching your request language — which often means an *empty* backdrops array, because most backdrops are tagged with no language at all. `en,null` means "give me English-tagged images **and** language-less ones", which is what actually fills the Screenshots section. The same trick appears in `MovieDetails.jsx`'s rescue fetch and in `AddMovies.jsx`.
- Note the URL is built as `/${mediaType}/${id}` — the same code path serves both `/movie/550` and `/tv/1399`, which is why working out `mediaType` correctly is the hinge of the whole function.

### How director / writer / actors are extracted from credits

```js
const director = detail.credits?.crew
  ?.filter((c) => c.job === "Director")
  .map((c) => c.name)
  .join(", ") || "";

const writer = detail.credits?.crew
  ?.filter((c) => c.department === "Writing")
  .map((c) => c.name)
  .join(", ") || "";

const actors = (detail.credits?.cast || [])
  .slice(0, 4)
  .map((c) => c.name);
```

- TMDB splits people into `cast` (on screen) and `crew` (behind the camera), each an array of `{ name, job, department, ... }`.
- **Director:** filter the crew for exactly `job === "Director"` (a film can have several), take the names, join into `"Christopher Nolan, Emma Thomas"`-style strings.
- **Writer:** a looser filter — everything in the `Writing` department, which lumps screenwriter, story, and screenplay credits into one line. This matches how a download-site info card wants to display it.
- **Actors:** the first four of the cast, ordered by TMDB's billing order (star first). `slice(0, 4)` keeps the card compact.
- The `... || ""` suffixes guarantee a *string* even when `credits` is missing, so consumers can render `detail.director || "N/A"` without a null check.

Identical logic is duplicated in `AddMovies.jsx` — there it runs once at publish time to *store* the strings; here it runs per page view to *display* them fresh.

### The season fetch: `Promise.all` parallelisation

For TV shows the hook needs one extra request per season. The clever part is *when* those requests are started:

```js
// Start the season fetches now so they run in parallel with the
// detail request (the id is known by this point on every path).
const seasonFetch =
  mediaType === "tv" && seasonList.length > 0
    ? Promise.all(
        seasonList.map((sn) =>
          fetch(`.../tv/${id}/season/${sn}?api_key=${key}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      )
    : null;
```

**What this is:** a Promise is JavaScript's handle on an unfinished asynchronous operation; `Promise.all` takes an array of promises and resolves once all of them finish, giving an array of results in the same order. **What this is:** "parallel" here means the requests are all sent without waiting for the previous one — the browser runs them concurrently.

The trick is the comment: the promise is *created* (and therefore the network requests are *sent*) immediately, but it isn't *awaited* until after the detail response has been parsed (`const results = await seasonFetch;`, line 126). So the season requests overlap the detail request rather than queueing behind it.

What it saved, roughly, for a 5-season show where each TMDB call takes ~300 ms:

- **Naive (sequential):** find → detail → S1 → S2 → S3 → S4 → S5 ≈ 7 × 300 ms ≈ **2.1 s**
- **As written:** find → (detail ∥ S1-S5) ≈ 3 × 300 ms ≈ **0.9 s**, and on the second visit **0 ms** thanks to `tmdbCache`.

Two defensive details in that block:

- `r.ok ? r.json() : null` — a 404 for a season that doesn't exist becomes `null`, not an exception.
- `.catch(() => null)` — a network blip on one season kills that season, not the whole page.

### Merging season data with show-level fallbacks

After the detail response lands, the hook builds a `showSeasonMap` from `detail.seasons` (the show-level summary array), **skipping `season_number 0`** — TMDB uses season 0 for "specials", which the site never displays:

```js
for (const ss of showSeasons) {
  if (ss.season_number > 0) {
    showSeasonMap[ss.season_number] = {
      episode_count: ss.episode_count || 0,
      name: ss.name || `Season ${ss.season_number}`,
      ...
```

Then each requested season is assembled, preferring the rich per-season response and falling back to the summary:

```js
seasonsData.push({
  season_number: sn,
  name: sd?.name || fallback.name || `Season ${sn}`,
  ...
  episodes: (sd?.episodes || []).map((ep) => ({
    episode_number: ep.episode_number,
    name: ep.name,
    ...
    still: ep.still_path ? tmdbPoster(ep.still_path, "w300") : null,
    rating: ep.vote_average || 0,
  })),
});
```

Every field follows the same `per-season || summary || default` ladder, so a season whose fetch returned `null` still appears in the list with a name and an episode count — just without episode rows. Episode stills are deliberately requested small (`w300`) because they're thumbnails; the screenshots chain upgrades a few of them later.

### The screenshots chain

Real screenshots are the hardest thing to get, so the hook tries three sources in order:

```js
const realScreenshots = tmdbBackdrops.length > 0
  ? tmdbBackdrops
  : (episodeStills.length > 0
      ? episodeStills.slice(0, 8)
      : (detail.backdrop_path ? [tmdbBackdrop(detail.backdrop_path, "w780")] : []));
```

1. **Backdrops** — `detail.images.backdrops` (enabled by `append_to_response=images` + the `include_image_language=en,null` trick), filtered to entries with a `file_path`, capped at 8, served at `w780`. The best option: these are proper widescreen promotional stills.
2. **Episode stills** — for shows with few backdrops, every episode's `still` is harvested with `flatMap` (which flattens the season → episodes nesting into one list), and the size is upgraded by string replacement: `ep.still.replace("w300", "w780")`. That works because `tmdbPoster` embedded the literal `"w300"` in the URL, but it's a fragile coupling — change the thumbnail size in one place and the upgrade silently breaks.
3. **Single backdrop** — worst case, the one hero image every TMDB entry has, wrapped in an array so the rest of the app always sees an array.

`MovieDetails.jsx` then extends this with two more rungs of its own (stored screenshots, then generated placeholders), so the full ladder is: TMDB backdrops → TMDB episode stills → TMDB single backdrop → (for published movies) a direct re-fetch of backdrops, the "screenshot rescue" effect → stored `screenshots` from MongoDB → generated `placehold.co` images.

Line 183 also repeats the `detail.backdrop_path` fallback inside `screenshots:` itself (`realScreenshots.length > 0 ? realScreenshots.slice(0, 8) : (...)`). It's redundant — the third arm of `realScreenshots` already covers it — but harmless.

### The returned data shape

`result` is the contract of the whole hook — everything `MovieDetails` knows about a title comes from here:

```js
tmdbCache[cacheKey] = result;
setState({ data: result, loading: false, error: null });
```

| Field | Source | Notes |
|---|---|---|
| `tmdbId`, `mediaType` | the resolved id / type | `mediaType` is `"movie"` or `"tv"`, discovered if not hinted |
| `imdbID` | `external_ids.imdb_id` | re-resolved even on the legacy path, so the IMDb link works |
| `title` | `title \|\| name` | movies say `title`, TV says `name` — same for `release_date` vs `first_air_date` |
| `year` | `substring(0, 4)` of the date | `"2010"` |
| `overview` | `detail.overview \|\| firstSeason?.overview` | falls back to season 1's synopsis for shows with no show-level text |
| `poster` | `tmdbPoster(poster_path)` | `w500`, or `null` |
| `backdrop` | `tmdbBackdrop(backdrop_path)` | `w1280` |
| `screenshots` | the 3-step chain above | array of up to 8 `w780` URLs |
| `rating` | `vote_average` | `Number(x.toFixed(1))` — `toFixed` returns a *string*, hence the wrap |
| `votes` | `vote_count` | raw integer |
| `runtime` | `detail.runtime` | **always `null` for TV** — TMDB has no show-level `runtime`; that's why `MovieDetails` falls back to `movie.runtime` |
| `genres` | `genres.map(g => g.name)` | `["Drama", "Crime"]` |
| `language` | `original_language` | `"en"` |
| `director`, `writer`, `actors` | credits extraction above | strings / 4-element array |
| `released` | `release_date \|\| first_air_date` | full date string |
| `status` | `detail.status` | `"Released"`, `"Returning Series"` |
| `number_of_seasons`, `number_of_episodes` | TV detail | `null` for movies |
| `seasonsData` | merged season objects | includes full `episodes` arrays with stills |
| `seasonNumbers` | `seasonsData.map(...)` | `[1, 2, 3]` |
| `episodesPerSeason` | `seasonsData.map(s => s.episode_count)` | `[10, 12, 8]` |

### Who consumes which fields

`MovieDetails.jsx` merges the hook's output with the stored document under the comment "TMDB is the single source of truth for all metadata, with stored fallbacks":

```js
const t = tmdb || {};
const title = t.title || movie.title;
const poster = t.poster || movie.imageUrl;
const plot = t.overview || movie.overview || "";
```

Every line is a `TMDB || stored` pair, so a TMDB outage degrades the page instead of blanking it. The merged `displayDetail` object is then passed down:

- **`MovieInfoCard.jsx`** (`frontend/src/components/MovieInfoCard.jsx`) — the IMDb-style card. Uses `poster`, `title`, `genres`, `released`, `imdbRating`/`imdbVotes` (from `rating`/`votes`), `plot`, `director`, `writer`, `actors`, and `imdbID` to build the `https://www.imdb.com/title/...` link on the poster. It also receives `loading={tmdbLoading}` and renders a "Loading..." shell until TMDB answers — the visible reason the hook's cached-first initialiser is worth having.
- **`SeriesInfo.jsx`** — the "Movie Info:" list. Uses `title`, `year`, `runtime`, `language`, `released`, and `episodesPerSeason` for the "Episodes:" row (`episodesPerSeason.join(", ")` → "10, 12, 8"), plus `plot` for the Storyline paragraph.
- **`Screenshots.jsx`** — gets `displayDetail.screenshots` (the chain above), with `loading="lazy"` and an `onError` handler that hides any dead URL.
- **`MovieHeader.jsx`** / description block — `title` flows into `fullName` and the composed `releaseTitle`; `plot` becomes the second paragraph of `displayDetail.description`.

Fields returned but **not currently consumed anywhere**: `number_of_seasons`, `number_of_episodes`, `seasonNumbers`, `backdrop`, `status`, `mediaType`, and the `seasonsData` episode detail (the site's episode lists come from the *stored* `downloadLinks[].seasons[].episodes`, which hold download links, not TMDB data — `frontend/src/pages/EpisodePage.jsx`). `seasonsData` is still load-bearing internally: it's what the screenshots chain reads episode stills from. They're reasonable to keep — they cost nothing extra to compute and are the natural starting point for a real episode browser.

### Failure modes and gotchas

- **A missing or wrong API key does not produce the error state.** TMDB replies to a bad key with HTTP 401 *and a JSON body*, so `await detailRes.json()` succeeds, `detail.credits` is undefined, and the hook resolves with an all-empty object (`title: ""`, `poster: null`) that then gets cached. `MovieDetails` silently falls back to stored data. `"Failed to fetch from TMDB"` only appears on genuine network failures (offline, DNS). This is exactly why the "screenshot rescue" effect exists in `MovieDetails.jsx`.
- **A missing id is not an error either** — legacy entries with `imdbID: ""` never fetch, by design; only `/find` misses set `error: "Not found on TMDB"`.
- **The key is public.** Vite inlines `VITE_*` values into the bundle; anyone can read it in DevTools. Fine for a free TMDB key, just don't reuse a paid key.
- **The cache never expires and is not tied to a component.** If you edit a title's data on TMDB and navigate back, you'll see the old copy until a full page reload (or a dev-server HMR module swap) clears module state.
- **`runtime` is `null` for every series** — TMDB simply doesn't provide it at show level, so the info card's Duration row relies on the stored `movie.runtime`.

### Key takeaways

- `frontend/src/hooks/useTmdbMovie.js` is the site's metadata engine: it turns either an IMDb id or a `{tmdbId, mediaType}` pair into one normalised object of titles, images, ratings, credits and seasons.
- Two identifier shapes exist because the codebase has two eras: legacy hard-coded entries known only by IMDb id (resolved via TMDB's `/find` endpoint, which also discovers whether it's a movie or a show), and published entries whose primary key *is* the TMDB id.
- `tmdbCache` is a plain object at module scope, so it outlives React Router unmounts — revisiting a details page costs zero network requests, which matters most for series (1 detail + N season requests).
- The `useEffect` + `cancelled` flag is the standard guard against a stale response overwriting the page when the user navigates quickly; every `await` re-checks the flag before touching state.
- `append_to_response=credits,external_ids,images` collapses four requests into one, and `include_image_language=en,null` is what stops the `images` block from coming back empty.
- Season requests are *started* before the detail request and *awaited* after it, so they overlap instead of queueing — roughly a 60% cut in wall-clock time for a multi-season show.
- Director/writer come from filtering `credits.crew` by `job`/`department`; actors are the first four cast names in billing order.
- Screenshots are a three-step fallback: backdrops → episode stills (upgraded `w300`→`w780` by string replace) → the single `backdrop_path`, with two further stored/placeholder rungs added by `MovieDetails.jsx`.
- The consumer is `MovieDetails.jsx` alone, which blends `tmdb || {}` over the stored document field-by-field and feeds `MovieInfoCard`, `SeriesInfo` and `Screenshots`; several returned fields (`number_of_seasons`, `seasonNumbers`, `backdrop`, `status`) are computed but unused today.
- Known sharp edges: a bad API key fails silently into cached empty data rather than the error path, `runtime` is always null for TV, the cache never expires within a page session, and `prevCacheKeyRef` is dead code left over from an earlier guard.
## 05. Home Page & Navigation Components

This section covers everything a visitor sees before they open a movie: `frontend/src/pages/HomePage.jsx`, the poster grid it renders (`frontend/src/components/Postcards.jsx`), the pager underneath it (`frontend/src/components/Pagination.jsx`), and the shared "chrome" — `Navbar.jsx`, `Sidebar.jsx`, `Social.jsx`, `Socialmini.jsx`, `Alert.jsx` and `Footer.jsx`.

The single most important idea on this page: **the URL is the source of truth for what the visitor is looking at.** `/?lang=hi&type=tv`, `/?tag=Netflix`, `/?q=inception&page=2` — every filter and every page number lives in the address bar. That means any component anywhere in the app (Navbar dropdown, Social buttons, Sidebar chips, the back button) can produce a view just by writing a URL, and a filtered view can be bookmarked or shared like any normal web page.

### The big picture: how HomePage is assembled

`frontend/src/pages/HomePage.jsx` is the component behind the `/` route (see `frontend/src/App.jsx`, where it is the only route that is *not* lazily loaded — the home page ships in the first JavaScript bundle, and `MovieDetails`, `AddMovies` and `EpisodePage` are code-split).

Its JSX is deliberately boring:

```jsx
<Navbar />
<Social />
<Alert />
{tag ? (...) : q ? (...) : filterLabel ? (...) : null}
<MovieGrid movies={currentMovies} />
<Pagination totalPages={totalPages} page={page} onPageChange={handlePageChange} />
<Footer/>
```

Everything interesting happens above the `return`: reading the URL, deciding which fetch to make, filtering, and computing `page` / `totalPages`.

Note what is *not* here: `Sidebar` and `Socialmini` are **not** rendered on the home page. They live on `frontend/src/pages/MovieDetails.jsx` (lines 232 and 251). They are documented here because they are navigation components, but remember they only appear on a movie's detail page.

### HomePage.jsx — the two data modes

The page has two completely different ways of getting its movies, chosen by one boolean:

```jsx
const filteredMode = Boolean(tag || q || langParam || genreParam || yearParam || typeParam || ottParam);
```

If *any* filter is present in the URL → filter mode. Otherwise → server-paginated mode.

#### Mode 1 (default): server-paginated browsing

```jsx
moviesApi.list({ page, limit: PAGE_SIZE })
```

* **What this is:** server-side pagination means the database does the work of picking out one slice of results (`SKIP 20 LIMIT 20` in MongoDB terms), so the browser only ever downloads the 20 movies currently on screen.
* Used when the visitor is just scrolling the catalogue. `PAGE_SIZE = 20` in `HomePage.jsx` must match `DEFAULT_PAGE_SIZE = 20` in `backend/routes/movieRoutes.js` (the backend caps `limit` at 60 via `MAX_PAGE_SIZE`).
* The backend returns `{ movies, total, page, totalPages }`, so the frontend does not have to count anything — `totalPages` comes straight from the server. The backend also uses a *projection* (`LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v"`) to strip the heavy fields it never renders in a grid, keeping each response small.
* `pageData` holds the result: `const [pageData, setPageData] = useState({ movies: [], totalPages: null });`

#### Mode 2: filter mode fetches the light full list once

```jsx
moviesApi.list({ all: 1 }).then((r) => {
  if (active) setPublished(r.movies.map(transformPublished));
})
```

* Used when any filter is active. `?all=1` returns **every** published movie, but still with the light projection (no download links, screenshots or overview), so a few hundred movies is only a modest JSON payload.
* Why fetch everything? Because the filters (`lang=south`, `genre=Sci-Fi`, tags like "Multi Audio", OTT buckets like "Netflix") are *computed* rules over the data, not database queries. `matchesLang(m, "south")` means "language is one of ta/te/kn/ml". Doing that in MongoDB would need a different query per rule; doing it in JavaScript is one `.filter()` per rule over an already-tiny array. So the page pays one fetch and then filters instantly, with zero extra network round trips as the visitor changes filters.
* The list is cached in `moviesApi` (`listCache`, a `Map` keyed by `"all"` or `page:N:limit:N`), so switching from one tag to another doesn't even re-download the list — and the `?all=1` response is the same object for the whole session until a movie is added/edited/deleted, which clears the cache.
* Each entry is pushed through `transformPublished` from `frontend/src/assets/moviesStore.js`, which converts the raw MongoDB document into the shape the rest of the app expects (`id` as a number, `type` as `"Movie"`/`"Series"`, `uploadedAt` as a `Date`, poster fallback placeholder, and `_published: true`).

Both fetches end with `request.catch(() => {})`. That silences failures (the page just shows an empty grid rather than crashing) — the trade-off is there is no "could not load" message. Worth adding if the backend is ever flaky.

### Reading the URL with useSearchParams

```jsx
const [searchParams, setSearchParams] = useSearchParams();
const tag = (searchParams.get("tag") || "").trim();
const q = (searchParams.get("q") || "").toLowerCase().trim();
...
const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
```

* **What this is:** `useSearchParams` is a React Router hook that exposes the *query string* (the part of the URL after `?`) as a `URLSearchParams` object — a small built-in browser API for reading and writing `key=value` pairs. The `setSearchParams` twin writes them back, which re-renders the page with the new URL.
* Every filter is read as a string with a `""` fallback, then `.trim()`ed so `?tag= Netflix%20` still works. `q` is lowercased once here so the search comparison later can be a plain `includes(q)`.
* `page` is normalised to at least 1. Note the small hole: `?page=abc` makes `parseInt` return `NaN`, and `Math.max(1, NaN)` is still `NaN`, which then leaks into `page` (see "Edge cases" below). `parseInt(x, 10) || 1` would close it.
* `searchParams.get` already URL-decodes, so `/?ott=Disney%2B+Hotstar` arrives as the plain string `Disney+ Hotstar`.

### The useMemo filter pipeline

```jsx
const newestFirst = useMemo(() => {
  if (!filteredMode) return [];
  let base = published;
  if (langParam) base = base.filter((m) => matchesLang(m, langParam));
  ...
}, [filteredMode, tag, q, langParam, genreParam, yearParam, typeParam, ottParam, published]);
```

* **What this is:** `useMemo` is React's memoisation hook — "recompute this value only if one of these inputs changed; otherwise hand back the value you computed last time." It is how you stop an expensive calculation from re-running on every single render.

#### The pipeline, in order

Filters are applied broadest-first, so each later filter has less data to look at:

1. **Language** — `matchesLang(m, langParam)` from `frontend/src/assets/Tags.js`. This is not a simple equality check: `?lang=hi` means "Hindi", `?lang=en` means "English", but `?lang=south` means "any of Tamil/Telugu/Kannada/Malayalam" and `?lang=multi` means "anything that isn't English or Hindi" (the "Dual Audio" bucket). All of that lives in the `Tags.js` helpers so the navbar, tags and home page agree on the vocabulary.
2. **Genre** — `matchesGenre`, which lowercases both sides and folds the alias `Sci-Fi`/`scifi` into `science fiction` (TMDB's actual genre name).
3. **Year** — `String(m.released || "").startsWith(yearParam)`. This only works because `released` is stored starting with the year (e.g. `"2024-08-15"`). If the date format ever changes, this filter silently breaks.
4. **Type** — `m.type === (typeParam === "tv" ? "Series" : "Movie")` — the URL uses `movie`/`tv` (TMDB vocabulary) while the data stores `Movie`/`Series`.
5. **OTT** — `getMoviesForOtt(ottParam, base)`. There is no streaming-platform field in the data, so `Tags.js` approximates each platform with a rule (Netflix = series rated 8+, Prime = series rated 7–8, Disney+ Hotstar = Animation, SonyLIV = Hindi series, ZEE5 = Hindi movies, MX Player = multi-audio series). That's why "Netflix" shows high-rated series rather than actual Netflix titles.
6. **Tag** — deliberately a *union* of two matchers:

```jsx
const textMatches = base.filter((m) =>
  [m.lang, m.type, m.genre, m.title].join(" ").toLowerCase().includes(tag.toLowerCase())
);
const ruleMatches = getMoviesForTag(tag, base);
const seen = new Set();
base = [...textMatches, ...ruleMatches].filter((m) => {
  if (seen.has(m.id)) return false;
  seen.add(m.id);
  return true;
});
```

  `textMatches` is dumb substring matching across four joined fields; `ruleMatches` uses the named `tagRules` table in `Tags.js` (e.g. "Netflix" = series with rating ≥ 8). The `Set` de-duplicates by `id` so a movie matched both ways appears once — the first occurrence wins, and since the final sort re-orders everything anyway, that doesn't matter.
7. **Search text `q`** — same join-and-`includes` trick over `title, genre, lang, type`. This runs last so a search happens *within* the already-filtered set.
8. **Sort** — newest first:

```jsx
return [...base].sort((a, b) => {
  const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
  const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
  if (bt !== at) return bt - at;
  return b.id - a.id;
});
```

  `[...base]` copies before sorting because `.sort()` mutates the array it is given — and `base` may still be a reference chain into `published`. Missing dates count as `0` (oldest), and when two movies share an upload timestamp the higher TMDB id wins, which approximates "newest".

#### Why useMemo here

Without it, every re-render of `HomePage` (each fetch completing, each page change) would rebuild all eight steps over the whole catalogue. With it, the pipeline only re-runs when a filter value or `published` actually changes — exactly the array at the bottom of the hook. That dependency array is also a correctness contract: forget a filter name there and the UI would show stale results after that filter changes.

#### Why the fetch effect can ignore the filters

The fetch `useEffect` lists only `[filteredMode, tag, q, page]` — not `langParam`, `genreParam`, `yearParam`, `typeParam` or `ottParam`. That looks like a bug and is actually the design working:

* Going from `/?lang=hi` to `/?genre=Action` keeps `filteredMode === true`, so the effect does not re-run — but it doesn't need to, because `published` already holds every movie, and the `useMemo` *does* re-run (its dependency array has every filter) and produces the right list.
* The `tag`/`q` entries in the effect's array are harmless: the request is still `?all=1`, and `moviesApi`'s `listCache` returns the cached response, so nothing is re-downloaded.
* Crossing the boundary (`/?lang=hi` → `/`, or the reverse) does change `filteredMode`, which *is* a dependency, so the right fetch happens.

* **What this is:** `useEffect` runs a side effect (here, a network fetch) after React has painted, and its returned cleanup function runs before the next run and when the component unmounts. This one guards against a classic race:

```jsx
let active = true;
...
return () => { active = false; };
```

  If two requests are in flight (fast clicking between pages) only the most recent one is allowed to call `setState`, so an older, slower response can never overwrite newer data.

### totalPages and page clamping

```jsx
const totalPages = filteredMode
  ? Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE))
  : (pageData.totalPages || 1);

const page = filteredMode
  ? Math.min(pageParam, totalPages)
  : pageData.totalPages
    ? Math.min(pageParam, pageData.totalPages)
    : pageParam;
```

* In filter mode the page count is derived locally: 47 results / 20 per page = 3 pages.
* **What clamping is for:** someone bookmarks `/?tag=Hindi&page=99`, then more movies get deleted and page 99 no longer exists. `Math.min(pageParam, totalPages)` lands them on the last real page instead of showing an empty grid. In server-paginated mode the clamp is only applied once the server has answered (`pageData.totalPages` is still `null` during the first paint), because clamping against "1" before the data arrives would show page 1 briefly and then jump.

### Rendering: the results note

```jsx
{tag ? (
  <div className="search-results-note">Movies tagged <strong>#{tag}</strong> ({newestFirst.length} found)</div>
) : q ? (...) : filterLabel ? (...) : null}
```

A single chained conditional picks one of three labels: a tag line, a search line (note it prints `searchParams.get("q")` — the *original* case — while filtering uses the lowercased `q`), or a filter label built by joining the readable names:

```jsx
const filterLabel = [
  langParam ? langName(langParam) : "",
  typeParam ? (typeParam === "tv" ? "Series" : "Movies") : "",
  genreParam, yearParam, ottParam,
].filter(Boolean).join(" · ");   // → "Hindi · Series · Action · 2024 · Netflix"
```

`.filter(Boolean)` drops the empty strings so there are no dangling `·` separators. `langName` turns `hi` back into "Hindi". The matching CSS (`frontend/src/pages/HomePage.css`) is just a centred, muted line with blue `strong`.

In filter mode the visible slice is cut from the sorted list:

```jsx
const currentMovies = filteredMode
  ? newestFirst.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  : pageData.movies;
```

(`slice` never mutates the array, so `newestFirst` stays intact for the page count.)

### handlePageChange — paging without losing filters

```jsx
const handlePageChange = (nextPage) => {
  if (nextPage < 1 || nextPage > totalPages) return;
  const params = new URLSearchParams(searchParams);
  params.set("page", String(nextPage));
  setSearchParams(params);
  window.scrollTo(0, 0);
};
```

Three things make this the right shape:

* `new URLSearchParams(searchParams)` **copies** every parameter currently in the URL, so `?lang=hi&type=tv&page=3` becomes `?lang=hi&type=tv&page=4`. This is the line that makes pagination preserve filters. A naive `setSearchParams({ page: "4" })` would wipe them.
* Because the page number goes through the URL instead of a `useState`, the browser's back button undoes a page change, and page 2 can be bookmarked/shared. It also means a page change automatically re-triggers the fetch effect (its dependency array contains `page`) in server-paginated mode.
* `setSearchParams` pushes a new history entry by default; `window.scrollTo(0, 0)` compensates for the fact that browsers do not scroll to the top after a client-side navigation.

### Edge cases and small gotchas in HomePage

* **`?page=abc`** → `pageParam` becomes `NaN` (see above). In filter mode that yields `slice(NaN, NaN)` → an empty grid; in server mode the backend's own `parseInt(...) || 1` saves it and page 1 is served, but no pager button is highlighted. Fix: `parseInt(x, 10) || 1`.
* **Errors are swallowed** by `.catch(() => {})` — no retry, no message.
* **`window.scrollTo`** is called even if nothing changed, which is harmless but also means clicking the page you are already on re-scrolls to top.
* **`PAGE_SIZE` is duplicated** between `HomePage.jsx` and `movieRoutes.js`. Changing one without the other makes the pager math disagree with the server.

### Pagination.jsx — the page-number bar

`frontend/src/components/Pagination.jsx` is a controlled, "dumb" component: it receives `totalPages`, `page` and `onPageChange` and knows nothing about URLs or fetching. That is why it can be dropped on any page that has paged content.

#### getPageItems: deciding which numbers to show

Showing `1 2 3 ... 47` instead of 47 buttons is a classic UI problem, solved here by pure function (easy to reason about, no React involved):

```jsx
if (total <= 7) {
  return Array.from({ length: total }, (_, i) => i + 1);
}
let startPage = Math.max(2, current - 2);
let endPage = Math.min(total - 1, current + 2);
```

* 7 pages or fewer → show every number, no ellipses needed.
* Otherwise show a **window** of 5 numbers centred on the current page, always clamped so it never overlaps the first or last page (which are added manually at the end).
* Two special cases pull the window flush against an edge so there is never a lonely single page next to an ellipsis:
  * `current <= 4` → window is forced to `2..6` (early pages).
  * `current >= total - 3` → window is forced to `total-5 .. total-1` (late pages).
* Two cosmetic nudges: `startPage === 3` becomes `2` (prefer `1 2 3` over `1 ... 3`), and `endPage === total - 2` becomes `total - 1`.
* `"..."` strings are pushed before/after the window whenever there is a real gap (`startPage > 2`, `endPage < total - 1`), and `1` and `total` are always present.

#### Rendering

```jsx
const pageItems = useMemo(() => getPageItems(totalPages, page), [totalPages, page]);
if (totalPages <= 1) return null;
```

* `useMemo` (already explained above) keeps `getPageItems` from re-running on unrelated renders; it's cheap, so this is mostly tidiness.
* A single page shows **no pager at all** (`return null`) — a one-button "1" is noise.
* `PREVIOUS` is only rendered when `page > 1`, `NEXT` only when `page < totalPages`, so they disappear rather than sitting there disabled.
* Accessibility touches: `<nav aria-label="Page navigation">`, `aria-current="page"` on the active number, and `aria-label` on prev/next. The `...` entries are `<span>`s inside a `page-item disabled` `<li>`, and `Pagination.css` gives disabled items `pointer-events: none` so they cannot be clicked.
* Everything is a `<button>`, not a link — so there is no `href` to middle-click or open in a new tab. That is acceptable here *because* the page number also lives in the URL, so a user can still copy the address for a specific page. (If you want real middle-click support, `<Link>` with the same `URLSearchParams` copy trick is the upgrade.)
* CSS (`frontend/src/components/Pagination.css`): grey pill buttons on a `#27272a` bar with a slow `1s` colour transition, `gap: 6px` spacing, and at `max-width: 865px` the row wraps and centres with smaller padding/font so long page lists don't overflow on phones.

### Postcards.jsx — the poster grid

One file, three exports: the internal `PosterCard` (one movie), the aliased `export const PostCard` (used by `RelatedPosts.jsx` on the detail page), and the default `MovieGrid` (used by `HomePage`).

#### PosterCard

```jsx
const title = movie.title.startsWith("Download ")
  ? movie.title
  : detail.releaseTitle;
...
<Link to={`/movie-details/${movie.id}`} className="movie-card-link text-decoration-none">
  <article className="movie-card">
    <div className="movie-card-image-wrap">
      <img src={imgSrc} alt={title} className="movie-card-img" width="300" height="450"
           loading="lazy" decoding="async" />
```

* The whole card is one `<Link>`, so clicking the poster *or* the title opens the detail page — a bigger, friendlier click target than separate links.
* The displayed title: if the stored title already begins with `"Download "` it is used as-is; otherwise the long SEO-style title generated by `getMovieDetails` in `frontend/src/assets/movieDetails.js` is used instead (e.g. `Download Inception {English} Esubs WeB-DL 480p [200MB] || 720p [350MB] || 1080p [1GB]`). That mirrors how the original MoviesMod site titled its posts.
* `getMovieDetails(movie)` is called for every card on every render. For published movies (`_published`) it just builds strings, so it's cheap, but it is the main per-card work if you ever profile the grid.

#### Why width/height attributes *and* CSS sizing

The `width="300" height="450"` attributes look redundant because `Postcards.css` immediately overrides them:

```css
.movie-card-image-wrap { position: relative; width: 100%; height: 300px; overflow: hidden; }
.movie-card-img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
```

They are not redundant. The attributes tell the browser the poster's **aspect ratio before the image has downloaded**, so the browser can reserve the right amount of space and lay the page out once. Without them, each image "pops" the layout as it arrives — that jumping is called *layout shift*, and Google even scores sites on it. **What `object-fit: cover` is:** it makes the image fill its box while keeping its proportions, cropping the overflow instead of stretching it — so any poster, whatever its true size, fills the 300px-tall window neatly. `object-position: center top` keeps the top of the poster visible when it has to crop.

#### Lazy loading

* **What this is:** `loading="lazy"` is a native browser attribute telling it not to download an image until it is close to the viewport. With 20 posters per page (and up to 60 if you raise the limit), a visitor who lands at the top shouldn't pay for the 18 posters below the fold. `decoding="async"` additionally lets the browser decode the image off the main thread so scrolling stays smooth.
* The same pair appears on the Sidebar thumbnails.

#### MovieGrid and the responsive columns

```jsx
const MovieGrid = ({ movies }) => (
  <div className="grid-body my-5">
    {movies.map((movie) => <PosterCard key={movie.id} movie={movie} />)}
  </div>
);
```

`Postcards.css` is a CSS Grid whose column count climbs with screen width — 2 columns by default, 3 at `min-width: 480px`, 4 at 768px, 5 at 1024px, always centred inside a `max-width: 1170px` container:

```css
@media (min-width: 1024px) { .grid-body { grid-template-columns: repeat(5, 1fr); } }
```

* **What this is:** a `@media` query is a CSS rule that only applies when the device matches a condition (here, a minimum window width). That is how one HTML structure serves phone, tablet and desktop layouts.
* `1fr` means "one equal fraction of the free space", so the cards resize themselves — no JavaScript measurement involved. Under 480px the gaps and side padding also shrink (`gap: 8px; padding: 0 10px`) to keep posters a reasonable size on small phones.
* Hover behaviour is CSS-only: `filter: brightness(85%)` on the image and a grey title.
* A commented-out block at the bottom of the CSS (`.movie-card-badges`, `.movie-card-type` …) is leftover styling for coloured type/language badges on each card — kept in case you want them back.

### Navbar.jsx — the header

Two layers: a **top row** (logo, search box, two decorative buttons) and a **navigation tab strip** built from a config array.

#### navItems: the menu as data

```jsx
const navItems = [
  { label: "HOME", link: "/" },
  { label: "MOVIES", dropdown: [
      { label: "Bollywood Movies", link: "/?lang=hi&type=movie" }, ...
  ]},
  ...
  { label: "ADD MOVIES", link: "/AddMovies" }
];
```

* Every menu entry is either a plain `link` (HOME, ADD MOVIES) or a `dropdown` array. Because the whole menu is data, adding a menu item means adding one object — no JSX surgery.
* Every dropdown entry is a **filter URL** on the home page (`/?lang=ta`, `/?genre=Horror`, `/?year=2026`, `/?ott=Netflix`, `/?lang=hi&type=tv`). The menu is therefore just a set of shortcuts into the same filter engine you read about above — there is no separate "category page" backend.
* Watch the encodings: `Amazon+Prime` (`+` means a space in a query string) and `Disney%2B+Hotstar` (`%2B` is an *encoded* plus sign, needed because the platform's real name contains a `+`). Getting that wrong is how you end up filtering for "Disney Hotstar".
* Note the duplication: WEB SERIES and TV SERIES share most of their links (`/?lang=hi&type=tv` appears in both). Harmless, but a sign these two menus could merge.

#### Hover vs click dropdowns

```jsx
const [activeDropdown, setActiveDropdown] = useState(null);
...
<div className={`navi-btn ${activeDropdown === index ? 'active' : ''}`}
     onMouseEnter={() => handleDropdownEnter(index)}
     onMouseLeave={handleDropdownLeave}>
```

* **On desktop**, moving the mouse over a button sets `activeDropdown` to that button's index; leaving *any* button clears it. The CSS does the visible work: `.dropdown-menu { display: none }` becomes `display: block` only under `.navi-btn.active`, and the caret icon rotates 180° (`transform: rotate(180deg)`, `transition: 0.2s`).
* **On touch screens there is no hover**, so the label itself is a `<button onClick={() => toggleDropdown(index)}>`, which opens (or closes) the same dropdown with a tap. Both input styles feed the one state variable, which keeps desktop and mobile behaviour consistent for free.
* `toggleDropdown` is a tiny ternary: clicking the open menu closes it, clicking another switches to it.

#### Closing the menu when you click elsewhere

```jsx
const dropdownRef = useRef(null);
useEffect(() => {
  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setActiveDropdown(null);
    }
  };
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);
```

* **What this is:** `useRef` creates a stable box that survives re-renders and whose `.current` can point at a real DOM node when you attach it via `ref={dropdownRef}`. It is how React code says "this DOM element" without a document query.
* The effect attaches one `mousedown` listener to the whole document, exactly once (empty dependency array `[]`), and the cleanup removes it on unmount — forgetting that cleanup is how you accumulate ghost listeners.
* `ref.current.contains(event.target)` is true when the click landed inside the nav strip. Only clicks *outside* it clear `activeDropdown`. Because the listener is `mousedown`, the dropdown closes *before* the click is processed elsewhere, which avoids the flicker of `click`.
* The ref is on `.navigation-tab` (the whole menu), so clicking a different menu item does not close the current dropdown early — the `onMouseLeave`/toggle logic handles that.

#### The mobile menu toggle

```jsx
<button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
  <i className={`fa ${menuOpen ? 'fa-times' : 'fa-bars'}"></i> Menu
</button>
<div className={`navigation-tab ${menuOpen ? 'active' : ''}`} ref={dropdownRef}>
```

`menuOpen` is a second, independent state. `Navbar.css` hides both the button and the strip on desktop (`display: none`), then at `max-width: 865px` shows the button and only shows the strip when it has `.active`, stacked vertically (`flex-direction: column`). In that mobile layout the dropdowns become `position: static` — they expand *inside* the list rather than floating over it, which is the right behaviour on a narrow screen. Every link's `onClick` calls `setMenuOpen(false)`, so choosing a destination collapses the menu.

#### The search box

```jsx
const navigate = useNavigate();
const onSearch = () => {
  const q = query.trim();
  if (q) navigate(`/?q=${encodeURIComponent(q)}`);
};
<input ... onKeyDown={(e) => e.key === "Enter" && onSearch()} />
<i className="fa fa-search" onClick={onSearch} />
```

* **What this is:** `useNavigate` returns a function that changes the URL programmatically — the imperative cousin of `<Link>`. Changing the URL re-renders whatever routes match, which is how typing in the navbar ends up filtering the home page.
* `encodeURIComponent` percent-encodes the typed text so a movie name with `&`, `+`, `#` or spaces survives the trip through the query string. `HomePage` reads it back with `searchParams.get("q")`, which decodes automatically.
* The empty-check means an empty box does nothing (it does not clear an existing search — navigate to `/` or use the logo for that). The input is a *controlled component* (`value={query}` + `onChange`), so React state is always the single source of what's typed.
* The text is *not* cleared after searching, so the box still shows what you searched for — a deliberate-looking choice.
* The two coloured buttons (`Bollywood` / `AnimeFlix`) are `<Link to="/" target="_blank">` placeholders: they open the home page in a new tab. They are clearly waiting for real external URLs.

Other CSS notes (`frontend/src/components/Navbar.css`): the whole bar is capped at `max-width: 1170px` and centred, matching the grid and footer so the columns line up; the top row is `flex-wrap: wrap` and stacks into a column under 865px; buttons are separated by a `border-right: 1px solid #6b6666` that is removed on the last item via `:last-child`.

### Sidebar.jsx — the detail-page column

`Sidebar` takes everything through props and does **no fetching of its own**:

```jsx
const Sidebar = ({ tags, popular }) => { ... }
```

On `MovieDetails.jsx` it is fed like this: `tags = getTags()` (the names from the `tagRules` table in `Tags.js`) and `popular = published.filter(m => m.id !== movie.id).sort((a,b) => b.id - a.id).slice(0, 6)` — i.e. "the six most recently added other movies", not truly popularity-ranked. Keep that in mind if you ever rename the heading.

Four blocks, top to bottom:

* **Search form**

```jsx
<form className="search" onSubmit={handleSearch}>
```

  Using a real `<form>` means the browser's Enter-to-submit behaviour works, and `e.preventDefault()` stops the browser from doing a full-page GET reload. An empty query navigates to `/` (a handy "reset all filters" shortcut), otherwise to `/?q=...` exactly like the navbar search — two UIs, one destination.

* **Telegram block** — an `<a href="#">` around the Telegram banner image. `href="#"` is a placeholder that jumps to the top of the page; it needs the real invite URL. `rel="noopener noreferrer"` is the standard companion to `target="_blank"` for external links (it stops the opened page from being able to reach back into this one via `window.opener`).

* **Tag chips**

```jsx
{tags.map((t) => (
  <Link key={t.name} to={`/?tag=${encodeURIComponent(t.name)}`} className="tag-chip">#{t.name}</Link>
))}
```

  Clicking a chip lands on the home page in filter mode with `?tag=Name`, which runs the two-track tag matching described above. Chips are small grey pills that turn blue on hover (pure CSS, with a `0.2s` transition on background/colour/border).

* **Popular posts**

```jsx
<img src={p.imageUrl} alt={p.title} width="72" height="108" loading="lazy" decoding="async" />
<Link to={`/movie-details/${p.id}`}>
  {p.title.startsWith("Download ") ? p.title : `Download ${p.title}`}
</Link>
```

  Same ideas as the poster grid in miniature: aspect-ratio hints via width/height, lazy loading, and the "Download …" title prefix. `Sidebar.css` makes the thumbnail `50px × 65px` with `object-fit: cover` — the CSS wins over the attributes, as explained above.

Layout: `.left` is a fixed `343px` column (`flex-shrink: 0`, so it never squashes) that becomes full-width under `max-width: 1024px`, which is when the detail page's two-column layout stacks.

### Social.jsx — the home page filter buttons

```jsx
const go = (to) => () => navigate(to);
...
<button className="btn-social" onClick={go("/?lang=en&type=movie")}>English Movies</button>
<button className="btn-social" onClick={go("/?lang=ja")}>Anime</button>
<button className="btn-social" onClick={go("/?type=tv")}>WeB Series</button>
```

* `go` is a small **higher-order function** — a function that returns another function. Writing `onClick={go("/?lang=ja")}` creates the handler up front with the destination baked in, avoiding the classic mistake of `onClick={navigate("/?lang=ja")}` (which would navigate during render, immediately and on every render).
* Each button is just a filter URL again: `?lang=ja` (Anime), `?lang=ko&type=tv` (K-Drama), `?lang=multi&type=movie` (Dual Audio) and so on. Note that the home page has *both* a Navbar and a Social row pointing into the same filter engine — that is intentional redundancy, mimicking the original site.
* `JOIN TELEGRAM` and `4K MOVIES` have no `onClick` at all — dead buttons waiting for real destinations.
* `Social.css` styles the row (`display: flex; flex-wrap: wrap`, centred inside the shared `1170px` container) and gives `.btn-social` a slow white-on-hover inversion. The two CSS files for Social and Socialmini are near-identical copies — an easy future cleanup would be one shared stylesheet.

### Socialmini.jsx — the detail-page cousin

Same pattern, three buttons: `Bollywood` (`/?lang=hi&type=movie`), `Animeflix` (`/?lang=ja`) and `Updates` (`/?year=2026`), plus the decorative Telegram/4K buttons. It is rendered only inside `MovieDetails.jsx`, between the download section and the comments. Because it sits on a page that is *already* filtered to one movie, its purpose is to jump the visitor back out into a browse view.

### Alert.jsx — the dismissible banner

```jsx
const [visible, setVisible] = useState(true);
if (!visible) return null;
```

* A green strip announcing the domain change, with an `×` button that sets `visible` false; `return null` is React's way of rendering nothing.
* **`visible` is component state, not something persistent** — it resets every time `HomePage` mounts, so the banner reappears after you visit a movie and come back, and on every reload. If that gets annoying, `sessionStorage` (the same mechanism `moviesApi` already uses for the admin password) is the natural place to remember the dismissal.
* One real bug here:

```jsx
<Link to="https://moviesmod.zone/" target="_blank" className="alert-a px-1">MoviesMod</Link>
```

  **What this is:** `<Link>` is React Router's component for navigating between routes *inside* your app; external websites should use a plain `<a href>`. Router v7 (the installed `react-router-dom@7.18.3`) resolves `to` through `parsePath`/`resolvePath`, which treat the string as a *path*, not a URL — `https://moviesmod.zone/` becomes the internal path `/https:/moviesmod.zone/`, which matches no route, so clicking it blanks the content area instead of opening the site. The `target="_blank"` does still reach the underlying `<a>`, but the `href` it points at is the broken internal path. Fix: replace `<Link>` with `<a href="https://moviesmod.zone/" target="_blank" rel="noopener noreferrer">`.

### Footer.jsx

The simplest file in the app: a `75px` dark bar with a row of text links (How to Download, Report Broken Links, Request Us, DMCA, Contact Us, About Us, Site Disclamer). Two things worth knowing:

* Every `href=""` is empty — no destination yet. An empty `href` makes the browser reload the current page when clicked, so these should eventually become real links (or `<Link>`s to real pages).
* The separators are the HTML entity `&#x7C;` (the `|` character) rather than typed pipes, and `Footer.css` handles the colour/hover (`#99a1a3` → green `#2fb986`, with a `1s` transition). It is rendered by HomePage, MovieDetails and EpisodePage, always last.

### Key takeaways

- The URL is the app's state: every filter (`tag`, `q`, `lang`, `genre`, `year`, `type`, `ott`) and the `page` number are query parameters, which makes every view bookmarkable, shareable and back-button friendly.
- HomePage has two fetch strategies: default browsing asks the server for one page of 20 (server does the slicing); any active filter switches to one `?all=1` fetch of the light full list, filtered in the browser. That works because filters like `south`, `multi` and the OTT buckets are JavaScript rules in `frontend/src/assets/Tags.js`, not database queries.
- The `useMemo` pipeline applies filters broadest-first (lang → genre → year → type → ott → tag → q) and sorts newest-first; `useMemo` exists so that cost is paid only when a filter actually changes.
- Tag matching is a union of dumb text matching and curated `tagRules`, de-duplicated by movie id; OTT and the "Netflix" tag are rating/genre heuristics because no platform field exists in the data.
- `handlePageChange` copies `new URLSearchParams(searchParams)` before setting `page` — that single line is why pagination never drops your filters. Page numbers are clamped to `totalPages` so stale deep-links land on a real page.
- `Pagination.jsx` shows at most 7 slots (a 5-number window plus always-visible first/last, with `...` for gaps), hides itself for a single page, and only emits `PREVIOUS`/`NEXT` when they can do something.
- Poster cards combine `width`/`height` attributes (reserve space, prevent layout shift) with CSS `width: 100%` + `object-fit: cover` (fill the box, crop neatly), and use native `loading="lazy"` so below-the-fold posters are not downloaded.
- Navbar dropdowns are pure data (`navItems`) pointing at filter URLs; hover sets `activeDropdown` on desktop, click toggles it on touch, a document-level `mousedown` listener plus a `useRef` closes it on outside clicks, and a separate `menuOpen` state shows the whole strip under 865px. Both search boxes funnel into the same `/?q=` mechanism via `useNavigate`.
- Sidebar and Socialmini belong to the detail page, not the home page; Sidebar's "POPULAR POSTS" is really "six most recently added other movies" passed in as a prop.
- Known loose ends worth fixing: the Alert's `<Link to="https://...">` navigates to a broken internal path (use a plain `<a href>`), `?page=abc` produces `NaN`, fetch errors are silently swallowed, Footer links are all empty, the Telegram/4K buttons do nothing, `PAGE_SIZE` is duplicated front and back, and `Social.css`/`Socialmini.css` are duplicates.
## 06. Movie Details Page & Its Components

This section covers the page you land on when you click any poster on the site, and the
eight components it is assembled from:

- `frontend/src/pages/MovieDetails.jsx` — the page itself (data fetching + all the merging logic)
- `frontend/src/components/MovieHeader.jsx` — breadcrumb, post title, "uploaded X ago" meta line
- `frontend/src/components/MovieInfoCard.jsx` — the IMDb-style poster + rating box
- `frontend/src/components/SeriesInfo.jsx` — the "Movie Info:" / "Series Info:" bullet list + Storyline
- `frontend/src/components/Screenshots.jsx` — the screenshot gallery
- `frontend/src/components/DownloadSection.jsx` — download buttons for a single movie
- `frontend/src/components/SeriesSeasons.jsx` — per-season Batch/Zip + Episodes links for a series
- `frontend/src/components/RelatedPosts.jsx` — "RELATED POSTS" card row
- `frontend/src/components/CommentSection.jsx` — the "ADD COMMENT" form

The mental model: **this page is a merging machine.** It receives almost nothing from the
route except an id. It then pulls data from four places — one MongoDB document, one light
list of every movie, the TMDB API, and (only if TMDB fails) a second direct TMDB call — and
stitches them into a single object called `displayDetail` that every child component simply
renders. The children are deliberately "dumb": they take props and draw. All the thinking
happens in `MovieDetails.jsx`.

---

### The page and its data flow at a glance

`frontend/src/App.jsx` maps the route:

```jsx
<Route path='/movie-details/:id' element={page(<MovieDetails/>)}></Route>
```

The `:id` in the path is the **TMDB id** of the movie — the same number used as the
document key in MongoDB (`backend/routes/movieRoutes.js` looks the document up with
`Movie.findOne({ tmdbId: Number(req.params.tmdbId) })`). So the URL
`/movie-details/27205` is really "MongoDB document for TMDB id 27205".

The rendered layout, in the order it appears on screen:

```
Navbar
└─ div.detail
   ├─ div.right
   │  ├─ MovieHeader          ← breadcrumb, "Download X 480p..." h1, uploaded X ago
   │  ├─ div.thecontent       ← description paragraphs (blurb, plot, boilerplate)
   │  ├─ MovieInfoCard        ← IMDb-style poster/rating/plot box
   │  ├─ SeriesInfo           ← Movie/Series Info list + Storyline
   │  ├─ Screenshots          ← gallery (may render nothing)
   │  ├─ SeriesSeasons  OR  DownloadSection   ← depending on movie.type
   │  ├─ Socialmini
   │  ├─ 4 static "alert-dl" notice boxes
   │  ├─ RelatedPosts
   │  └─ CommentSection
   └─ Sidebar (tags + popular)
Footer
```

Four data sources feed this tree:

| Source | Comes from | Provides |
|---|---|---|
| The movie document | `moviesApi.get(id)` → `GET /api/movies/:tmdbId` | download links, screenshots, release title inputs, size/quality, uploadedAt |
| The light full list | `moviesApi.list({ all: 1 })` → `GET /api/movies?all=1` | sidebar "popular" and "related" cards |
| The TMDB hook | `useTmdbMovie(...)` | poster, rating, genres, cast, overview, real screenshots |
| The rescue fetch | direct `fetch()` in `MovieDetails.jsx` | backdrops, only when the hook came back empty |

Two CSS imports at the top of the page are worth noticing:

```jsx
import "./MovieDetails.css";
import "../components/DownloadSection.css";
```

The page renders the four `alert-dl` notice boxes inline (see "The rendered layout" below),
and those classes live in `DownloadSection.css`. Importing it here makes them available —
and it also incidentally supplies the `text-red` / `text-blue` / `text-teal` classes that
`SeriesSeasons` needs (more on that in its own subsection).

---

### frontend/src/pages/MovieDetails.jsx — the controller

#### Reading the id from the URL

```jsx
const { id } = useParams();
```

**What this is:** `useParams()` is a React Router hook that returns an object of the
dynamic segments of the matched route. Because the route is `/movie-details/:id`, it
returns `{ id: "27205" }`. Note the value is a **string** — every comparison against it
must stay string-vs-string, which is exactly why the code below stores `id` itself rather
than converting it.

`useParams()` re-runs on navigation. Clicking from one movie to another *does not unmount
this page* — React Router just changes the `id` prop — so the component has to notice the
change and refetch. That single fact drives the next two subsections.

#### The parallel fetch: one heavy document + one light list

```jsx
useEffect(() => {
  let active = true;
  // The movie document (with download links) and the light full list for
  // the sidebar/related sections are independent — fetch them in parallel.
  Promise.all([
    moviesApi.get(id),
    moviesApi.list({ all: 1 }).catch(() => ({ movies: [] })),
  ]).then(([doc, list]) => {
    if (!active) return;
    setFetched({ id, doc: doc ? transformPublished(doc) : null, ready: true });
    setPublished((list.movies || []).map(transformPublished));
  }).catch(() => {
    if (!active) return;
    setFetched({ id, doc: null, ready: true });
  });
  return () => {
    active = false;
  };
}, [id]);
```

**What this is:** `useEffect` is React's way of running side effects (network requests,
scrolling, timers) after render. The array at the end, `[id]`, is the *dependency array*:
React re-runs the effect only when one of those values changed since last time. **What this
is:** `Promise.all` takes an array of promises and resolves once **all** of them resolve,
handing back the results in the same order. The two requests are therefore launched at the
same moment and the page waits for both, instead of waiting for the first to finish before
even starting the second (that would be *sequential*, roughly double the waiting).

Why these two requests are independent — and why that matters:

- `moviesApi.get(id)` returns **one full document**: download links with per-episode URLs,
  screenshots, everything. `GET /api/movies/:tmdbId` in `backend/routes/movieRoutes.js`
  does `Movie.findOne({ tmdbId }).lean()` with no projection.
- `moviesApi.list({ all: 1 })` returns **every movie but light fields only**. The backend
  strips the heavy arrays before sending:

  ```js
  const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
  ```

  **What this is:** a MongoDB *projection* — a `select()` that tells the database which
  fields to leave out. Download links can carry hundreds of episode URLs per title, so for
  a list of 50 movies that is a lot of bytes nobody renders. The sidebar and related rows
  only need `id`, `title`, `imageUrl`, `type` and `lang`, which is exactly what survives
  the projection.

  Neither request needs the other's answer: the sidebar never needs download links and the
  download section never needs the list. That is the definition of *independent* requests,
  and it is why `Promise.all` is safe here. If the second call needed the first call's
  result (say, to fetch more detail about the current movie), you would have to await them
  one after the other instead.

Three smaller details inside the same effect:

- **The inner `.catch(() => ({ movies: [] }))`.** If the list request fails, it is
  converted into an empty list instead of a rejection, so `Promise.all` still resolves and
  the page still renders — just without sidebar/related content. Only a failure of the
  *movie itself* falls through to the outer `.catch`, which sets `doc: null` and
  `ready: true` so the page shows "Movie not found" rather than spinning forever.
- **`transformPublished(doc)` on the way in.** `frontend/src/assets/moviesStore.js` turns a
  raw MongoDB document into the canonical shape the whole frontend agrees on
  (`id: Number(entry.tmdbId)`, `type: "Series" | "Movie"`, `imageUrl`, normalized
  `downloadLinks` with `seasons` merged in from the older `seasonEpisodes` field, and a
  `_published: true` marker). Doing it once at the boundary means every component below can
  assume the same shape.
- **The `active` flag.** This guards against a *race condition*. **What this is:** a race
  condition happens when two async operations finish out of order and the slower, older one
  writes its result last, clobbering the newer one. Concretely: click movie A, then quickly
  click movie B. The effect runs twice. If A's response lands after B's, A would overwrite
  B on screen. The cleanup function returned by the effect runs before the effect re-runs,
  setting `active = false` for the A request — so when A's late response arrives, the
  `if (!active) return;` line throws the result away. Every fetch in this codebase follows
  the same pattern.

One nuance to be aware of: `moviesApi.get()` **returns `null` on a 404** rather than
throwing (`frontend/src/api/moviesApi.js`), and `list()` is backed by an in-memory
`listCache` Map, so navigating Home → Details → Home → Details usually refetches nothing at
all.

#### Derived loading: stamping the fetched object with its id

This is the most interesting pattern on the page:

```jsx
const [fetched, setFetched] = useState({ id, doc: null, ready: false });
```

and then, *outside any effect*, on every render:

```jsx
const loading = fetched.id !== id || !fetched.ready;
const movie = fetched.id === id ? fetched.doc : null;
```

**What this is:** *derived state* — values you compute from existing state during render
instead of storing them in their own `useState` and updating them inside an effect. Here
`fetched` is stamped with the id it was fetched **for**, and `loading` / `movie` are simply
read off that stamp.

Why not the "obvious" alternative — three states plus `setLoading(true)` at the top of the
effect? Walk through what happens when you click from movie A to movie B with that design:

1. The effect for B starts and calls `setLoading(true)`, `setMovie(null)`.
2. React re-renders with `loading: true` — fine.
3. B's response arrives; `setMovie(b)`, `setLoading(false)`.

That looks harmless, but there are two real problems. First, between the route change and
the effect running, React renders **once with A's data still in state under B's URL**. That
is the *stale content problem*: for one frame the user sees movie A's poster, title and
download buttons while the address bar says movie B, and any effect that reads the data in
that window acts on the wrong movie. Second, three `setState` calls at the top of an effect
that also depends on the data invite bugs where one is forgotten and the old movie leaks
into the new page.

The stamp solves both with one comparison. The instant the route changes, `id` becomes B's
id, `fetched.id` is still A's id, and so:

- `fetched.id !== id` → `loading` is `true` immediately, on the very first render after
  navigation — **before** the effect has even run.
- `fetched.id === id ? fetched.doc : null` → `movie` is `null` just as immediately, so A's
  data can never be rendered under B's URL. The old document is not deleted, merely
  *quarantined* by its stamp until a fresh one arrives with the matching stamp.

There is also a third derived line that depends on `movie`:

```jsx
const siteData = movie ? getMovieDetails(movie) : null;
```

`getMovieDetails` (`frontend/src/assets/movieDetails.js`) builds the site-specific,
non-TMDB parts of the page: the SEO-style `releaseTitle`, the `downloads` array (labels,
hrefs, and per-quality `seasons` for series), `categories`, `blurb`, `size`, `quality`,
`format`, `subtitles`, the `seasonRange` and a placeholder-or-real `screenshots` list. Note
that everything on this page comes from MongoDB — `transformPublished` always sets
`_published: true`, so the "legacy/built-in movie" branch at the bottom of
`getMovieDetails` is effectively unreachable from this page today. It is kept for the older
data shape, and the code still handles it gracefully (see the next subsection).

#### Choosing the TMDB identifier

```jsx
const tmdbIdentifier = movie?._published
  ? { tmdbId: movie.id, mediaType: movie.type === "Series" ? "tv" : "movie" }
  : { imdbID: siteData?.imdbID };

const { data: tmdb, loading: tmdbLoading } = useTmdbMovie(
  tmdbIdentifier,
  movie?._published ? null : siteData?.seasonRange,
);
```

**What this is:** optional chaining — `movie?._published` means "if `movie` is null or
undefined, the whole expression is undefined instead of crashing". It is what lets these
lines sit above the loading/not-found early returns without a null check.

The hook `frontend/src/hooks/useTmdbMovie.js` can look a movie up on TMDB two ways:

- **By TMDB id + media type** (used for everything stored in MongoDB today): one direct
  `GET /movie/{id}` or `/tv/{id}` call. Because the id is known up front, the hook also
  fires its per-season requests **in parallel** with the detail request rather than
  waiting for it.
- **By IMDb id**: a `/find/{imdbID}` lookup first to discover the TMDB id and whether it is
  a movie or a show, then the detail call. This is the legacy path, and since
  `getMovieDetails` returns `imdbID: ""` for non-published movies, both identifiers end up
  empty — the hook sees no identifier, sets `loading: false` and `data: null` immediately,
  and the page simply falls back to stored values everywhere. Nothing breaks; the page is
  just a little barer.

The second argument, `seasonRange`, is only passed for legacy movies; for published ones
the hook derives seasons from its own TMDB response. The hook also keeps a module-level
`tmdbCache` object, so returning to a movie you already viewed renders its TMDB data
instantly with no request at all.

#### The screenshot rescue effect

TMDB data can come back empty for boring reasons: `VITE_TMDB_API_KEY` missing at build
time, a TMDB outage, a title TMDB cannot match. Without screenshots the page would fall
back to grey `placehold.co` images, which look broken even though they are not. This
second effect is a deliberate rescue:

```jsx
const [shots, setShots] = useState({ id: null, list: null });

useEffect(() => {
  if (loading || tmdbLoading || tmdb) return; // hook working or still pending
  if (!movie || !movie._published) return;    // nothing to rescue with
  if (shots.id === movie.id) return;          // already attempted for this movie
  const tmdbKey = import.meta.env.VITE_TMDB_API_KEY;
  if (!tmdbKey) return;                       // can't rescue without a key
  let active = true;
  const mt = movie.type === "Series" ? "tv" : "movie";
  fetch(`https://api.themoviedb.org/3/${mt}/${movie.id}?api_key=${tmdbKey}&append_to_response=images&include_image_language=en,null`)
    .then((r) => r.json())
    .then((data) => {
      if (!active) return;
      const list = (data.images?.backdrops || [])
        .filter((b) => b.file_path)
        .slice(0, 8)
        .map((b) => `https://image.tmdb.org/t/p/w780${b.file_path}`);
      setShots({ id: movie.id, list });
    })
    .catch(() => {
      if (!active) return;
      setShots({ id: movie.id, list: [] });
    });
  return () => { active = false; };
}, [loading, tmdbLoading, tmdb, movie, shots.id]);
```

Read the guard clauses top to bottom — each one is a reason *not* to run:

1. `loading || tmdbLoading || tmdb` — if the page is still fetching, or the hook is still
   in flight, or the hook actually succeeded, there is nothing to rescue. Without the
   `tmdb` check this effect would fire a duplicate request on every successful load.
2. `!movie || !movie._published` — no document, nothing to rescue.
3. **`shots.id === movie.id`** — the same id-stamp trick as the main fetch. Once an attempt
   has been made for this movie, the stamp matches and the effect returns immediately
   instead of refiring. This matters because the effect's dependencies change often
   (`movie`, `tmdbLoading`), so without the guard a failing TMDB lookup would be retried on
   every render.
4. `!tmdbKey` — `import.meta.env.VITE_TMDB_API_KEY` is how Vite exposes environment
   variables to browser code; anything prefixed `VITE_` at build time is inlined into the
   bundle. No key, no rescue possible.

The request asks TMDB for `images` with `include_image_language=en,null` — "English plus
no-language" backdrops, which avoids dropping stills that TMDB has no language tag for. It
keeps at most 8 and builds `w780` image URLs.

The failure branch is as deliberate as the success one: it stores `list: []` **with the
stamp set**. That turns "we tried and it failed" into a recorded fact, so the guard in step
3 stops retrying and the display logic below can move on to the stored placeholders.

#### Scroll to top on navigation

```jsx
useEffect(() => {
  window.scrollTo(0, 0);
}, [id]);
```

Because clicking a related-post card does not unmount this page, the browser would
otherwise keep the scroll position from the previous movie — you would land in the middle
of the new page. This resets to the top whenever the movie changes.

#### Early returns: loading and not found

```jsx
if (loading) {
  return (
    <>
      <Navbar />
      <div className="detail not-found-wrap">
        <div className="right">
          <div className="not-found">Loading...</div>
        </div>
      </div>
      <Footer />
    </>
  );
}
```

Both early returns keep `Navbar` and `Footer` mounted so the page chrome does not jump. The
second one — `if (!movie || !siteData)` — renders "Movie not found." with a link back to
`/`. This is where the outer `.catch` and the `404 → null` behaviour of `moviesApi.get`
both land.

Note that `tmdbLoading` is *not* part of the page-level loading state. The page renders as
soon as MongoDB answers, and `MovieInfoCard` shows its own little "Loading..." while TMDB
catches up. That is a deliberate split: your own database is fast and required, TMDB is
slower and optional.

#### The merge: displayDetail and its fallback chains

This is the heart of the page. First a set of one-line fallbacks, then a single object that
everything downstream consumes:

```jsx
// TMDB is the single source of truth for all metadata, with stored fallbacks
const t = tmdb || {};
const title = t.title || movie.title;
const year = t.year || "";
const poster = t.poster || movie.imageUrl;
const genre = t.genres?.length ? t.genres.join(", ") : movie.genre;
const runtime = t.runtime ? `${t.runtime} min` : (movie.runtime ? `${movie.runtime} min` : "");
const imdbRating = t.rating || movie.rating || "";
const imdbVotes = t.votes || movie.votes || "";
const plot = t.overview || movie.overview || "";
const director = t.director || movie.director || "";
const writer = t.writer || movie.writer || "";
const actors = t.actors?.length ? t.actors : (movie.actors || []);
const language = t.language || "";
const released = t.released || movie.released || "";
```

`const t = tmdb || {}` is the trick that makes the whole block safe: when TMDB returned
nothing, `t` is an empty object, every `t.something` is `undefined`, and every `||`
falls through to the stored value (or to `""`). No `if` anywhere. Each field encodes a
policy about *who is trusted for what*:

| Field | Chain | Why |
|---|---|---|
| `title` | TMDB → `movie.title` | the admin-entered title is a fine fallback |
| `poster` | TMDB → `movie.imageUrl` | stored poster is the admin's chosen one |
| `genres` | TMDB array joined `"Action, Drama"` → `movie.genre` | TMDB gives structured genres; stored is a plain string |
| `runtime` | `X min` from TMDB → `X min` from stored → `""` | formatted here once so no component formats again |
| `imdbRating` / `imdbVotes` | TMDB → stored → `""` | covers a TMDB title with no votes yet |
| `plot`, `director`, `writer`, `actors` | TMDB → stored → empty | |
| `language`, `year` | TMDB only → `""` | deliberately *not* backfilled — a blank is more honest than a wrong guess |
| `released` | TMDB → stored | |

Screenshots have a four-level waterfall, and it is the most stateful field on the page:

```jsx
const hookShots = t.screenshots || [];
let screenshots;
if (hookShots.length > 0) {
  screenshots = hookShots;
} else if (!movie._published) {
  screenshots = siteData.screenshots;
} else if (shots.id !== movie.id) {
  screenshots = []; // rescue fetch still pending
} else if (shots.list && shots.list.length > 0) {
  screenshots = shots.list;
} else {
  screenshots = siteData.screenshots;
}
```

1. **TMDB hook succeeded** → its backdrops (or episode stills) win.
2. **Legacy movie** → whatever `getMovieDetails` generated or stored; there is no rescue
   path for these.
3. **Rescue still pending** (`shots.id !== movie.id`) → `[]`, i.e. *show nothing for now*.
   This is why `Screenshots` returning `null` on an empty list matters: the whole section,
   including its "Screenshots" heading, is withheld for a moment instead of flashing grey
   placeholders and then swapping to real images. Compare that to the alternative —
   rendering placeholders immediately — which produces a visible flicker on every movie.
4. **Rescue succeeded with images** → those.
5. **Rescue failed or found nothing** → the stored/generated `siteData.screenshots`
   placeholders, as a last resort.

Then everything is flattened into one object:

```jsx
const displayDetail = {
  imdbID: siteData.imdbID || t.imdbID || "",
  releaseTitle: siteData.releaseTitle,
  fullName: title,
  poster,
  year,
  title,
  genres: genre,
  ...
  downloads: siteData.downloads,
  screenshots,
  ...
  description: [siteData.blurb, plot, siteData.description[2]],
  uploadedAt: movie.uploadedAt || null,
};
```

Notice which keys are **not** in a fallback chain: `downloads`, `releaseTitle`,
`categories`, `size`, `quality`, `format`, `subtitles` come from the stored document only.
That is the real design decision hiding in this object — **TMDB owns metadata, your
database owns the download site.** TMDB has no idea what your 480p Google Drive link is, so
those fields have nothing to fall back to and must not be guessed.

`description` is a three-element array rendered as paragraphs: the generated `blurb`, the
TMDB `plot` (which is `""` if TMDB failed, and the renderer skips falsy entries), and
`siteData.description[2]` — the hardcoded MoviesMod boilerplate paragraph from
`getMovieDetails`. The renderer skips holes:

```jsx
{displayDetail.description.map((p, i) =>
  p ? <p key={i}>{p}</p> : null,
)}
```

One thing worth knowing about this object: it is rebuilt from scratch on **every render** of
the page — every keystroke in any child, every TMDB arrival. React does not care because
nothing here is expensive (a few string concatenations), and the components below are not
memoized anyway. **What this is:** `useMemo` is the hook you would reach for to cache a
recomputation like this between renders; it is not used here, and that is a reasonable
choice — memoizing has its own cost and this computation is trivial. If `getMovieDetails`
ever became slow, this line is where you would add it.

#### popular and related

```jsx
const popular = published
  .filter((m) => m.id !== movie.id)
  .sort((a, b) => b.id - a.id)
  .slice(0, 6);

const related = published
  .filter((m) => m.id !== movie.id && m.type === movie.type)
  .slice(0, 4);
```

Both run over the same light `published` list that came from the parallel fetch — no extra
request, no extra backend endpoint.

- **popular** removes the current movie, sorts by `id` descending, and takes 6. Since
  `id` is the TMDB id, and TMDB ids generally grow over time, this is really
  *"the six newest-by-TMDB-id titles"* rather than a popularity ranking. That is a
  honest-but-simplifying stand-in: there is no view counter or click tracking in this
  codebase, so nothing more meaningful is available. If you ever want real popularity, the
  field to add is on the MongoDB document, not in this file.
- **related** removes the current movie, keeps only entries with the **same `type`**
  (`Movie` or `Series`), and takes the first 4. It does not sort and does not match genre or
  language, so "related" currently means "same kind, in whatever order the API returned
  them" — and the API sorts by `publishedAt` descending, so the 4 related posts are the 4
  most recently published movies/series.

Both arrays go into `Sidebar` (`tags`, `popular`) and `RelatedPosts` (`related`)
respectively.

#### The rendered layout, and the four static notice boxes

```jsx
{movie.type === "Series" ? (
  <SeriesSeasons movie={movie} detail={displayDetail} />
) : (
  <DownloadSection movie={movie} detail={displayDetail} />
)}
```

The single branching point in the whole layout: series get per-season links, movies get one
download button per quality. Below that, four coloured boxes are pure static JSX:

```jsx
<div className="alert-dl alert-dl-danger">
  Please Do Not Use VPN for Downloading Movies From Our Site.
</div>
```

They are not the reusable `Alert` component (`frontend/src/components/Alert.jsx`) — they are
literal markup, copied from the original site's look, using the `alert-dl-*` classes
defined in `frontend/src/components/DownloadSection.css`. Nothing dynamic, no state; they
are decorative.

---

### frontend/src/components/MovieHeader.jsx — breadcrumb, title, meta

Props: `{ detail }` (the `displayDetail` object). Renders three blocks: the breadcrumb row,
the `<h1>` post title, and the meta line.

#### formatRelativeTime — "3 days ago"

```jsx
const formatRelativeTime = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  ...
  if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? "s" : ""} ago`;
  if (diffWeek > 0) return `${diffWeek} week${diffWeek > 1 ? "s" : ""} ago`;
  if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  if (diffHr > 0) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  return "Just now";
};
```

Subtracting two `Date` objects gives milliseconds. The chain then checks the **largest
unit first** and returns as soon as one is non-zero, so a 90-minute-old post says
"1 hour ago", not "90 minutes ago". The `diffMonth > 1 ? "s" : ""` bit is manual pluralisation.
The divisions are approximations — a month is 30 days and a week 7, so "1 month ago" can
mean anywhere from 28 to 31 real days. Good enough for a display string.

It is called with a guard:

```jsx
const uploadedAt = detail.uploadedAt ? formatRelativeTime(detail.uploadedAt) : "";
```

`uploadedAt` comes from `transformPublished` (`new Date(entry.publishedAt)`), so the header
shows nothing at all if the field is missing rather than "NaN months ago".

#### Category chips: tag link or search link

```jsx
const tagNames = getTags().map((t) => t.name);

const to = (c) =>
  tagNames.includes(c)
    ? `/?tag=${encodeURIComponent(c)}`
    : `/?q=${encodeURIComponent(c)}`;
```

`getTags()` (`frontend/src/assets/Tags.js`) returns the fixed sidebar tag list — English,
Hindi, Multi Audio, Spanish, 2026, Drama Series, Spanish Series, Netflix. If a category
happens to be one of those names, the chip links to `/?tag=Hindi`, which the home page
resolves through `getMoviesForTag`. Anything else — a genre like "Action", a language like
"Korean" — becomes a text search: `/?q=Action`. One function, two behaviours, and the
breadcrumb stays useful no matter what the categories contain.

**What this is:** `encodeURIComponent` turns text into a URL-safe string, so a value
containing spaces, `&` or `?` cannot be mistaken for URL structure. Always use it when
building a query string by hand.

#### What it renders

- The breadcrumb: a home-icon `Link` to `/`, then up to 10 categories
  (`(detail.categories || []).slice(0, 10)`), comma-separated, each a chip linking per the
  rule above. The `|| []` guards a missing `categories` field.
- `<h1 className="post-title">{detail.releaseTitle}</h1>` — note this is the long
  machine-built `releaseTitle` ("Download Inception ... 480p [200MB] || 720p [350MB] || 1080p [1GB]"),
  not the clean movie name. That mirrors the original site, where the post title *is* the
  release string and is what search engines index.
- The meta row: calendar icon + relative upload time, then a hardcoded
  "No Comments" line — this site has no comment storage, so the count is a constant.

---

### frontend/src/components/MovieInfoCard.jsx — the IMDb-style box

Props: `{ detail, movie, loading }`. The `movie` prop exists purely as a fallback source,
and `loading` gives the card its own spinner so the rest of the page does not have to wait
for TMDB:

```jsx
if (loading) {
  return (
    <div className="imdbwp imdbwp--dark">
      <div className="imdbwp__loading">Loading...</div>
    </div>
  );
}
```

This is a nice example of *localising* loading state: instead of blocking the whole page on
TMDB, only this box says "Loading..." while the header, storyline and download links are
already usable.

Every field then gets the same `||` treatment, ending in a display-safe default:

```jsx
const poster = detail?.poster || movie?.imageUrl || "/placeholder.png";
const rated = detail?.rated || "N/A";
const imdbRating = detail?.imdbRating || "N/A";
const actors = Array.isArray(detail?.actors)
  ? detail.actors.join(", ")
  : detail?.actors || "N/A";
```

Two things to notice:

- `rated` is always **"N/A"** in practice, because `displayDetail` never defines a `rated`
  key. The line is harmless — it just means the card shows "N/A | Action, Drama | 2010-07-16".
  If you want a real certificate there, add `rated` to `displayDetail` in
  `MovieDetails.jsx`; the card already handles it.
- `actors` can be an array (TMDB / stored) or a string, so the `Array.isArray` check joins
  the array with commas and passes a string straight through.

The whole poster is one link out to IMDb:

```jsx
<a className="imdbwp__link" target="_blank"
   href={`https://www.imdb.com/title/${imdbID}`} rel="noopener noreferrer">
```

**What this is:** `target="_blank"` opens a new tab. `rel="noopener noreferrer"` tells the
browser not to let the new page access `window.opener` (a real phishing technique called
tab-nabbing) and not to send the referrer. If `imdbID` is empty the link goes to
`https://www.imdb.com/title/` — a dead link, but not a crash. When the hook succeeded,
`useTmdbMovie` filled `t.imdbID` from TMDB's `external_ids`, so the IMDb link is often more
accurate than the stored one.

The rest is static structure: poster on the left, title + `rated | genre | released` meta
row, a green "star" belt showing `imdbRating / 10 from imdbVotes users`, the plot teaser,
and a Director / Creator / Actors footer.

---

### frontend/src/components/SeriesInfo.jsx — the info list and storyline

Props: `{ movie, detail, plot }`. `plot` is passed separately even though it is also in
`detail` — because the storyline paragraph is rendered whether or not the list has items,
so it gets its own prop and its own guard.

#### cleanTitle — turning a release string back into a movie name

```jsx
const cleanTitle = (rawTitle) => {
  if (!rawTitle || typeof rawTitle !== "string") return rawTitle;
  return rawTitle
    .replace(/^Download\s+/i, "")
    .replace(/:\s*(Season\s*\d+|S\d+)/i, "")
    .replace(/\s*[[(]Season\s*[^)\]]+[)\]]/i, "")
    .replace(/\s*[[(].*/, "")
    .replace(/\s+\b(20\d\d|19\d\d|Season\s*[^)]+|S\d+)\b.*/i, "")
    .replace(/\s+(Dual|Multi)?\s*Audio.*/i, "")
    .replace(/\s+(WeB-DL|WEB-DL|BluRay|HDRip|480p|720p|1080p|2160p|4K).*/i, "")
    .trim();
};
```

**What this is:** a *regular expression* (`/.../i`) — a text-matching pattern; `^` means
"start of string", `\s` any whitespace, `\d` a digit, and the `i` flag makes it
case-insensitive. `.replace(pattern, "")` deletes whatever matches. Each line strips one
kind of cruft from a release title, in order:

1. a leading `Download `
2. `: Season 3` or `: S03`
3. `(Season 1-5)` / `[Season 2]`
4. everything from the first `(`, `[` or `:` onwards — so `Inception (2010)` → `Inception`
5. a trailing year, season or `S`-number and everything after it
6. `Dual Audio ...` / `Multi Audio ...` and everything after
7. any quality/source token (`WeB-DL`, `720p`, `4K`...) and everything after
8. surrounding whitespace

Try it on
`Download Breaking Bad: Season 3 Dual Audio Hindi-English WeB-DL 720p` — rules 1, 2 and 6
reduce it to `Breaking Bad`. In practice this mostly no-ops on this page, because the
`displayName` it is given is `detail?.title || detail?.fullName || movie?.title`, and
`detail.title` is already TMDB's clean name. It earns its keep when TMDB is down and the
fallback is the admin's stored title, which can carry release cruft.

#### renderQuality — highlight the source tag

```jsx
const regex = /(.*?)(WeB-DL|WEB-DL|Web-DL|BluRay|HDTV|HDRip)(.*)/i;
const match = text.match(regex);
if (match) {
  return (
    <>
      {match[1]}
      <span style={{ color: "#ff0000" }}>
        <strong>{match[2].toUpperCase() === "WEB-DL" ? "WEB-DL" : match[2]}</strong>
      </span>
      {match[3]}
    </>
  );
}
```

`.*?` is the *non-greedy* version of `.*` — it matches as little as possible, so the
capture group lands on the **first** source token rather than the last. The three groups
become: text before, the highlighted source, text after. `"480p WeB-DL [200MB]"` renders as
`480p ` + a red bold `WEB-DL` (casing normalised) + ` [200MB]`. If nothing matches, the
plain string is returned unchanged.

#### Building the list

The component assembles an `items` array of `{ label, value, isQuality? }` and only pushes
rows whose value exists, so the list shrinks rather than filling with "N/A":

```jsx
const displayName = detail?.title || detail?.fullName || movie?.title;
if (displayName) items.push({ label: "Full Name", value: cleanTitle(displayName) });
if (detail?.year) items.push({ label: "Year", value: detail.year });
```

Series-only rows appear only when `isSeries`:

```jsx
const seasonList = detail?.seasonRange?.list;
const episodesPerSeason = detail?.episodesPerSeason;
if (seasonList && seasonList.length > 0) {
  const seasonLabel = seasonList.length > 1
    ? seasonList.join(", ")
    : `Season ${seasonList[0]}`;
  items.push({ label: "Seasons", value: seasonLabel });
} else if (detail?.season) {
  items.push({ label: "Seasons", value: detail.season });
}
```

`seasonRange.list` is the sorted list of season numbers derived from the stored download
links in `getMovieDetails`, so "Seasons" reflects what you actually uploaded. Note the
formatting asymmetry: several seasons render as bare numbers joined by commas (`1, 2, 3`)
while a single season renders as `Season 1`. Then `Episodes` shows TMDB's per-season
episode counts joined the same way (`10, 8, 8`).

Duration / Language / Size / Format are straight passthroughs; `Quality` sets
`isQuality: true` so it renders through `renderQuality`. The header text itself is chosen
by type and coloured teal:

```jsx
const headerTitle = isSeries ? "Series Info:" : "Movie Info:";
...
<h3><span style={{ color: "#008080" }}> {headerTitle} </span></h3>
```

If no items were pushable, the `<h3>` and `<ul>` are skipped entirely (`items.length > 0 &&`),
but the Storyline block still renders on its own `{plot && ...}` condition. A movie with no
data at all therefore renders an empty `div` — the container is always there, so layout
spacing stays stable.

---

### frontend/src/components/Screenshots.jsx — the gallery that hides its failures

Props: `{ images, title }`. This component has one job and one interesting mechanism:
making broken images disappear instead of showing the browser's broken-image icon.

```jsx
const [failed, setFailed] = useState({});

if (!images || images.length === 0) return null;

const visible = images.filter((_, i) => !failed[i]);

if (visible.length === 0) return null;
```

**What this is:** `onError` is a DOM event React lets you handle on `<img>` — it fires when
the image fails to load (404, dead host, blocked request). The handler here records the
failure in a plain object used as a lookup map:

```jsx
onError={() => setFailed((prev) => ({ ...prev, [i]: true }))}
```

**What this is:** the `(prev) => ...` form of a state setter is the *functional update* —
React hands you the previous value, which is the safe way to update state that depends on
itself (several images can fail before React re-renders). `{ ...prev, [i]: true }` copies
the old map and adds one entry; `[i]` is a *computed property name*, so the key is the
image's index. Once an index is marked, that `<img>` is simply not rendered:

```jsx
{images.map((src, i) =>
  failed[i] ? null : (
    <img key={i} src={src} alt={`${title} screenshot ${i + 1}`}
         loading="lazy" onError={() => setFailed(...)} />
  ),
)}
```

**What this is:** `loading="lazy"` tells the browser to defer fetching an image until it is
close to the viewport. A screenshot gallery sits far below the fold, so the page makes
perhaps zero image requests for it on load — that is a real speedup on a page that also
loads posters for 6 popular posts and 4 related ones.

The three exits, in order, each matter:

- No `images` at all → `null` → no heading, no box. This is exactly what the
  "rescue pending" branch in `MovieDetails.jsx` relies on to hide the section while TMDB is
  still loading.
- Some images failed → only the survivors render. A single dead URL costs one row, not the
  whole gallery, and the page never shows a broken-image glyph.
- **All** images failed → `visible.length === 0` → the component removes itself, heading
  included. That is what happens when the rescue fetch came back empty and the stored list
  is also unusable.

One sharp edge worth knowing: `failed` is keyed by **index**, not by URL, and the state
lives for as long as the component is mounted. If image index 0 fails and the list is later
replaced by a different list (the rescue fetch landing, or navigating to another movie
without unmounting), index 0 of the new list is hidden too. In practice the URLs on this
page come as a set and fail together, so it is invisible — but it is the first thing to
check if you ever see a screenshot mysteriously missing.

---

### frontend/src/components/DownloadSection.jsx — movie download buttons

Props: `{ movie, detail }`. Two pieces of work: build the red section heading, then render
one download group per quality.

#### renderLabel — colour-coded download labels

```jsx
const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
let last = 0;
let m;
while ((m = re.exec(label)) !== null) {
  if (m.index > last) nodes.push(label.slice(last, m.index));
  const tok = m[0];
  if (tok.startsWith("{")) {
    nodes.push(<span className="text-red" key={m.index}>{tok}</span>);
  } else if (/x26\d|10bit/i.test(tok)) {
    nodes.push(<span className="text-blue" key={m.index}>{tok}</span>);
  } else {
    nodes.push(<span className="text-teal" key={m.index}>{tok}</span>);
  }
  last = re.lastIndex;
}
```

**What this is:** `String.prototype.match`/`exec` with the `g` flag keeps a cursor in
`re.lastIndex`, so calling `exec` in a `while` loop walks through *every* match instead of
returning only the first. `m.index` is where the match starts, `last` tracks where the
previous one ended, and `label.slice(last, m.index)` recovers the plain text **between**
matches — that is the standard way to rebuild a string as alternating text + highlighted
tokens in React (the array `nodes` is the JSX list; `key={m.index}` gives React a stable
identity per entry).

The pattern matches three token types, and each gets its own colour:

| Token | Example | Class / colour |
|---|---|---|
| `\{[^}]*\}` — anything in braces | `{Hindi-English}` | `text-red` (red) |
| `x26\d` / `10bit` | `x265`, `10Bit` | `text-blue` (blue) |
| `\[[^\]]*\]` — anything in brackets | `[350MB]` | `text-teal` (teal) |

So a stored label like
`Inception {Hindi-English} 720p 10Bit [350MB]` renders with `{Hindi-English}` in red,
`10Bit` in blue, `[350MB]` in teal, and the rest in plain teal from the outer wrapper
`return <span className="text-teal">{nodes}</span>;`. Those classes are defined in
`frontend/src/components/DownloadSection.css`, which is why that file is imported both here
and by `MovieDetails.jsx`.

#### buildHeadingTitle — reconstructing the classic post heading

```jsx
const raw = movie.title.replace(/^Download\s+/i, "");

let name = raw
  .replace(/\s*[([:].*/, "")
  .replace(/\s+\b(20\d\d|19\d\d|Season\s*[^)]+|S\d+)\b.*/i, "")
  .trim();
```

This mirrors the old site's `"Download <Name> <Season> <Year> <Lang> <Qualities> <Subs>"`
heading by reassembling it from pieces it digs out of the stored title:

1. **`name`** — strip from the first `(`, `[` or `:`, then from a trailing year/season.
   `Download Inception (2010)` → `Inception`.
2. **`seasonTag`** — three chances, in priority order: a `(Season ...)` parenthesis, then a
   `: Season N` / `: S N` colon form, then `detail.season` from `getMovieDetails`.
3. **`yearStr`** — the first 4-digit year found in the title, else `detail.year`.
4. **`langStr`** — looks for `Dual Audio {Hindi-English}` / `Multi Audio {...}` first, then
   a `(... Audio)` parenthesis, and normalises to `Hindi-English` by dropping the word
   "Audio", turning commas into dashes and removing spaces. Fallback:
   `detail.language` with `", "` → `-`, else `movie.lang`.
5. **`qualityText`** — this is where the qualities come from:

   ```jsx
   detail.downloads.forEach((d) => {
     const q = d.cls ? `${d.cls}p` : (d.label.match(/\b(480p|720p|1080p|2160p|4K)\b/i) || [])[1];
     if (q && !quals.includes(q)) quals.push(q);
   });
   if (quals.length === 0) quals.push("480p", "720p", "1080p");
   ```

   Each download entry can state its resolution in `cls` — but for published movies
   `getMovieDetails` sets `cls: null`, so in practice the resolution is **parsed back out of
   the label text** with a word-boundary regex. Duplicates are skipped, and if nothing is
   found at all the classic `480p, 720p & 1080p` is assumed. The join is grammatical:
   one → `480p`, two → `480p & 720p`, more → `480p, 720p & 1080p`.
6. **`subStr`** — `Esubs` or `Msubs` if either word appears in the raw title or the
   `releaseTitle`, else nothing.

Finally `parts.filter(Boolean).join(" ")` — **What this is:** `filter(Boolean)` removes
every falsy entry (`""`, `null`, `undefined`), which is how the empty season/year/subtitle
slots vanish instead of leaving double spaces. A movie produces
`Download Inception 2010 English 480p, 720p & 1080p Esubs`.

#### The buttons themselves

```jsx
{detail.downloads.map((d) => (
  <div className="download-group" key={d.label}>
    <h3 className="download-heading">{renderLabel(d.label)}</h3>
    <p className="download-links">
      <a className="dl-btn dl-single" href={d.href || "#"}
         target="_blank" rel="noopener noreferrer">
        Download
      </a>
    </p>
  </div>
))}
```

One green `dl-single` button per stored download link, opening in a new tab.
`href={d.href || "#"}` — `getMovieDetails` already maps a missing `downloadLink` to `"#"`,
so the `|| "#"` is a second belt-and-braces: a dead link is annoying but a `null` href
would make the anchor non-clickable-ish and confusing. Note the styling difference this
section defines and `SeriesSeasons` reuses: `dl-single` is green (`#009987`),
`dl-batch` is red (`#f97c7c`).

---

### frontend/src/components/SeriesSeasons.jsx — season links for series

Props: `{ movie, detail }`. Rendered instead of `DownloadSection` whenever
`movie.type === "Series"`.

#### seasonsFor — stored seasons, or a placeholder range

```jsx
const seasonsFor = (d, detail) => {
  if (d.seasons && d.seasons.length) return d.seasons;
  const list = detail?.seasonRange?.list || [];
  return list.map((s) => ({ season: s, batchLink: "#", episodes: [] }));
};
```

A stored quality normally carries its own `seasons` array (which `transformPublished`
merges in from the legacy `seasonEpisodes` field). If a quality has none — the admin added
a 720p link but never filled in episodes — the component invents placeholder rows from
`detail.seasonRange.list`, each with `batchLink: "#"` and an empty episode list. That keeps
the layout shape stable (a row per season you intend to have) at the cost of showing
buttons that go nowhere and an `Episodes (0)` counter.

#### seasonRangeText — "Season 3" vs "Season 1-5"

```jsx
const nums = seasons.map((s) => s.season).sort((a, b) => a - b);
if (nums.length === 1) return `Season ${nums[0]}`;
return `Season ${nums[0]}-${nums[nums.length - 1]}`;
```

Sorted numerically (`a - b`; alphabetical sort would put `10` before `2`), then collapsed
to first-last. Seasons 1, 2, 3, 5 reads "Season 1-5" even though season 4 is missing — a
known simplification.

#### The heading and the two buttons per season

```jsx
const heading = [seasonRangeText(seasons), d.label].filter(Boolean).join(" ");
...
<h3 className="download-heading">{renderLabel(heading)}</h3>
{seasons.map((s) => (
  <p className="download-links" key={s.season}>
    <a className="dl-btn dl-batch" href={s.batchLink || "#"}
       target="_blank" rel="noopener noreferrer">
      Batch/Zip
    </a>
    <Link className="dl-btn dl-single"
          to={`/series/${movie.id}/season/${s.season}?q=${qi}`}>
      Episodes ({s.episodes?.length || 0})
    </Link>
  </p>
))}
```

- The heading combines the season range with the quality's own label and runs it through
  the same `renderLabel` colouriser as the movie page, so `{Hindi-English}` / `10Bit` /
  `[...]` tokens light up identically. It is a **copy** of the function in
  `DownloadSection.jsx` rather than an import — duplicated on purpose or by accident, but
  if you ever change the colour rules, change both.
- **Batch/Zip** is a plain `<a>` to the stored `batchLink` (a Google Drive zip, typically),
  new tab, `#` if absent.
- **Episodes (N)** is the one place this section does something different from
  `DownloadSection`: it is a React Router `<Link>`, not an `<a>`. **What this is:** `<Link>`
  performs client-side navigation — React Router swaps the page component without a full
  browser reload, so the app state and the loaded JavaScript survive.

The link target deserves a close read:

```
/series/${movie.id}/season/${s.season}?q=${qi}
```

`movie.id` and the season number are the route params; `qi` is the **index of the quality
in `detail.downloads`** (from the enclosing `qualities.map((d, qi) => ...)`), passed as a
query string. `frontend/src/pages/EpisodePage.jsx` reads it back:

```jsx
const qIndex = parseInt(searchParams.get("q") || "0", 10);
...
const quality = (movie.downloadLinks || [])[qIndex] || (movie.downloadLinks || [])[0];
const season = (quality?.seasons || []).find((s) => String(s.season) === String(seasonNum));
```

So clicking the third quality block's "Season 2" row opens
`/series/1399/season/2?q=2`, and the episode page picks quality index 2, then the season
whose number is `"2"`, and lists its episodes. The `String(...) === String(...)` comparison
on both sides is because one value came from the URL (always a string) and the other from
JSON (often a number).

If `detail.downloads` is empty the component short-circuits to
"No download links added yet." instead of rendering an empty block.

A small but real detail: line 2 of the file is `// import "./SeriesSeasons.css";` —
commented out, and there is no `SeriesSeasons.css` in `frontend/src/components/` at all.
Every class the component uses (`download-group`, `download-heading`, `download-links`,
`dl-btn`, `dl-batch`, `dl-single`, `text-red/blue/teal`) lives in
`DownloadSection.css`, which the page imports. That works, but it means this component is
not self-contained: used anywhere `DownloadSection.css` is not already loaded, it renders
unstyled.

---

### frontend/src/components/RelatedPosts.jsx — the related row

The smallest component on the page, and a good illustration of prop-driven rendering:

```jsx
const RelatedPosts = ({ related }) => (
  <>
    <h2 className="relatedpost-heading">RELATED POSTS</h2>
    {related.length === 0 ? (
      <p className="note">No related posts yet.</p>
    ) : (
      <div className="related-cards">
        {related.map((r) => (
          <PostCard key={r.id} movie={r} />
        ))}
      </div>
    )}
  </>
);
```

The heading is rendered unconditionally, so an empty list still shows "RELATED POSTS"
followed by "No related posts yet." — matching the original site. `PostCard` comes from
`frontend/src/components/Postcards.jsx`; it is the same card the home grid uses, and it
does its own `getMovieDetails(movie)` call to build a `releaseTitle` (used only when the
title does not already start with "Download ") and links to
`/movie-details/${movie.id}`. So the sidebar-ish data — which the backend deliberately sent
**without** download links or screenshots — is enough to render the card, because
`getMovieDetails` fills any gaps with generated defaults. No memoization anywhere: four
cards, four cheap object builds, every render.

`key={r.id}` — **What this is:** React's list key, a stable identifier that lets it match
up elements between renders instead of rebuilding the DOM. Using a real id (rather than the
array index) means the four cards keep their identity when the list shrinks.

---

### frontend/src/components/CommentSection.jsx — a form that intentionally does nothing

```jsx
const CommentSection = () => (
  <div className="comment-section">
    <h2 className="comments-heading"> ADD COMMENT </h2>
    <form className="comment-form" onSubmit={(e) => e.preventDefault()}>
```

Props: none. State: none. This is a pure visual replica of the original site's comment box.

- **What this is:** `onSubmit={(e) => e.preventDefault()}` cancels the browser's default
  form submission, which would otherwise navigate the whole page to the form's `action`
  URL (reloading the site and losing your place). Cancelled, the click does nothing.
- The textarea and two inputs are **uncontrolled**: no `value` prop, no `onChange`, no
  `useState`. **What this is:** an uncontrolled input keeps its own value in the DOM and
  React never reads or writes it — the opposite of the *controlled* inputs in the search
  box in `frontend/src/components/Sidebar.jsx`, where `value={query}` plus `onChange` make
  React the single source of truth. For a form you never read, uncontrolled is simpler and
  costs nothing.
- The "Save my name, email..." checkbox is likewise inert — no persistence anywhere, so it
  does not save anything.
- There is no comments table in `backend/models/` and no comment route in
  `backend/routes/movieRoutes.js`, so nothing could be submitted even if the handler did
  something. If you ever want real comments, this is the file to change plus a new route on
  the backend — and "No Comments" in `MovieHeader.jsx` is the second half of that work.

---

### Key takeaways

- **`MovieDetails.jsx` is the brain; the eight components are dumb.** Every child takes
  props and draws; all fetching, merging and branching lives on the page.
- **The two initial requests are independent, so they run in parallel** via `Promise.all`:
  one full MongoDB document for the movie, one light projected list (`-downloadLinks
  -seasonEpisodes -screenshots -overview`) for the sidebar and related cards. An inner
  `.catch` turns a list failure into an empty list so the page still renders.
- **Loading is derived, not stored.** `fetched` is stamped with the id it was fetched for;
  `loading = fetched.id !== id || !fetched.ready` becomes true on the very first render
  after a route change, which both eliminates spinner-cascade `setState` calls and makes it
  impossible for the previous movie's content to flash under the new URL.
- **The `active` flag in every effect's cleanup** is the standard guard against a slow older
  response overwriting a newer one when the id changes mid-flight.
- **`displayDetail` encodes a trust policy**: TMDB wins for metadata (title, poster, rating,
  genres, cast, plot), the stored document wins for the download site (`downloads`,
  `releaseTitle`, `size`, `quality`, `categories`), and a few fields (`year`, `language`)
  stay blank rather than guessed. `const t = tmdb || {}` plus `||` chains is the whole
  mechanism.
- **Screenshots have a four-level waterfall** — TMDB hook → legacy stored list → rescue
  fetch → stored placeholders — and the page intentionally renders *nothing* while the
  rescue is pending, so placeholders never flash.
- **The rescue effect is guarded five ways** (page loading, hook pending, hook succeeded,
  already attempted for this movie via `shots.id`, no API key) so it fires at most once per
  movie and never duplicates a successful hook fetch.
- **"Popular" is really "newest by TMDB id"** and **"related" is "same type, most recently
  published"** — honest stand-ins, both computed client-side from the list the page already
  fetched.
- **`MovieHeader` builds chip links by name**: known sidebar tags go to `/?tag=`, everything
  else to `/?q=`; its `<h1>` is the long machine-built `releaseTitle`.
- **`MovieInfoCard` localises TMDB loading** (the page renders, only the card says
  "Loading..."), falls back to `movie` for every field, and always shows "N/A" for `rated`
  because `displayDetail` never sets it.
- **`SeriesInfo` cleans and classifies**: `cleanTitle` strips release cruft down to a bare
  name, `renderQuality` highlights the source token in red, and rows only appear when their
  value exists.
- **`Screenshots` deletes its own failures**: `onError` records the image index in a state
  map and React stops rendering that `<img>`; if all fail, the whole section (heading
  included) disappears. Caveat: the map is keyed by index, so a replaced list inherits the
  old failures.
- **`renderLabel` exists twice, once in `DownloadSection.jsx` and once in
  `SeriesSeasons.jsx`**, colouring `{...}` red, `x26x`/`10bit` blue and `[...]` teal from
  the shared classes in `frontend/src/components/DownloadSection.css`.
- **`buildHeadingTitle` reassembles the classic "Download <Name> <Season> <Year> <Lang>
  <Qualities> <Subs>" heading**, and because `getMovieDetails` sets `cls: null` for
  published movies, it parses resolutions back out of the label text.
- **`SeriesSeasons` navigates client-side to `/series/:movieId/season/:season?q=<quality
  index>`**, where `q` tells `EpisodePage` which stored quality's episodes to list;
  qualities without stored seasons get placeholder rows with a `#` batch link.
- **`CommentSection` is a non-functional visual replica**: `preventDefault` on submit,
  uncontrolled inputs, no backend route. Real comments would need this file, a new backend
  route and a fix for the hardcoded "No Comments" in `MovieHeader.jsx`.
## 07. Episode Page & the Admin Panel (AddMovies)

This section covers the two pages that sit at opposite ends of the site: the
public **EpisodePage** (a visitor lands here from a series' "Episodes" button)
and the private **AddMovies** admin panel (where you search TMDB, build
download links, publish, edit and delete titles).

Files covered:

- `frontend/src/pages/EpisodePage.jsx`
- `frontend/src/pages/AddMovies.jsx`
- Supporting pieces they lean on: `frontend/src/api/moviesApi.js`,
  `frontend/src/assets/moviesStore.js`, `frontend/src/App.jsx`,
  `frontend/src/components/MovieInfoCard.jsx`, `frontend/src/components/SeriesInfo.jsx`,
  `frontend/src/components/Screenshots.jsx`, `frontend/src/components/SeriesSeasons.jsx`,
  and `backend/routes/movieRoutes.js` (the admin password checks).

---

### `frontend/src/App.jsx` — how you reach these pages

#### Both pages are lazy-loaded

```jsx
const MovieDetails = lazy(() => import("./pages/MovieDetails"))
const AddMovies = lazy(() => import("./pages/AddMovies"))
const EpisodePage = lazy(() => import("./pages/EpisodePage"))
...
<Route path='/series/:movieId/season/:seasonNum' element={page(<EpisodePage/>)}></Route>
```

**What this is:** *code splitting* means the browser doesn't download one huge
JavaScript file at startup; each page becomes its own file that is fetched the
first time someone visits that route (then cached). React's `lazy()` +
`<Suspense>` handle the "fetch it, and show nothing/fallback while waiting"
part.

The admin panel is the heaviest page in the app, so keeping it out of the
initial bundle is why `HomePage` loads fast for normal visitors who never open
`/AddMovies`.

The entry point into EpisodePage is the "Episodes (n)" button in
`frontend/src/components/SeriesSeasons.jsx`:

```jsx
<Link
  className="dl-btn dl-single"
  to={`/series/${movie.id}/season/${s.season}?q=${qi}`}
>
```

Note that it encodes **two** things in the URL: the season number as a path
segment, and *which quality block* was clicked as a `?q=` query parameter.

---

### `frontend/src/pages/EpisodePage.jsx` — one season, one quality, all episodes

This is a small, deliberately narrow page (117 lines). Its whole job: given a
series, a season, and a quality, list that season's episode links.

#### Reading the route params

```jsx
const { movieId, seasonNum } = useParams();
const [searchParams] = useSearchParams();
const qIndex = parseInt(searchParams.get("q") || "0", 10);
```

**What this is:** *route params* (`useParams`) are the named, variable parts of
the URL path — here `:movieId` and `:seasonNum` from the route above. *Query
params* (`useSearchParams`) are the bits after the `?` and are optional.

So a URL like `/series/1399/season/2?q=1` gives:

- `movieId` → `"1399"` (the TMDB id, always a **string** off the URL)
- `seasonNum` → `"2"` (string)
- `qIndex` → `1` (a real number; `parseInt(..., 10)` forces base-10 parsing so
  `"08"` doesn't become `0`)

The `|| "0"` default means a link without `?q=` behaves as "first quality".

#### Fetching exactly one document

```jsx
useEffect(() => {
  let active = true;
  // One request for just this series' document (with its download links)
  // instead of downloading the whole library and picking one.
  moviesApi.get(movieId).then((doc) => {
    if (!active) return;
    setMovie(doc ? transformPublished(doc) : null);
    setLoading(false);
  }).catch(() => {
    if (active) setLoading(false);
  });
  return () => { active = false; };
}, [movieId]);
```

**What this is:** `useEffect` runs a *side effect* (anything outside React's
render: network calls, timers, subscriptions) after the component appears on
screen. The array at the end, `[movieId]`, is the *dependency array* — React
re-runs the effect only when one of those values changes, so navigating from
season 1 to season 2 of the same series does **not** refetch the movie.

Three things are worth noticing:

- The comment says why it's a single-document fetch: `moviesApi.get()` calls
  `GET /api/movies/:tmdbId` instead of `list({ all: 1 })`. On a library of
  hundreds of titles with per-episode URLs, that difference is the difference
  between a few KB and a few MB.
- `moviesApi.get()` returns `null` on a 404 and throws on anything else. The
  `null` path stores `null` (→ "not found" screen); the throw path just stops
  the loading spinner. One honest quirk to know about: **a network error looks
  identical to a missing series** — the visitor sees "Series not found" either
  way. If you ever see that message while the series definitely exists, suspect
  the backend being down rather than bad data.
- The `active` flag is a *stale-response guard*. If you click from one series
  to another quickly, two requests can be in flight at once. The cleanup
  function returned by the effect runs before the *next* effect run and sets
  `active = false`, so the older request's late response is discarded instead
  of overwriting the newer one.

`transformPublished()` (in `frontend/src/assets/moviesStore.js`) converts the
raw Mongo document into the shape the rest of the app uses — `id` as a number,
`type: "Series"`, a placeholder poster, and importantly it merges the legacy
`seasonEpisodes` array into each quality's `seasons` so old entries keep
working. It also explains how a TV entry's downloads are shaped:

```js
const downloadLinks = (entry.downloadLinks || []).map((d) => { ... });
// each d looks like:
// { resolution, quality, audioTag, size, customSuffix, label, seasons: [...] }
// and each season: { season: 1, batchLink, episodes: [{ episodeNumber, episodeLink }] }
```

#### Loading and not-found states

Two early returns keep the main render simple:

```jsx
if (loading) { ... <p className="ep-loading">Loading…</p> ... }
if (!movie || movie.type !== "Series") { ... "Series not found." ... }
```

The `movie.type !== "Series"` check is the important one: it stops a movie
(q.v. *Inception*) from ever reaching season/episode code. Someone can only
land here by hand-editing the URL, but when they do, they get a clean message
with a link home instead of a blank screen or a crash.

#### Finding the right quality block and season

```jsx
const quality = (movie.downloadLinks || [])[qIndex] || (movie.downloadLinks || [])[0];
const season = (quality?.seasons || []).find(
  (s) => String(s.season) === String(seasonNum)
);
const episodes = season?.episodes || [];
```

Line by line:

- `(movie.downloadLinks || [])` — defensive default. `downloadLinks` can be
  missing on a partially-published entry; without the `|| []` this line would
  crash on `. qIndex]`.
- `... [qIndex] || ... [0]` — if the URL asks for quality #5 but only 2 exist
  (e.g. you deleted a quality since the link was shared), fall back to the
  first one rather than showing an empty page.
- `quality?.seasons` — **optional chaining**. `?.` means "if the thing before
  the dot is null/undefined, the whole expression is undefined instead of
  throwing". It's what makes `quality?.seasons || []` safe when `quality` is
  undefined.
- `String(s.season) === String(seasonNum)` — the comparison is done on strings
  on purpose. `seasonNum` comes from the URL as a string while `s.season` is a
  number in the database, and `"2" === 2` is `false` in JavaScript. Comparing
  both sides as strings avoids a `parseInt` bug class entirely.

#### Rendering: breadcrumb, title, quality tabs, episode rows

The header block is built from the pieces we just resolved:

```jsx
<h1 className="ep-title">
  {movie.title} — Season {seasonNum}
  {quality ? <span className="ep-quality"> {quality.label}</span> : null}
</h1>
```

Then the quality tabs. This is the reason the `?q=` parameter exists:

```jsx
{(movie.downloadLinks || []).map((d, i) => (
  <Link
    key={i}
    to={`/series/${movie.id}/season/${seasonNum}?q=${i}`}
    className={`ep-quality-tab ${i === qIndex ? "ep-quality-tab--active" : ""}`}
  >
    {d.label}
  </Link>
))}
```

Each tab is a `<Link>` to the *same* season with a different `?q=` index.
Clicking one changes the query string, React Router re-renders the component
with the new `qIndex`, and since `qIndex` isn't in the effect's dependency
array there is **no second network request** — all the data is already in
state. Switching quality on this page is instant, which is exactly why the
quality was put in the URL instead of in component state: the tab is
shareable/bookmarkable *and* free.

Finally the episode list:

```jsx
<ul className="ep-list">
  {episodes.map((ep) => (
    <li className="ep-row" key={ep.episodeNumber}>
      <a className="dl-btn dl-single"
         href={ep.episodeLink || "#"}
         target="_blank" rel="noopener noreferrer">
        Episode {ep.episodeNumber}
      </a>
    </li>
  ))}
</ul>
```

- `key={ep.episodeNumber}` — React uses `key` to match list items across
  re-renders so it can move/update them instead of rebuilding the DOM.
- `target="_blank"` opens the hoster in a new tab; `rel="noopener noreferrer"`
  stops the opened page from being able to reference this tab (a small
  security/privacy measure that also avoids leaking your URL).
- The empty state (`No episodes added for this season/quality yet.`) is
  reachable in real use: you can publish a quality with seasons but no episodes
  yet, and the episode links live per-quality, so Season 2 might exist under
  1080p but not under 720p.

---

### `frontend/src/pages/AddMovies.jsx` — the admin panel

At ~1070 lines this is the biggest file in the frontend. It is organised in
three bands, top to bottom:

1. **Module-level helpers** (lines 8–169) — pure functions and small
   presentational components that don't need the page's state.
2. **`QualityChip` + `SeriesQualityEditor`** (lines 150–293) — the per-quality
   editing widgets.
3. **The `AddMovies` component** (lines 296–1066) — all the state, the TMDB
   calls, the publish/delete logic, and the two-column JSX.

The design idea behind the whole page: **a two-panel layout where the left
panel is the form and the right panel is the live site**. You never have to
publish to see what a title will look like.

---

### Top-of-file helpers

#### TMDB constants and `poster()`

```jsx
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB     = "https://api.themoviedb.org/3";
const IMG      = "https://image.tmdb.org/t/p";
const poster   = (p, sz = "w185") => {
  if (!p) return null;
  if (typeof p === "string" && (p.startsWith("http://") || p.startsWith("https://"))) {
    return p;
  }
  return `${IMG}/${sz}${p.startsWith("/") ? p : `/${p}`}`;
};
```

TMDB returns poster paths like `/abc123.jpg`, not full URLs, so `poster()`
prepends the image host and a size folder (`w92` for tiny list thumbnails,
`w185` by default, `w500` for cards, `w780` for screenshots). The
`startsWith("http")` branch is a pass-through for cases where you already have
a full URL (e.g. a poster saved from a previous edit). `import.meta.env` is
Vite's way of exposing variables from `.env` to the browser — note this means
your TMDB key ships to every visitor, which is normal for TMDB apps (the key
is meant to be public) but is *not* how you'd treat a secret like a password.

#### The dropdown constants

```jsx
const RESOLUTIONS = ["360p","480p", "720p", "1080p", "2160p (4K)"];
const QUALITIES   = ["WEB-DL", "BluRay","HDRip", "CamRip", "HDTS", "10bit"];
const AUDIO_TAGS  = ["","{Hindi-English}", "{English}", "{Hindi}", "{Org Audio}", "{Hindi-English-Spanish}", "{Multi Audio}"];
const BLANK_LINK  = { resolution: "1080p", quality: "WEB-DL", audioTag: "{Org Audio}", size: "", customSuffix: "", downloadLink: "", episodeLink: "", batchLink: "" };
```

Keeping these as plain arrays means the `<select>` options are rendered by
mapping, and adding a new quality tag later is a one-line change. The curly
braces in `AUDIO_TAGS` aren't decoration: the label colouriser below looks for
`{...}` and paints those tokens red, matching the movie-site convention where
audio info appears in braces.

#### `isValidUrl` and `buildLabel`

```jsx
const isValidUrl = (str) => {
  try { return Boolean(new URL(str)); } catch { return false; }
};

const buildLabel = ({ resolution, quality, size, audioTag, customSuffix }) =>
  [resolution, quality, audioTag, size ? `[${size}]` : "", customSuffix]
    .map(s => (s || "").trim()).filter(Boolean).join(" ");
```

`isValidUrl` uses the browser's built-in `URL` parser as the validator: if
`new URL("garbage")` throws, it wasn't a URL. Much more reliable than a
hand-written regex.

`buildLabel` is the single source of truth for the display name of a quality
block. It builds an array, trims every part, **filters out the empty ones**
(this is why a missing size doesn't leave a double space), and joins with
spaces — e.g. `1080p WEB-DL {Org Audio} [2.3GB] x264 Msubs`. It's called twice:
once for the live "Preview:" line under the form, and once for real when the
link is added. That guarantees the preview can never drift from the stored
label.

#### `renderLabel` — colour-coding a label string

```jsx
const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
let last = 0, m;
while ((m = re.exec(label)) !== null) {
  if (m.index > last) nodes.push(label.slice(last, m.index));
  const tok = m[0];
  if (tok.startsWith("{"))        nodes.push(<span className="text-red"  key={m.index}>{tok}</span>);
  else if (/x26\d|10bit/i.test(tok)) nodes.push(<span className="text-blue" key={m.index}>{tok}</span>);
  else                            nodes.push(<span className="text-teal" key={m.index}>{tok}</span>);
  last = re.lastIndex;
}
```

**What this is:** a *regular expression* pattern that matches three kinds of
token — `{anything}`, `x264`/`x265`, and `[bracketed]` — and the loop walks the
string with `exec()` in a `while`, slicing out the plain text between matches
and wrapping each match in a coloured `<span>`. Red = audio tags, blue =
codec/10bit, teal = file size brackets. The file's comment says it's the *same
logic as* `frontend/src/components/DownloadSection.jsx` (and
`SeriesSeasons.jsx` has a third copy) — the preview intentionally renders
labels identically to the public site, at the cost of that duplication.

---

### `DownloadPreview` — the bottom of the preview panel

```jsx
{mediaType === "movie" ? (
  d.downloadLink && <a className="dl-btn dl-single" href={d.downloadLink} ...>Download</a>
) : (
  <>
    {d.episodeLink && <a ... >Episode Links</a>}
    {d.batchLink   && <a ... >Batch/Zip File</a>}
  </>
)}
```

This is a stripped-down read-only clone of the public `DownloadSection`: no
alerts, no social buttons, just the heading, the colourised label, and the
buttons. Note the branch on `mediaType`: a **movie** quality block holds one
`downloadLink`, while a **TV** block holds seasons/episodes so the preview
shows placeholder buttons. When the URLs are missing it prints a grey "No URL
yet." hint instead of a dead link — useful while you're mid-entry.

---

### `MoviePreview` — mapping TMDB data onto your own components

```jsx
<MovieInfoCard detail={displayDetail} movie={movieObj} loading={false} />
<SeriesInfo    movie={movieObj}        detail={displayDetail} plot={displayDetail.plot} />
{screenshots.length > 0 && <Screenshots images={screenshots} title={displayDetail.title} />}
<DownloadPreview title={displayDetail.title} downloadLinks={downloadLinks} mediaType={mediaType} />
```

This is the reason the right panel exists: it reuses the *exact* components the
public `MovieDetails` page uses, so what you see while editing is what visitors
will get. The work is all in the mapping object it feeds them:

```jsx
const movieObj = {
  type:  mediaType === "tv" ? "Series" : "Movie",
  title: tmdb.title || tmdb.name || details.title || "",
  genre: (tmdb.genres || [])[0]?.name || "",
  lang:  "English",
  imageUrl: poster(tmdb.poster_path, "w500") || poster(details.poster, "w500"),
};
```

Things to understand here:

- TMDB names movies `title` and TV shows `name`, hence the
  `tmdb.title || tmdb.name` pattern repeated everywhere in this file.
- `sizes` / `quals` derive a summary line from the links you've added:
  `[...new Set(downloadLinks.map(d => d.size).filter(Boolean))]`. **What this
  is:** a `Set` is a collection of unique values, so spreading it into an array
  (`[...new Set(list)]`) is the idiomatic one-liner for "deduplicate this
  list". It turns several links of `1.4GB` into one `Size: 1.4GB & 2.8GB` row.
- `director` / `writer` / `actors` come from the `credits` append:
  crew filtered by `job === "Director"` vs `department === "Writing"`, and the
  first four cast members.
- Screenshots are pulled from TMDB backdrops (`images.backdrops`, sliced to 8)
  rather than from the stored `screenshots` field — in the admin you get real
  TMDB imagery for free before you've typed anything.
- A few values are **hard-coded preview approximations**, so don't be surprised
  if the live page differs slightly: `format: "Mkv"`, `subtitles: "Yes
  (English)"`, `lang: "English"` in `movieObj`, and `runtime` only exists for
  movies (TMDB puts per-episode runtimes elsewhere), so series show no
  duration.
- `plot` prefers `seasonInfo.overview` then falls back to the show overview.

---

### `QualityChip` — one added quality, summarised

```jsx
const urlCount = mediaType === "movie"
  ? (d.downloadLink ? 1 : 0)
  : (d.seasons?.length || 0);
```

A compact read-only row showing resolution, quality, `[size]`, and — the useful
bit — how many URLs are behind it ("no seasons", "3 seasons", "no URL"). That
count is what stops you publishing a TV series with quality blocks that have no
seasons in them, which would otherwise be invisible until a visitor hit the
empty EpisodePage. The `×` button calls `onRemove(index)`.

---

### `SeriesQualityEditor` — seasons and episodes per quality

This component owns the trickiest data shape in the app: a quality block's
`seasons` array, each season holding its own `episodes` array.

#### It keeps its own small local state

```jsx
const [season, setSeason] = useState("");
const [batchLink, setBatchLink] = useState("");
const [episodeNumber, setEpisodeNumber] = useState("");
const [episodeLink, setEpisodeLink] = useState("");
const [activeSeason, setActiveSeason] = useState(null);
```

The **data** (seasons/episodes) lives in the parent `AddMovies`; this component
only owns the *input fields* and which season's episode form is open. When you
click "Add", it computes a brand-new `seasons` array and hands it up through
`onChange`.

#### `addSeason` — an upsert with immutable updates

```jsx
const nextSeasons = existing
  ? seasons.map((s) => (s.season === sn ? { ...s, batchLink } : s))
  : [...seasons, { season: sn, batchLink, episodes: [] }].sort(
      (a, b) => a.season - b.season
    );
onChange({ ...quality, seasons: nextSeasons });
```

**What this is:** an *immutable update* — instead of pushing into the existing
array (which React can't detect reliably and which mutates data other code may
be holding), you build a new array: `[...seasons, newItem]`. The spread `...`
copies every existing element into the new array. Likewise `{ ...s, batchLink }`
makes a *new* season object with one field replaced.

Notice the upsert semantics: adding Season 1 when Season 1 already exists
doesn't create a duplicate — it just overwrites the batch link. And the new
array is `.sort()`ed by season number, so Season 3 added before Season 1 still
displays in order. Both the button and the "Add" click are gated on
`!season || !batchLink || !isValidUrl(batchLink)`, so a bad URL simply can't
enter the data.

#### `addEpisode` — one season out of many

```jsx
const nextSeasons = seasons.map((s) => {
  if (s.season !== sn) return s;
  ...
  return { ...s, episodes: nextEps };
});
onChange({ ...quality, seasons: nextSeasons });
```

`map` touches every season but returns each unchanged season *as the same
object* (`return s`), so only the targeted season is rebuilt — the reference
equality of untouched seasons is preserved, which keeps React's re-rendering
cheap. Inside, episodes get the same upsert-and-sort treatment as seasons:
re-adding Episode 4 updates its link instead of duplicating it.

#### Removal, and the one-form-at-a-time UI

```jsx
const removeSeason = (sn) =>
  onChange({ ...quality, seasons: seasons.filter((s) => s.season !== sn) });

const removeEpisode = (sn, epNum) =>
  onChange({
    ...quality,
    seasons: seasons.map((s) =>
      s.season === sn
        ? { ...s, episodes: (s.episodes || []).filter((e) => e.episodeNumber !== epNum) }
        : s
    ),
  });
```

`removeEpisode` is the same pattern nested one level deeper: map the seasons,
rebuild only the matching one with a filtered episode list.

`activeSeason` is a single value, not a set — only one season shows its
"Ep #/Episode Link" form at a time; the rest show a "+ Add Episode" button.
One quirk to be aware of: the four input states are shared, so if you type half
an episode link, open a different season, the text is still there. Harmless
(the Add button is disabled until both fields are valid), just not
per-season.

---

### The main component — state, grouped

`AddMovies` declares a lot of `useState` calls. Grouped by concern:

```jsx
// search
const [query, setQuery] = useState("");
const [searchResults, setSearchResults] = useState([]);
const [searching, setSearching] = useState(false);
const debounceRef = useRef(null);
```

**What this is:** `useRef` creates a box that survives re-renders and whose
`.current` you can change without causing a re-render. That is exactly what a
timer id needs — you must be able to find and cancel the pending timer on the
next keystroke, but a timer id is not "screen state" and shouldn't redraw
anything.

The other groups: selected title (`selectedResult`, `fullDetails`,
`loadingDetails`, `mediaType`), link builder (`downloadLinks`, `newLink`,
`previewLabel`, `canAdd`), publishing (`published`, `publishedList`,
`editingTmdbId`, `mode`, `manageQuery`, `publishError`), and admin security
(`isAdminUnlocked`, `adminModalOpen`, `adminModalConfig`, `adminInputPass`,
`adminModalError`, `adminModalLoading`, `showPassword`).

`editingTmdbId` is the add/edit switch: `null` means "creating a new entry",
any number means "updating that TMDB id", and it drives the button label
("Publish Movie" vs "Update"), the success banner text, and which API method is
called.

---

### TMDB multi-search with a 450ms debounce

This effect is the heart of the search box, and it's worth reading slowly.

```jsx
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  const q = query.trim();
  if (!q) { setSearchResults([]); return; }

  debounceRef.current = setTimeout(async () => {
    setSearching(true);
    try {
      const res  = await fetch(`${TMDB}/search/multi?query=${encodeURIComponent(q)}&api_key=${TMDB_KEY}&language=en-US&page=1`);
      const data = await res.json();
      setSearchResults(
        (data.results || [])
          .filter(r => r.media_type === "movie" || r.media_type === "tv")
          .slice(0, 12)
      );
    } catch { setSearchResults([]); }
    setSearching(false);
  }, 450);

  return () => clearTimeout(debounceRef.current);
}, [query]);
```

**What this is:** *debouncing* means delaying an action until the user has
stopped doing it for a while, and cancelling the pending action if they start
again. A search box fires one `onChange` per character; without debouncing,
typing "interstellar" would hit TMDB 12 times. With a 450ms debounce, only the
last keystroke (followed by 450ms of silence) actually fires a request — one
request per *thought*, not per letter.

How the pieces fit:

- **Why a `useRef` for the timer:** `setTimeout` returns an id you need later to
  cancel. State would work but would trigger a pointless re-render every
  keystroke; a plain local variable would be wiped on each render. A ref is the
  correct tool: persistent, mutable, non-rendering.
- **Two cancellation points, not one.** The cleanup function
  (`return () => clearTimeout(...)`) runs when `query` changes or the component
  unmounts — that's React's official cancellation hook. The
  `if (debounceRef.current) clearTimeout(...)` at the top is a belt-and-braces
  cancel at the start of the next run. Either one alone would mostly work;
  both means the timer is never double-scheduled.
- **The empty-query branch is deliberately synchronous.** Clearing the box must
  empty the results *right now*; putting that behind a 450ms timer would leave
  stale rows on screen after you hit the `×`. That's also why the file carries
  the `eslint-disable-next-line react-hooks/set-state-in-effect` comment —
  calling a setter directly inside an effect is normally a smell, and the
  comment documents that it's intentional.
- `encodeURIComponent(q)` percent-encodes the query so a title containing `&`
  or spaces can't corrupt the URL.
- `search/multi` returns people and companies too, hence the
  `.filter(r => r.media_type === "movie" || r.media_type === "tv")`, and
  `.slice(0, 12)` keeps the dropdown short.
- `try/catch` with an empty catch means "network failure = empty list", which
  makes the hint text below read `No results found for "…"` on a timeout. If
  searches silently return nothing, that's the path they took.

---

### Selecting a result → fetching full details

```jsx
const handleSelectResult = useCallback(async (result) => {
  setSelectedResult(result);
  setDownloadLinks([]);
  setNewLink(BLANK_LINK);
  setPublished(false);
  setFullDetails(null);
  setLoadingDetails(true);
  setMediaType(result.media_type);
```

**What this is:** `useCallback` returns a *memoised* function — the same
function object between renders unless its dependency array changes. Here the
dependency array is empty, meaning the function never changes; that's safe
because it only reads its argument and calls setters (which are stable), never
any other state.

The first block is a full reset: picking a new title throws away any links you
built for the previous one, so you can't accidentally publish Season links
meant for another show.

Then one TMDB request does most of the work:

```jsx
const res = await fetch(`${TMDB}/${mt}/${result.id}?api_key=${TMDB_KEY}&append_to_response=credits,external_ids,images`);
```

**What this is:** `append_to_response` is TMDB's way of bundling several
endpoints into one round trip. This single call returns the base details
*plus* `credits` (cast/crew), `external_ids` (the IMDb id used by
`MovieInfoCard`'s poster link), and `images` (backdrops used as screenshots) —
four requests' worth of data in one.

For TV shows it synthesises a `seasonInfo` object:

```jsx
const totalSeasons = tmb.number_of_seasons || 1;
const list = Array.from({ length: totalSeasons }, (_, i) => i + 1);
seasonInfo = {
  seasonRange: { start: 1, end: totalSeasons, list },
  seasonText: totalSeasons > 1 ? `Season 1-${totalSeasons}` : "Season 1",
  episodesPerSeason: [],
  overview: tmb.overview,
};
```

`Array.from({ length: n }, (_, i) => i + 1)` is the idiom for "make `[1, 2, …
n]`" and `SeriesInfo` renders that list as its "Seasons" row. Any TMDB failure
is only logged; the page still shows the selected strip so you can Back out
rather than freezing on a spinner.

---

### The link builder form

#### `setField` — one handler for many inputs

```jsx
const setField = (field) => (e) => setNewLink(p => ({ ...p, [field]: e.target.value }));
```

**What this is:** a *curried* function — a function that returns another
function. `setField("size")` produces an `onChange` handler dedicated to the
size field, so six inputs can share one factory instead of six near-identical
handlers. The updater form `p => ({ ...p, ... })` and the computed key
`[field]` keep it generic; all inputs are **controlled**, meaning their value
comes from React state and every keystroke goes through this setter (single
source of truth — the label preview updates on the same keystroke).

#### `handleAddLink` — the shape differs for movies vs TV

```jsx
if (mediaType === "tv") {
  setDownloadLinks(prev => [
    ...prev,
    { resolution, quality, audioTag, size, customSuffix,
      label: buildLabel(newLink), seasons: [] },
  ]);
} else {
  setDownloadLinks(prev => [...prev, { ...newLink, label: buildLabel(newLink) }]);
}
setNewLink(p => ({ ...BLANK_LINK, resolution: p.resolution, quality: p.quality, audioTag: p.audioTag }));
```

A movie block carries its URL directly (`downloadLink`); a TV block starts
empty with `seasons: []` because URLs are attached per season/episode in
`SeriesQualityEditor`. The reset line is a nice UX touch: after adding, size,
suffix and URLs are cleared but **resolution/quality/audioTag are kept**, since
you typically add 1080p WEB-DL then 720p HDRip — you change one dropdown, not
all three.

`handleRemoveLink(index)` filters by index, and the parent hands edits down to
the editor like this:

```jsx
const updateQuality = (index, next) =>
  setDownloadLinks(prev => prev.map((d, i) => (i === index ? next(d) : d)));

// usage in JSX:
<SeriesQualityEditor quality={d} onChange={(nq) => updateQuality(i, () => nq)} />
```

`updateQuality` applies a *transform function* to one element of the array —
only the quality you were editing is replaced; the rest keep their object
identity.

---

### Publishing: `executePublish` and the payload

```jsx
const existingEntry = editingTmdbId != null ? publishedList.find((p) => p.tmdbId === editingTmdbId) : null;
const resolvedPoster =
  poster(tmdb.poster_path) ||
  poster(selectedResult.poster_path) ||
  fullDetails.poster ||
  existingEntry?.poster ||
  "";
```

The poster fallback chain matters because a poster can come from four places:
fresh TMDB data, the thumbnail of the result you clicked, the value stashed by
`startEdit`, or what's already in the database. Note `existingEntry?.poster` as
the last resort — **when editing, a failed TMDB lookup never wipes your saved
poster** (the backend reinforces this: `PUT` does `if (!updateData.poster)
delete updateData.poster` so an empty value isn't written).

The `entry` object is the document that gets stored:

```jsx
const entry = {
  tmdbId:      selectedResult.id,
  mediaType:   fullDetails.mediaType,
  title:       selectedResult.title || selectedResult.name,
  poster:      resolvedPoster,
  genre:       (tmdb.genres || [])[0]?.name || existingEntry?.genre || "",
  lang:        tmdb.original_language || existingEntry?.lang || "English",
  imdbID:      fullDetails.imdbID || existingEntry?.imdbID || "",
  ...
  downloadLinks,
  seasonEpisodes: [],
  publishedAt: editingTmdbId != null
    ? (existingEntry?.publishedAt || new Date().toISOString())
    : new Date().toISOString(),
};
```

Two patterns to internalise, because they repeat on nearly every line:

- **`tmdb.X || existingEntry?.X || default`** — a three-step fallback. TMDB is
  the source of truth, but if a field is missing there (TMDB regularly has no
  `runtime` for TV), keep whatever was already published rather than degrading
  the live page. Defaults (`""`, `0`, `"English"`) come last.
- **`publishedAt` is preserved on edit.** That field drives the "newest first"
  sort in `GET /api/movies`, so re-saving an old title must not make it jump to
  the top of the homepage.

`seasonEpisodes: []` looks like dead weight but isn't: it's the legacy field
that `transformPublished` still merges into `seasons` for old entries, and the
backend's field whitelist accepts it, so the client keeps sending an empty
array to keep old and new shapes aligned.

Then the send:

```jsx
if (editingTmdbId != null) await moviesApi.update(entry);
else await moviesApi.add(entry);
const updated = await moviesApi.list({ all: 1 });
setPublishedList(updated.movies);
setPublished(true);
```

Refetching the list afterwards is what makes the Manage tab and the
`isPublished` badge accurate without any optimistic guessing. On failure:

```jsx
if (e.message?.includes("Unauthorized") || e.message?.includes("Admin")) {
  setIsAdminUnlocked(false);
  moviesApi.clearAdminPassword();
}
setPublishError(e.message || "Failed to publish. Is the backend running?");
```

**401 handling:** `moviesApi.update` converts an HTTP 401 into an Error whose
message contains "Admin authorization required…". Seeing that here means the
stored password stopped being valid (wrong password, or the server's
`ADMIN_PASSWORD` changed), so the panel deliberately locks itself and drops the
stored password — the next action will pop the password modal again instead of
failing forever in a loop. Otherwise the red banner shows the message; the
"Is the backend running?" default is the usual cause if Node isn't up.

`handlePublish` is the gate in front of it:

```jsx
if (published || !selectedResult || !fullDetails) return;
if (editingTmdbId != null && !isAdminUnlocked) {
  requestAdminAccess("update", selectedTitle, executePublish);
  return;
}
await executePublish();
```

Editing requires the password *before* the request; creating does not (see the
security notes below).

---

### Editing an existing title: `startEdit`

```jsx
const [doc, res] = await Promise.all([
  moviesApi.get(listEntry.tmdbId).catch(() => null),
  fetch(`${TMDB}/${listEntry.mediaType}/${listEntry.tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,external_ids,images`),
]);
```

**What this is:** `Promise.all` starts several asynchronous operations at once
and resolves when all of them finish — here the stored document and the TMDB
details load in parallel instead of one after the other. Note
`.catch(() => null)` on the first one only: if the DB fetch fails, editing
continues with empty links (you'd be re-publishing from scratch) rather than
aborting, because the Manage list rows are deliberately light.

Why the fetch at all? `GET /api/movies?all=1` uses a Mongo projection that
excludes the heavy arrays:

```js
const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
```

**What this is:** a *projection* tells MongoDB which fields to leave out of the
response. The Manage list only needs a title and an id to draw its rows, so
shipping hundreds of episode URLs for every row would be pure waste — the full
document is fetched on demand, either by EpisodePage/MovieDetails or right
here in `startEdit`.

Other details in this function:

- Optimistic UI first: it immediately builds a plausible `selectedResult` and
  an empty `fullDetails` from the list row, so the panel switches to edit mode
  instantly and fills in as data lands.
- The season count takes the **maximum** of three sources:

  ```jsx
  const totalSeasons = Math.max(
    tmb.number_of_seasons || 0,
    (fullDoc?.downloadLinks && fullDoc.downloadLinks[0]?.seasons?.length) || 0,
    1
  );
  ```

  TMDB may say 5 seasons while you've only published 3 (or the reverse — TMDB
  can lag behind a show you've added early). Showing the larger of the two
  keeps the preview's "Seasons" row honest in both directions.
- The links are deep-copied before going into state:

  ```jsx
  setDownloadLinks(fullDoc?.downloadLinks ? JSON.parse(JSON.stringify(fullDoc.downloadLinks)) : []);
  ```

  **What this is:** the `JSON.parse(JSON.stringify(x))` round trip is the
  low-effort way to clone a nested object with no shared references. Without
  it, `SeriesQualityEditor`'s immutable updates would be rebuilding objects
  that something else might still be pointing at; with it, edits in the panel
  can never leak back into any other copy of that data.

---

### Deleting: `handleDelete`

```jsx
const handleDelete = async (tmdbId) => {
  try {
    await moviesApi.remove(tmdbId);
    const updated = await moviesApi.list({ all: 1 });
    setPublishedList(updated.movies);
    if (editingTmdbId === tmdbId) handleUnselect();
  } catch (e) {
    ...
    if (e.message?.includes("Unauthorized") || e.message?.includes("Admin")) {
      setIsAdminUnlocked(false);
      moviesApi.clearAdminPassword();
    }
    alert(e.message || "Failed to delete movie.");
  }
};
```

Same shape as publish: do the write, **refetch** the list, then clean up UI
state — and if you deleted the very title you were editing, `handleUnselect()`
resets the whole left panel so you're not left editing a ghost. The 401 branch
is identical to publish's: lock the panel and clear the stored password. This
is the one place in these two files that still uses the browser's `alert()`.

---

### Admin authentication flow

The panel is protected by a single shared password held on the server, checked
in `backend/routes/movieRoutes.js`:

```js
const verifyAdmin = (req, res, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return res.status(500).json({ message: "ADMIN_PASSWORD is not configured on the server" });
  }
  const providedPass = req.headers["x-admin-password"];
  if (!providedPass || providedPass !== adminPass) {
    return res.status(401).json({ message: "Unauthorized: Invalid or missing admin password" });
  }
  next();
};
```

**What this is:** Express *middleware* — a function that runs before the route
handler and can short-circuit the request with a response. `next()` means "OK,
carry on to the handler". It's attached only to the dangerous routes:
`router.put("/:tmdbId", verifyAdmin, ...)` and
`router.delete("/:tmdbId", verifyAdmin, ...)`. `401 Unauthorized` is the HTTP
status code meaning "you didn't prove who you are".

#### Where the password lives on the client

In `frontend/src/api/moviesApi.js`:

```js
const ADMIN_KEY = "moviesmod_admin_pass";

getAdminPassword()      // sessionStorage.getItem(ADMIN_KEY) || ""
setAdminPassword(pass)  // sessionStorage.setItem / removeItem
clearAdminPassword()    // removeItem
isAdminUnlocked()       // Boolean(sessionStorage.getItem(ADMIN_KEY))
```

**What this is:** `sessionStorage` is a small per-tab key/value store in the
browser. Unlike `localStorage` it is wiped when the tab closes, which is why it
was chosen here: unlock the panel, close the tab, and you're locked again — no
"stay logged in forever" risk on a shared machine.

`verifyAdminPassword` is the check itself:

```js
async verifyAdminPassword(password) {
  const res = await fetch(`${API}/verify-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Invalid admin password");
  this.setAdminPassword(password);
  return true;
}
```

**What this is:** a *promise-based fetch* with `async/await` — `await` pauses
the function until the response arrives, and `throw` inside an `async` function
becomes a rejected promise the caller catches. Only after the server says
`success: true` does the password get stored. On any non-2xx, the stored
password is never touched.

On the server, `POST /api/movies/verify-admin` compares the posted password to
`process.env.ADMIN_PASSWORD` and returns 401 on a mismatch.

#### `requestAdminAccess` — the "unlock once, then do the thing" pattern

```jsx
const requestAdminAccess = (actionName, targetTitle, onSuccess) => {
  if (isAdminUnlocked) {
    onSuccess();
    return;
  }
  ...
  setAdminModalConfig({
    title: "Admin Password Required",
    desc: `Please enter your admin password to ${actionName} "${targetTitle}".`,
    onSuccess,
  });
  setAdminModalOpen(true);
};
```

This is the trick worth understanding: the sensitive action is passed in as a
**callback** (`onSuccess`) and stashed in state. If you're already unlocked, it
runs immediately with no modal. If not, the modal opens and — after a
successful password check — `handleAdminSubmit` runs the stashed callback:

```jsx
await moviesApi.verifyAdminPassword(adminInputPass.trim());
setIsAdminUnlocked(true);
setAdminModalOpen(false);
if (adminModalConfig.onSuccess) adminModalConfig.onSuccess();
```

So the flow "click Delete → type password → delete happens" needs no hidden
state about *which* row you meant; the intent travels with the modal. Every
dangerous button in the file goes through it:

```jsx
onClick={() => requestAdminAccess("edit",   p.title, () => { startEdit(p); setMode("add"); })}
onClick={() => requestAdminAccess("delete", p.title, () => handleDelete(p.tmdbId))}
```

The "Admin Lock" pill in the header is a special case — it calls
`requestAdminAccess("manage", "movie management", () => {})`, i.e. unlock me
with nothing to do afterwards.

#### Lock, and the unlocked pill

```jsx
const handleLockAdmin = () => {
  moviesApi.clearAdminPassword();
  setIsAdminUnlocked(false);
};
```

One thing to note: `isAdminUnlocked` is initialised lazily —

```jsx
const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => moviesApi.isAdminUnlocked());
```

**What this is:** a *lazy initialiser*. Passing a function to `useState` makes
React call it once, on the first render, instead of evaluating the argument on
every render. It doesn't matter much for a cheap check like this, but it's the
correct habit for anything expensive (parsing a big JSON blob, reading
localStorage in a loop).

#### The modal itself

The JSX shows a few standard modal techniques:

```jsx
<div className="am-modal-overlay" onClick={() => !adminModalLoading && setAdminModalOpen(false)}>
  <div className="am-modal-card" onClick={(e) => e.stopPropagation()}>
```

**What this is:** *event bubbling* — a click on the inner card also fires
handlers on its ancestors. `e.stopPropagation()` cuts that off, so clicking
inside the form doesn't count as clicking the dark backdrop and close your
dialog. The `!adminModalLoading &&` guard stops you dismissing the modal in the
middle of a verification. Also present: `autoFocus` on the password input, a
show/hide toggle that swaps the input between `type="password"` and
`type="text"` (`tabIndex={-1}` keeps the eye button out of the Tab order so
Enter still submits), a submit button disabled while loading or empty, and the
error string rendered inline above the buttons.

#### Honest limits of this auth model

Since you own this code, it's worth stating plainly what it does and doesn't
protect:

- The password is checked **server-side** for PUT/DELETE, so a visitor cannot
  edit or delete anything without knowing it. That part is real.
- But `POST /api/movies` (publishing a *new* title) has **no** `verifyAdmin`,
  and the panel reflects that (`handlePublish` only prompts when
  `editingTmdbId != null`). Anyone can add entries; only you can change or
  remove them.
- The password travels in a plain header on every edit/delete and sits in
  `sessionStorage`, where any script on the page (or a browser extension) could
  read it. There's also no rate limiting on `/verify-admin`, so it can be
  brute-forced. For a personal site behind no real traffic this is a
  reasonable trade-off; it is not the design you'd want on a multi-user or
  public-write site (that would be per-user accounts + hashed passwords +
  short-lived tokens).

---

### The two-panel layout

```jsx
<div className="am-page">
  <aside className="am-panel">            {/* LEFT: form */}
    ...
  </aside>
  <section className="am-preview-panel">  {/* RIGHT: live preview */}
    {!fullDetails ? (
      <div className="am-empty-preview"> ... "Select a movie to preview" ... </div>
    ) : (
      <>
        <div className="am-preview-badge"><i className="fa fa-eye" /> Live Preview</div>
        {isPublished && (<div className="am-published-note"> ... </div>)}
        <MoviePreview details={fullDetails} downloadLinks={downloadLinks} />
      </>
    )}
  </section>
</div>
```

The left `<aside>` is a state machine in JSX. In `mode === "manage"` it shows
the published list (with a client-side filter:
`p.title.toLowerCase().includes(manageQuery.trim().toLowerCase())`) — nothing
else. In `mode === "add"` it shows a progressive series of blocks, each gated
on the previous step:

1. the search box (always),
2. results — only `if (searchResults.length > 0 && !selectedResult)`,
3. the selected-title strip — only `if (selectedResult)`,
4. the whole link builder — only
   `if (selectedResult && fullDetails && !loadingDetails)`.

That gating is why the page never shows a half-ready form: you cannot add a
link before TMDB details have loaded, because the builder simply isn't
rendered yet. The search input also swaps its icon for a spinning
`fa-spinner fa-spin` while `searching` is true — that's the visible half of the
debounce.

On the right, `isPublished` (computed as
`publishedList.some(p => p.tmdbId === selectedResult?.id)`) warns you before
you create a duplicate. It's a warning only; the backend is the real guard,
returning `409 Conflict` ("Movie already exists") from `POST` — which surfaces
in the red `publishError` banner.

---

### Key takeaways

- **EpisodePage is a pure read view**: one `GET /api/movies/:tmdbId` request,
  guarded against stale responses with an `active` flag, and all selection
  (quality via `?q=`, season via the path) done in the URL so switching tabs
  never refetches and every tab is a shareable link.
- **String vs number is handled explicitly** in both files —
  `parseInt(searchParams.get("q") || "0", 10)` on the way in,
  `String(s.season) === String(seasonNum)` when matching seasons.
- **Debouncing the TMDB search** uses a `useRef` timer cleared at the top of
  the effect *and* in the returned cleanup, so at most one request per 450ms of
  silence; the empty-query branch resets results synchronously on purpose.
- **One `append_to_response=credits,external_ids,images` call** replaces four
  TMDB requests, and `Promise.all` fetches the DB document and TMDB details in
  parallel when editing.
- **`buildLabel` is the single source of truth** for quality labels, so the
  "Preview:" line and the stored label can never disagree.
- **Every array edit is immutable**: `[...arr, item]` to append, `map` to
  replace one element, `filter` to remove, then `.sort()` for ordering. This is
  what makes React re-render the right things and keeps `SeriesQualityEditor`'s
  upsert semantics (re-adding a season/episode updates it instead of
  duplicating).
- **The publish payload falls back three deep** (`tmdb.X || existingEntry?.X ||
  default`) and preserves `publishedAt` on edit, so a re-save can't degrade the
  public page or shuffle the homepage order.
- **The Manage list is intentionally light** (Mongo projection
  `-downloadLinks -seasonEpisodes -screenshots`); `startEdit` fetches the full
  document and deep-copies its links before editing.
- **Admin auth = password + `x-admin-password` header + 401s.** Unlocked state
  lives in `sessionStorage` (dies with the tab), `requestAdminAccess` defers the
  dangerous action as a callback until the modal succeeds, and any 401 locks
  the panel and clears the stored password so you get prompted again.
- **Known gaps to be aware of**: `POST /api/movies` requires no password (only
  edit/delete do), a network error on EpisodePage reads as "Series not found",
  and the preview hard-codes a few values (`format: "Mkv"`, subtitles, language)
  that the live page may not match exactly.
## 08. Styling & Assets

This section covers every CSS file in the frontend — 21 of them — plus the icon font,
the web fonts, and the handful of image assets. The files are:

- Global: `frontend/src/index.css`, `frontend/src/App.css`
- Pages: `frontend/src/pages/HomePage.css`, `frontend/src/pages/MovieDetails.css`,
  `frontend/src/pages/EpisodePage.css`, `frontend/src/pages/AddMovies.css`
- Components: `frontend/src/components/Navbar.css`, `Postcards.css`, `Sidebar.css`,
  `DownloadSection.css`, `MovieHeader.css`, `MovieInfoCard.css`, `SeriesInfo.css`,
  `Screenshots.css`, `RelatedPosts.css`, `Pagination.css`, `Social.css`, `Socialmini.css`,
  `Alert.css`, `Footer.css`, `CommentSection.css`

The mental model: **the look of this site is three layers stacked on top of each other.**
Layer 1 is Bootstrap's stylesheet (loaded from a CDN in `frontend/index.html`) which supplies
base typography and a few utility classes. Layer 2 is your own CSS, one small file per
component, which paints the dark theme on top. Layer 3 is Font Awesome, an icon *font*, used
for every small icon on the site. There is no CSS-in-JS, no Tailwind, no Sass, no CSS modules —
just plain `.css` files imported next to the component they style.

---

### The one-CSS-file-per-component convention

Every component owns a CSS file with the same base name and imports it on the first line:

```js
// frontend/src/components/Postcards.jsx
import "./Postcards.css";
import { Link } from "react-router-dom";
```

**What this is:** importing a `.css` file from JavaScript is not standard JavaScript — it is
something the build tool (Vite) understands. When Vite sees `import "./Postcards.css"`, it
does not try to run the CSS; it collects the file, and in development it injects it into the
page as a `<style>` tag. In a production build it concatenates *all* of them into one minified
`.css` file that gets linked from `index.html`.

Three consequences worth knowing:

- **The CSS is still global.** Even though the import lives inside one component, the rules are
  not scoped to it. If two files both defined `.heading`, the one loaded later would win for the
  whole site. This codebase avoids that problem by naming conventions rather than by tooling:
  each component prefixes its class names (`navi-` for the navbar, `movie-card-` for poster
  cards, `dl-` for downloads, `side-` for the sidebar, `am-` for the AddMovies admin page,
  `ep-` for the episode page, `imdbwp__` for the info card).
- **Import order decides ties.** Because everything ends up in one stylesheet, the order of
  imports in your JavaScript (which follows the order components are first imported) is what
  breaks a tie between two rules of equal strength. That is also why local rules beat Bootstrap:
  Bootstrap's `<link>` is written near the top of `<head>` in `frontend/index.html`, and your
  compiled CSS is injected after it, so on a conflict your file wins.
- **CSS is only loaded for what gets imported.** Since `frontend/src/App.jsx` lazy-loads the
  `MovieDetails`, `AddMovies` and `EpisodePage` pages, their CSS travels in the lazily-fetched
  chunk too. A visitor who never opens the admin page never downloads `AddMovies.css`.

#### `frontend/src/index.css` — the global reset

This file is imported... actually, it is **not imported anywhere** in the current code, which
means most of it is dead weight. Vite only bundles CSS that is imported from JavaScript or
linked from HTML, so `index.css` sits unused. Its rules are worth reading anyway because they
document the intended baseline, and because `frontend/src/App.css` is imported by `App.jsx` and
does the one job that matters (the dark background).

**What this is:** a "CSS reset" is a small set of rules that strips away the inconsistent
default styles browsers apply to elements, so every browser starts from the same blank slate.

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

- `box-sizing: border-box` is the important one: it makes an element's stated `width` include
  its padding and border. Without it, a card that is `width: 300px` with `padding: 12px` is
  really 324px wide, which wrecks grids. This is the single most useful line in any stylesheet,
  and Bootstrap's "reboot" already sets it globally — so the reset is redundant but harmless.
- `img { max-width: 100%; height: auto; display: block; }` stops images from overflowing their
  container and removes the mysterious gap under inline images.

Two more rules are genuinely nice ideas that would apply site-wide if the file were imported:

```css
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}
```

`prefers-reduced-motion` is a browser setting some users turn on to avoid animations; wrapping
the smooth-scrolling rule in it means those users get instant jumps instead. And the
`@media (max-width: 768px)` block drops the root font size from 16px to 14px on phones, which
scales every `rem`-sized bit of text down at once (used heavily in `AddMovies.css`).

#### `frontend/src/App.css` — the dark theme in three lines

```css
body{
    background: #18181B;
    color: #FFFFFF;
}
```

Imported once from `frontend/src/App.jsx`, this paints the whole page near-black with white
text. Every other component then layers slightly lighter panels on top of that base. Because
`color` is inherited, any text that does not set its own colour is white by default.

---

### The dark colour palette

Almost every colour in the project comes from a small family of grays plus a few accents. Many
of the hex values are literally Tailwind's "zinc" scale, a hint the design was generated by an
AI assistant that reached for Tailwind's default dark-mode palette even though this project has
no Tailwind.

| Colour | Used for |
|---|---|
| `#18181b` | page background (`App.css`), input backgrounds (`Navbar.css` search box, `Sidebar.css` search, `CommentSection.css` fields, `Screenshots.css` image placeholder) |
| `#27272a` | the standard "card" surface — navbar bar, movie cards, detail page panel, pagination bar, footer, tag chips, dropdown menus |
| `#3f3f46` | the standard border colour — card borders, input borders, dividers, download link chips |
| `#09090b` | the sidebar column (`Sidebar.css` `.left`) — deliberately one step darker than the cards so the column reads as a recessed gutter |
| `#171717` | breadcrumb strip background (`MovieHeader.css`) — a neutral gray, subtly different from the zinc grays around it |
| `#494949`, `#555555`, `#3a3a3a`, `#6b6666` | mid-grays: pagination buttons, sidebar block headings, sidebar search input, navbar tab dividers |
| `#e4e4e7`, `#d4d4d8`, `#a1a1aa`, `#a4a4a4` | text grays, brightest to dimmest — headings/near-white body, paragraph text, secondary/meta text |
| `#3b82f6` | blue accent — highlighted search terms, section-heading icons, tag chips on hover, input focus borders |
| `#14b8a6` / `#008080` / `#2dd4bf` | teal family — the whole admin page and the episode page are teal-accented, clearly a different "app" from the public site |
| `#2fb986`, `#319e67` | green — the top announcement bar and the comment submit button |
| `#d35151` / `#f97c7c` / `#ff0000` | red family — "Bollywood" navbar button, batch-download button, "Download" section heading |
| `#228b22` | green — "AnimeFlix" navbar button |
| `#009987` | teal-green — the single-episode download button |
| `#ffaa2c`, `#009de1` | the orange "4K" button and telegram-blue button |

Borders are uniformly hairline-thin (`1px solid #3f3f46`, or `0.8px` on movie cards and the
comment form), and corners are consistently rounded between 4px and 12px, which is what gives
the site its soft, card-like look.

---

### Bootstrap: CSS only, never the JavaScript

`frontend/index.html` loads Bootstrap 5.3.8's **stylesheet** from a CDN (section 02 covers the
link tag). Bootstrap's JavaScript is not loaded at all, and `frontend/package.json` has no
Bootstrap dependency — so what you get is the "reboot" baseline styles plus utility classes,
nothing more.

**What this is:** a *utility class* is a tiny single-purpose class in a framework's stylesheet,
like `mt-4` meaning "margin-top: 1.5rem". You sprinkle them in the markup instead of writing
CSS for one-off spacing.

The utilities actually used in the JSX:

| Class | Where | What it does |
|---|---|---|
| `my-5` | `Postcards.jsx` grid wrapper | 3rem margin above and below the poster grid |
| `mt-4` | `MovieDetails.jsx` warnings block | 1.5rem top margin |
| `d-flex` | `Alert.jsx`, `Social.jsx`, `Socialmini.jsx` | `display: flex` |
| `justify-content-center` / `align-items-center` | same three files | centre the flex children horizontally and vertically |
| `text-center` | `Alert.jsx` | centre the announcement text |
| `text-decoration-none` | `Postcards.jsx` card link | remove the link underline |
| `px-1` / `pe-1` | `Alert.jsx` link, `Social*.jsx` icons | 0.25rem padding-left / padding-right |
| `rounded-3`, `rounded-bottom-3` | `Alert.jsx`, `Pagination.jsx` | Bootstrap's rounded corners on the announcement bar and pagination bar's bottom edge |

A few subtleties:

- `text-decoration-none` on the poster card is redundant — `frontend/src/index.css` already
  declares `a { text-decoration: none }` (and that file is unused) and `Navbar.css` sets it on
  its own links. Harmless belt-and-braces.
- `d-flex` plus `justify-content-center align-items-center` in `Social.jsx` is doing work the
  component's own CSS does not: `Social.css` sets `display: flex` on `.social` but nothing
  centres it, so Bootstrap's utilities are what actually line the buttons up in the middle.
- **Class-name collisions, on purpose.** `Alert.jsx` writes `className="alert ..."` and
  `Pagination.jsx` writes `className="pagination page-item page-link"` — those are Bootstrap's
  own component class names. `Alert.css` and `Pagination.css` then restyle them (background,
  padding, hover). Bootstrap still contributes the underlying scaffolding: `.alert`'s
  `position: relative` (which the close button's absolute positioning depends on) and
  `.pagination`'s `display: flex`, which is why `Pagination.css` can simply add `gap: 6px`
  instead of laying the row out itself. `Pagination.jsx` renders plain `<button>` elements
  inside those Bootstrap-named list items — the accessibility markup (aria-labels,
  `aria-current`) is hand-written, not Bootstrap's.

The practical effect of shipping no Bootstrap JS: every interactive behaviour is hand-rolled.
The navbar's dropdown is `display: none` in CSS and appears only when React adds a class:

```css
/* frontend/src/components/Navbar.css */
.dropdown-menu {
  display: none;
  position: absolute;
  ...
}
.navi-btn.active .dropdown-menu {
  display: block;
}
```

`Navbar.jsx` tracks `activeDropdown` in state and toggles the `active` class; the hamburger menu
is the same trick with `.navigation-tab.active`. If Bootstrap's JS were loaded it would fight
this hand-rolled version, which is presumably why it was removed.

---

### Font Awesome 4.7 — icons as a font

`frontend/index.html` loads Font Awesome **4.7.0** from cdnjs. Every icon on the site is then
written as an empty `<i>` tag with two classes:

```jsx
<i className="fa fa-search" aria-hidden="true" />
<i className="fa fa-caret-down"></i>
<i className="fa fa-telegram pe-1" aria-hidden="true"></i>
```

**What this is:** an *icon font* is a font file whose "letters" are pictures. The `fa` class
sets `font-family: FontAwesome` on the element, and `fa-search` sets a CSS rule that inserts
the magnifying-glass glyph via a `::before` pseudo-element. No image file is downloaded per
icon — one font file carries them all.

Why this is convenient here:

- Because icons are text, they inherit the surrounding `color`. `Screenshots.css` colours all
  its heading icons blue with two lines, no images involved:

  ```css
  .section-heading i {
    color: #3b82f6;
    margin-right: 6px;
  }
  ```

- They scale with `font-size`, which is how `MovieHeader.css` shrinks the calendar and comment
  icons inside the 13px meta row, and how `AddMovies.css` makes the empty-state icon huge
  (`.am-empty-icon { font-size: 3.5rem; opacity: 0.35; }`).
- `aria-hidden="true"` on most of them tells screen readers to skip the icon, since it is
  decorative and the neighbouring text carries the meaning.

Icons in use include `fa-search`, `fa-bars` / `fa-times` (hamburger open/closed), `fa-caret-down`
(dropdown arrow, rotated 180° when open — see below), `fa-home` (breadcrumb), `fa-calendar`,
`fa-comments`, `fa-tags`, `fa-image`, `fa-film`, `fa-telegram`, `fa-lock` / `fa-unlock-alt`,
`fa-plus`, `fa-edit`.

One caveat: 4.7.0 is a very old release (the project is now on version 6). It works fine, but
newer icon names from documentation will silently render as an empty box.

---

### Google Fonts: Roboto weights, and why the URL lists so many

`frontend/index.html` loads Roboto with `ital,wght@0,400;0,500;0,600;0,700;0,800;1,400` — five
upright weights plus one italic (section 02 walks the URL apart). The CSS files then reference
it constantly, sometimes lowercase (`font-family: roboto, sans-serif` in `Navbar.css`,
`Alert.css`, `Footer.css`) and sometimes quoted (`"Roboto", sans-serif` in `DownloadSection.css`,
`Sidebar.css`, `SeriesInfo.css`). Font family names are case-insensitive, so both spellings work.

The reason the request enumerates weights rather than asking for "all of Roboto" is that each
weight is a genuinely separate font file. The CSS here uses:

- 400 regular — paragraphs (`MovieDetails.css` `.thecontent`, `SeriesInfo.css`),
- 500 medium — sidebar headings, pagination buttons, small labels,
- 600/700 semibold and bold — section headings, movie titles (`font-weight: 700` on
  `.movie-card-title`), the admin panel titles,
- 800 extrabold — the footer copyright links.

Two other font facts worth knowing:

- **Subsets.** Google does not serve Roboto as one file. It serves it as several *subsets*
  (latin, latin-ext, cyrillic, greek, vietnamese...), each annotated with a `unicode-range` in
  the CSS it returns. The browser downloads only the subset that actually contains characters
  used on the page — for an English-language site that is the latin subset, a few tens of
  kilobytes instead of the whole family. That splitting is invisible to you but is the reason
  the font is cheap to load.
- **The admin page pulls a second font.** The very first line of `frontend/src/pages/AddMovies.css`
  is `@import url("...family=Inter:wght@400;500;600;700&display=swap")`. **What this is:** a CSS
  `@import` makes the browser fetch another stylesheet before it can finish using this one,
  which is slower than a `<link>` in HTML. It is fine for an admin-only page (and lazy-loading
  means it only happens after you navigate there), but if Inter were needed site-wide the import
  should move to `index.html` next to Roboto.

A few places deliberately use *system* fonts for flavour: the navbar's red/green buttons use
`"Times New Roman", Times, serif`, the social button rows use `Arial, Helvetica, sans-serif`, and
the IMDB rating star uses `Tahoma`. Those need no download at all.

---

### The responsive movie grid: 2 / 3 / 4 / 5 columns

`frontend/src/components/Postcards.css` builds the home page poster grid with CSS Grid and
grows the column count as the screen gets wider:

```css
.grid-body {
  ...
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
@media (min-width: 480px)  { .grid-body { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 768px)  { .grid-body { grid-template-columns: repeat(4, 1fr); } }
@media (min-width: 1024px) { .grid-body { grid-template-columns: repeat(5, 1fr); } }
```

**What this is:** a *media query* is a rule that only applies when the browser matches a
condition, usually a screen width. `@media (min-width: ...)` is the "mobile-first" flavour —
write the phone layout as the default, then add rules for bigger screens.

Notes on how it behaves:

- `repeat(2, 1fr)` means "two equal columns"; `1fr` is one *fraction* of the leftover space, so
  columns always split the row evenly no matter how wide it is.
- The breakpoints (480 / 768 / 1024) mean a phone sees 2 posters per row, a tablet 3 or 4, and
  a desktop 5 — matching how movie-poster sites like this one lay out.
- Note the direction difference across the project: `Postcards.css` and `RelatedPosts.css` use
  `min-width` (mobile-first), while `Navbar.css`, `MovieDetails.css`, `Sidebar.css` and
  `EpisodePage.css` use `max-width` (desktop-first). Both work; they just read in opposite
  directions, and a rule can be accidentally overridden if you mix them on the same property.
- The smallest screens tighten the gutters: `@media (max-width: 480px) { .grid-body { padding: 0 10px; gap: 8px; } }`.
- `RelatedPosts.css` reuses the *same* `.movie-card` markup in its own grid, fixed at 4 columns
  and dropping to 2 under 640px:

  ```css
  .related-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  @media (max-width: 640px) { .related-cards { grid-template-columns: repeat(2, 1fr); } }
  ```

  (Bootstrap's 12-column grid is not used anywhere for layout — every grid and flex layout on
  the site is hand-written.)

---

### `object-fit: cover` and the fixed-height image wrap

Posters arrive at many different aspect ratios (TMDB gives you whatever the uploader used), but
the grid needs every card to be the same height. The trick is a fixed-height box plus
`object-fit`:

```css
/* frontend/src/components/Postcards.css */
.movie-card-image-wrap {
  position: relative;
  width: 100%;
  height: 300px;      /* every poster area is exactly this tall */
  overflow: hidden;
}
.movie-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  ...
}
```

**What this is:** `object-fit: cover` tells an image to fill its box completely, scaling up
until both dimensions are covered and cropping whatever sticks out — like `background-size:
cover` but for `<img>`. The default behaviour instead squashes the image to the box, which
distorts posters.

- `height: 300px` on the wrapper is what makes all rows line up. The card is a flex column
  (`display: flex; flex-direction: column`) with the title block set to `flex-grow: 1`, so the
  *text* area absorbs any difference in title length and the image stays a constant 300px.
- `object-position: center top` decides *which part* is cropped: keep the top of the poster
  (where the title art and faces usually are) and trim the bottom.
- `overflow: hidden` clips anything that would otherwise spill out, and pairs with the card's
  `border-radius: 10px` so the image's own corners are squared off inside a rounded card.
- The `<img>` in `Postcards.jsx` also carries `width="300" height="450"` attributes and
  `loading="lazy"`; the attributes reserve the right amount of space before the file arrives so
  the page does not jump as posters load, and lazy loading defers off-screen posters until the
  user scrolls near them.
- The same `object-fit: cover` idea appears at three other sizes: sidebar thumbnails
  (`Sidebar.css`: `width: 50px; height: 65px`), the admin page's 42x60 search-result thumbs and
  38x54 selected-strip thumb, and — in the admin preview only — tall screenshots are clamped
  with `.am-preview-content .screenshots img { max-height: 400px; object-fit: cover; }` so a
  portrait screenshot does not stretch the preview panel.

---

### Hover states and transitions

Almost every clickable thing on the site has a hover effect, and they all follow one of four
patterns.

**Brightness on the poster.** Rather than swapping the image, the CSS dims it:

```css
.movie-card-img { transition: filter 0.2s ease; }
.movie-card-img:hover { filter: brightness(85%); }
```

**What this is:** `transition` tells the browser to animate between a property's old and new
value over a set time instead of snapping. `0.2s ease` means 200 milliseconds with a gentle
slow-in/slow-out curve. `filter: brightness(85%)` multiplies the pixel brightness, i.e. a
subtle darkening that reads as "this is pressed".

**Colour changes.** Titles, links, tags and buttons change colour on hover, with the transition
declared on the resting state so it animates both ways — e.g. the tag chips in the sidebar:

```css
.tag-chip {
  color: #a1a1aa;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.tag-chip:hover { background: #3b82f6; border-color: #3b82f6; color: #ffffff; }
```

That blue "fill on hover" is repeated for sidebar popular-post links and the `not-found` /
search-note links, making blue the site's interactive colour.

**Opacity.** Download buttons (`DownloadSection.css`) fade to `opacity: 0.9` and screenshots to
`opacity: 0.9` on hover — cheaper than repainting colours and it keeps the button's own colour.

**A slow 1-second fade on the bigger chrome.** Several files use an unusually long
`transition: 1s` — breadcrumb links and the comment-count link (`MovieHeader.css`), the gray
social buttons flipping to white-on-black (`Social.css`), the footer links turning green
(`Footer.css`), the announcement-bar link, and every pagination button:

```css
.pagination-nav .page-link {
  transition: background-color 1s ease, border-color 1s ease, color 1s ease;
}
```

That is a design choice borrowed from the old WordPress original this site mimics — pages feel
"soft" — but a 1s hover delay is long enough that users may not register the change at all.
The 0.15–0.3s timings used elsewhere in the same codebase are the more conventional choice.

One more animated touch: the dropdown arrow in the navbar rotates when its menu is open.

```css
.navi-btn button i { transition: transform 0.2s ease; }
.navi-btn.active > button i { transform: rotate(180deg); }
```

---

### `frontend/src/components/Navbar.css`

The navbar is a card (`background: #27272a`) capped at the site's 1170px content width
(`max-width: 1170px; margin-left: auto; margin-right: auto` — that auto-margin centring trick
is used by nearly every top-level block in the project). Its structure:

- **Top row**: logo image (`width: 248px`), a search box, and two coloured link buttons.
- **Search box** — a text input with a button-looking icon glued to its right edge. The icon is
  absolutely positioned inside a relatively-positioned wrapper (see the positioning section
  below) and the input gets `padding-right: 45px` so typed text cannot run underneath it.
  `outline: none` removes the browser's focus ring — the input still shows focus via the
  caret, but the visible ring is gone, which is a small accessibility loss.
- **Buttons** — `.btn-a { background: #d35151; }` and `.btn-b { background: #228b22; }`, both
  120x35px, `display: flex; align-items: center; justify-content: center` so the label centres
  vertically without line-height hacks.
- **Tab strip** — `.navigation-tab` is a flex row on a `#494949` bar with rounded bottom
  corners. Each `.navi-btn` is `position: relative` (so its dropdown can anchor to it) and the
  separators are right-hand borders, with the last item's border removed:

  ```css
  .navi-btn > a, .navi-btn > button { border-right: 1px solid #6b6666 !important; ... }
  .navi-btn:last-child > a, .navi-btn:last-child > button { border-right: none !important; }
  ```

  The `!important` is there to beat Bootstrap's own `border`/`border-radius` on buttons; it
  works but is a code smell — a more specific selector would do.
- **Dropdowns** — `display: none`, shown by the `.active` class, absolutely positioned at
  `top: 100%` (immediately below the tab), `z-index: 1000` to float above page content, plus
  `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)` to lift it off the page.
- **Mobile (≤865px)** — the top row becomes a vertical stack, the hamburger `.menu-toggle`
  button appears (`display: block`), the tab strip becomes a vertical column hidden until
  `.navigation-tab.active` is set, and the dropdown switches to `position: static` so it pushes
  content down instead of floating. At ≤480px the two brand buttons shrink to 80px wide with
  12px text.

---

### `frontend/src/components/Sidebar.css`

`.left` is the right-hand column of the detail page (named "left" after the original
WordPress layout, where the sidebar sat on the left): a fixed `width: 343px`, `flex-shrink: 0`
so the flexible article column cannot squeeze it, and the darkest background in the project
(`#09090b`). At ≤1024px it goes `width: 100%` and stacks under the article.

Inside it, every block repeats the same "panel" recipe — a `.side-block` with `background:
#18181b`, a 1px `#27272a` border, `border-radius: 6px` and `overflow: hidden` (which clips the
children to the rounded corners), topped by a `.side-heading` in dim gray `#555555`. Two details
worth copying:

- The search row is an input plus button glued together with flexbox:

  ```css
  .search-form-row { display: flex; align-items: stretch; }
  .search-form-row input { flex: 1; min-width: 0; ... }
  .search-btn { ... flex-shrink: 0; }
  ```

  `align-items: stretch` makes both children the same height; `flex: 1` on the input and
  `min-width: 0` (which allows a flex item to shrink below its content's width) let the input
  take all remaining room while the button keeps its natural size.
- The popular-posts list uses `.popular-item { display: flex; gap: 10px }` with a 50x65
  `object-fit: cover` thumbnail, and removes the divider from the last row with
  `.popular-item:last-child { border-bottom: none; }` — the standard way to avoid a stray line
  at the bottom of a list.

---

### `frontend/src/pages/HomePage.css`

The smallest page file — just the gray "showing N results" note and the blue highlighted
match:

```css
.search-results-note {
  margin: 20px auto 0;
  max-width: 1170px;
  width: 100%;
  padding: 0 30px;
  color: #a1a1aa;
  font-size: 14px;
}
.search-results-note strong { color: #3b82f6; }
```

`margin: 20px auto 0` centres the note horizontally inside its container (the same auto-margin
trick). `HomePage.jsx` renders this note above the grid when the URL has a `?q=`, `?lang=`,
`?type=` or `?tag=` filter, with the filter value wrapped in `<strong>` so it lights up blue.

---

### `frontend/src/pages/MovieDetails.css`

This file owns the detail page's two-column skeleton — and the layout is entirely in the CSS,
not in Bootstrap:

```css
.detail {
  margin: 30px auto;
  width: 100%;
  max-width: 1170px;
  background-color: #27272a;
  padding: 25px;
  display: flex;          /* article + sidebar side by side */
  gap: 30px;
  align-items: flex-start;
}
.right { flex: 1; min-width: 0; }
```

- `.detail` is the panel: centred, 1170px max, on the standard card colour. `align-items:
  flex-start` stops the shorter column from being stretched to the taller one's height.
- `.right` is the article column. `flex: 1` means "take all leftover space" and `min-width: 0`
  lets long words/URLs wrap instead of forcing the column wider.
- `.thecontent p` styles the description paragraphs: `#d4d4d8` (dimmer than pure white so long
  text is not glaring), `line-height: 1.8` (generous spacing for readability) and 15px text.
- The "not found" state reuses `.detail` but stretches it with `.not-found-wrap {
  align-items: stretch }` so the message box fills the column; its link is the blue accent.
- Responsive: at ≤1024px `flex-direction: column` stacks the article above the sidebar (and the
  sidebar goes full width via its own media query); at ≤640px the panel padding drops from 25px
  to 15px.

---

### `frontend/src/components/MovieHeader.css`

Three pieces: the breadcrumb, the title, and the meta row.

```css
.breadcrumb-row {
  width: fit-content;   /* shrink-wrap to the crumbs instead of filling the row */
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  ...
  background-color: #171717; padding: 10px;
}
.breadcrumb-row a { color: #808080; transition: 1s; }
.breadcrumb-row a:hover { color: #ffffff; }
```

**What this is:** `width: fit-content` makes a block element only as wide as its content needs,
so the gray breadcrumb pill hugs the text rather than stretching edge to edge.

`.post-title` is a 22px, weight-500 white heading. `.post-meta` is a `flex-wrap: wrap` row of
13px gray facts (rating, upload date, comment count) with `gap: 18px` for spacing and `.post-meta
i { margin-right: 4px }` nudging each Font Awesome icon off its label. `.comments-a` turns green
(`#319e68`) on hover after a 1s transition. Note that two classes referenced in
`MovieHeader.jsx` — `cat-badge` and `upload-time` — have **no rules anywhere** (see the dead
classes list below).

---

### `frontend/src/components/MovieInfoCard.css`

The IMDB-style info card is a direct port of a WordPress plugin's stylesheet, which explains
two unusual things about it: the `imdbwp` / `imdbwp__thing` class naming (**What this is:**
"BEM" naming — `block`, `block__element`, `block--modifier` — a convention that keeps a large
component's classes collision-free), and the fact that it uses old-school `float` layout:

```css
.imdbwp.imdbwp--dark { background-color: #222; ... }
.imdbwp__thumb { float: left; width: 175px; margin-right: 20px; }
.imdbwp__content { margin-left: 195px; }
```

The poster is floated left and the text column is pushed right by a fixed 195px margin. The
outer card also has a decorative double shadow — `box-shadow: 0 1px 4px rgba(0,0,0,0.3), inset
0 0 40px rgba(0,0,0,0.1)` — a drop shadow plus an *inset* shadow that darkens the card's edges.

The rating star is an image loaded from the old site's domain:

```css
.imdbwp__star {
  background: url("https://moviesmod.zone/wp-content/plugins/imdb-for-wordpress-updated/assets/img/imdb-star.png")
    no-repeat center;
  color: #222; font-weight: 700; text-align: center; ...
}
```

The numeric rating is written *on top of* the star image (the text is dark `#222`, the star is
yellow). Because the image lives on an external WordPress domain, if that URL ever breaks the
rating number keeps working but the star disappears — worth knowing if the card ever looks
wrong. The `--dark` modifier is the only variant, so `background-color: #222` could just as
well live on `.imdbwp`.

---

### `frontend/src/components/SeriesInfo.css`

Typography-only file for the "storyline / episode info" block. Everything is scoped under
`.series-info-container` so its `h2`/`h3`/`ul`/`li`/`p`/`strong` rules cannot leak into the rest
of the page:

```css
.series-info-container h3 { font-size: 18px; margin-top: 15px; margin-bottom: 10px; font-weight: 700; }
.series-info-container ul { list-style-type: disc; padding-left: 25px; }
.series-info-container li strong { color: #ffffff; font-weight: 600; }
.series-info-container p { color: #d4d4d8; line-height: 1.6; font-size: 14px; }
```

The `strong` rule is the interesting one: inside bullet lists the labels ("Language:", "Quality:")
are wrapped in `<strong>` and forced to bright white so they stand out against the `#d4d4d8`
body text — emphasis by colour, not by weight alone.

---

### `frontend/src/components/Screenshots.css`

Two jobs. The section heading (white, 18px, semibold, with a blue icon) and the screenshot
stack:

```css
.screenshots { display: flex; flex-direction: column; gap: 10px; margin: 14px 0; }
.screenshots img {
  width: 100%; border-radius: 6px; border: 1px solid #27272a;
  background: #18181b; transition: opacity 0.3s ease;
}
.screenshots img:hover { opacity: 0.9; }
```

Screenshots are stacked full-width rather than in a grid (they are tall, detailed captures, and
shrinking them would make them unreadable). `background: #18181b` shows as a dark placeholder
while each image streams in, and the border + radius frame them like the cards. `Screenshots.jsx`
removes any image that fails to load, so a dead URL leaves no broken-image icon.

---

### `frontend/src/components/DownloadSection.css`

This file does double duty: it is the download area on the public detail page *and* it is
reused by the admin preview panel (`AddMovies.jsx` renders the same markup to show what the
published page will look like), which is why those classes are kept generic.

- `.download-section-heading { color: #ff0000; ... }` — the loud red "Download Links" heading,
  deliberately the most eye-catching thing on the page.
- `.download-hr` — a centred 300px-wide horizontal rule used as a section separator.
- The buttons: `.dl-btn` is a block-level, 12px-padded rounded link, and the colour variants
  pick the flavour — `.dl-single { background: #009987 }` for a single episode, `.dl-batch {
  background: #f97c7c }` for a batch/zip. Inside `.download-links` the same button is flipped
  to `display: inline-block; margin: 4px 6px` so several quality buttons sit side by side and
  wrap onto new lines naturally.
- Colour helper classes used by the download-group text formatter in both `DownloadSection.jsx`
  and `AddMovies.jsx`:

  ```css
  .text-teal { color: rgb(0, 128, 128); }
  .text-red  { color: rgb(255, 0, 0); }
  .text-blue { color: rgb(51, 102, 255); }
  ```

  (These are your own classes, not Bootstrap's `text-*` utilities — Bootstrap's are
  `text-primary`, `text-danger`, etc., so there is no collision.)
- `.alert-dl` plus `.alert-dl-danger | -success | -warning | -info` are the four notice boxes at
  the bottom of the detail page (VPN warning, "click the button", broken links, comment
  prompt). Each is a solid pastel-ish background with a 1px border in a lighter tint, and the
  `-danger`/`-success`/`-warning`/`-info` suffix naming is borrowed from Bootstrap's alert
  variants even though these are hand-rolled.

---

### `frontend/src/components/Pagination.css`

Restyles Bootstrap's pagination class names onto your own `<button>`s:

```css
.pagination-nav { margin: 30px auto; max-width: 1170px; background-color: #27272a; padding: 20px; }
.pagination-nav .page-link {
  background-color: #494949; border-color: #494949; color: #ffffff;
  font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 8px;
  transition: background-color 1s ease, border-color 1s ease, color 1s ease;
}
.pagination-nav .page-item.active .page-link { background-color: #000000; }
.pagination-nav .page-item.disabled .page-link { color: #8a8a8a; pointer-events: none; }
```

- The two-level selectors (`.pagination-nav .page-link`) are needed to beat Bootstrap's own
  `.page-link` rules, which is the standard way to skin a Bootstrap component without editing it.
- `pointer-events: none` is the neat part of the disabled state: the "..." ellipsis and the
  PREVIOUS/NEXT buttons at the ends are still rendered, but clicks pass through them entirely.
- The `<ul class="pagination">` is Bootstrap's flexbox list; this file only adds `gap: 6px`.
- Responsive (≤865px): the bar's padding shrinks, and `.pagination { flex-wrap: wrap;
  justify-content: center }` lets a long page list wrap into centred rows instead of
  overflowing the phone screen.

---

### `frontend/src/components/Social.css` and `Socialmini.css` — identical twins

These two files are **byte-for-byte duplicates** of each other (a full-width button row for the
home page and a smaller one for the detail page). Both define `.social`, `.btn-telegram`,
`.btn-4k` and `.btn-social` with the same values:

```css
.btn-telegram { background: #009de1; border: 2px outset #0088cc; color: white; }
.btn-4k       { background: #ffaa2c; border: 2px outset #edba26; color: black; }
.btn-social   { background-color: #555555; border: 1px solid white; transition: 1s; }
.btn-social:hover { background: white; color: black; }
```

Because CSS is global, having the file twice is harmless — the second copy simply wins with
identical rules. But it is duplicated code: if you change the telegram blue in one file the
other stays behind. This is the clearest candidate in the project for a cleanup (delete one
file and import the same one from both components).

`border: 2px outset` is a legacy 3D bevel style that gives the telegram and 4K buttons a raised
look; everything else on the site uses flat colours.

---

### `frontend/src/components/Alert.css`

The dismissible green announcement bar at the top of the home page:

```css
.alert {
  margin-left: auto; margin-right: auto;
  max-width: 1065px; width: 100%;
  background: #2fb986; min-height: 42px;
  color: black; font-family: roboto, sans-serif;
  font-size: 16px; font-weight: bold;
  position: relative; text-align: center;
}
.alert-x { border: none; background: none; color: white;
           position: absolute; right: 15px; ... }
```

Two things to notice:

- `position: relative` on the bar and `position: absolute; right: 15px` on the × button is the
  whole trick for putting the close icon in the corner without disturbing the centred text.
  `position: relative` does not move the bar; it just makes it the reference box that the
  button's absolute coordinates are measured from.
- The `max-width: 1065px` is slightly narrower than the site's 1170px content width — the bar
  sits inset from the edges.
- Because `Alert.jsx` also uses Bootstrap's `.alert` class, Bootstrap's `margin-bottom: 1rem`
  and `border: 1px solid transparent` still apply here; this file overrides the padding
  (`padding: 0`) and adds `margin-top: 30px`.

---

### `frontend/src/components/Footer.css`

The simplest file: a 75px-tall `#27272a` strip, flex-centred, holding a row of link texts
separated by literal `&#x7C;` (`|`) characters typed into the JSX. The links are
`font-weight: 800` gray `#99a1a3` and turn green `#2fb986` on hover after a 1s transition.
All the `href=""` values in `Footer.jsx` are empty, so the links do not go anywhere yet.

---

### `frontend/src/components/CommentSection.css`

A bordered form panel. Note that `CommentSection.jsx` renders `className="comment-form"` with a
`0.8px solid #3f3f46` border and transparent dark inputs:

```css
.comment-form textarea, .comment-form input {
  width: 100%; margin-top: 6px;
  background: #18181b; border: none; color: #e4e4e7; padding: 10px;
}
.comment-form textarea:focus, .comment-form input:focus {
  outline: none; border-color: #3b82f6;
}
```

The `:focus` rule sets `border-color` but the inputs have `border: none`, so the blue focus
ring never appears — the visible feedback is only the text caret. (In `AddMovies.css` the same
pattern is done properly with a 1px border plus a `box-shadow` glow.)

`.check-label` uses `display: flex !important; align-items: center; gap: 8px` to line the
checkbox up with its (long) label text, and `!important` because Bootstrap's reboot gives
labels their own display value. `.comment-btn` is a green `#319e67` button with black text that
inverts to gray/white on hover. The form itself does nothing yet — `onSubmit={(e) =>
e.preventDefault()}` in the JSX stops the page reloading, and no comment is stored.

Also note the dead classes here: `comment-section`, `form-row` and `form-field` are in the JSX
but styled nowhere (see below), so the two name/email inputs are stacked by accident of the
browser's default block behaviour rather than by a grid.

---

### `frontend/src/pages/EpisodePage.css`

The season/episode page is deliberately simpler and *teal*-accented, visually separating it from
the blue/red public site. Highlights:

```css
.ep-quality-tab { padding: 6px 12px; border: 1px solid #27272a; border-radius: 999px; ... }
.ep-quality-tab--active { background: #14b8a6; color: #08181a; border-color: #14b8a6; font-weight: 700; }
```

- `border-radius: 999px` is the standard way to make a fully-rounded "pill" button.
- The `--active` modifier (BEM again) is what marks the currently-selected quality tab.
- `.ep-list` / `.ep-row` are a flex column of centred rows, each holding an episode number and
  its `dl-btn dl-single` download link (reused from `DownloadSection.css`).
- Links are teal `#14b8a6`; the breadcrumb separators are dim `#52525b`.
- The page is a narrower 900px column (`max-width: 900px; margin: 25px auto`), since it has no
  sidebar.

---

### `frontend/src/pages/AddMovies.css` — the admin workbench

At ~1200 lines this is by far the biggest stylesheet in the project, and the only one with
section-banner comments. Everything is prefixed `am-` so it cannot collide with the public
site's classes. Its palette is a darker subset of the site's (`#0d0d0f` page, `#111113` panel,
`#18181b` inputs, `#27272a` borders) with a **teal** accent (`#008080` for focus rings and
icons, `#2dd4bf` for text on dark teal chips).

#### The two-panel layout and sticky sidebar

```css
.am-page { display: flex; min-height: calc(100vh - 60px); background: #0d0d0f; ... }
.am-panel {
  width: 380px; background: #111113; border-right: 1px solid #222228;
  display: flex; flex-direction: column; height: 100vh;
  position: sticky; top: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #2a2a35 transparent;
}
```

- `calc(100vh - 60px)` (**What this is:** `calc()` lets CSS do arithmetic between units) makes
  the page exactly viewport-height minus the navbar.
- `position: sticky; top: 0` keeps the 380px left panel pinned while the right preview panel
  scrolls — a *sticky* element scrolls normally until it hits the offset you name, then stays
  put. Combined with `height: 100vh; overflow-y: auto`, the tool panel is its own scrolling
  region.
- The two `scrollbar-*` properties (plus the `::-webkit-scrollbar` rules just below them) make
  the panel's scrollbar a thin 4px dark bar instead of the OS default — Firefox uses the
  standard properties, Chrome/Safari need the pseudo-element versions, which is why both are
  written.

#### The form grid

The add-link form is not a table or Bootstrap grid — it is nested flexbox:

```css
.am-new-link-form { display: flex; flex-direction: column; gap: 12px; ... }
.am-form-row { display: flex; gap: 10px; }
.am-form-group { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
.am-form-group--full { flex: unset; width: 100%; }
```

A column of rows; each row splits its fields evenly (`flex: 1`), and `--full` opts a field out
so it spans the whole row. Labels are 0.7rem uppercase gray with `letter-spacing: 0.04em`, the
classic "small caps" admin-label look. The season and episode editors reuse the same system with
fixed/flexible ratios, e.g. `.am-season-form-row .am-season-num { flex: 0 0 70px; }` (a number
box pinned at 70px) beside `.am-season-url { flex: 1 1 0; }` (the URL takes the rest).

Two input details worth stealing:

```css
.am-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg ... %3E");
  background-position: right 10px center;
}
```

`appearance: none` removes the browser's native dropdown arrow, and an inline SVG —
**What this is:** a *data URI*, a whole file encoded as text inside the CSS, so no extra
request is made — supplies a small gray triangle as the replacement arrow.

```css
.epi-input::-webkit-inner-spin-button,
.epi-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.epi-input[type=number] { -moz-appearance: textfield; }
```

This hides the up/down spinner arrows on number inputs (Chrome needs the `::-webkit` rules,
Firefox the `-moz` one) so episode numbers look like plain text fields.

Focus feedback is done properly here, unlike the comment form:

```css
.am-input:focus, .am-select:focus { border-color: #008080; box-shadow: 0 0 0 2px rgba(0,128,128,0.12); }
```

A 2px teal glow via `box-shadow` (which does not affect layout, unlike a border change) plus the
border itself turning teal.

#### Chips, pills and the coloured tag system

Status is colour-coded with tiny rounded chips: `.am-chip-res` (teal on `#1e3a3a`), the quality
chip (violet on `#2d1e3a`), `.am-chip-urls` green when a URL exists and red via
`.am-chip-urls--none` when it does not, plus `.am-tag-type/-genre/-year/-rating/-published` in
the search results. Each is the same recipe — `font-size: 0.6-0.7rem; font-weight: 700;
padding: 2px 6px; border-radius: 99px` with a dark tinted background. Long titles are truncated
with the three-property ellipsis idiom:

```css
.am-movie-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

#### The admin password modal

```css
.am-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  z-index: 99999;
  animation: amFadeIn 0.2s ease-out;
}
.am-modal-card { background: #141417; ... width: 440px; animation: amScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
```

**What this is:** a *modal* is a dialog that sits on top of the page and blocks it until you
deal with it. Building one takes exactly these pieces: a `position: fixed` backdrop covering
the viewport (`inset: 0` is shorthand for top/right/bottom/left all zero), a high `z-index` so
it floats above everything (the navbar dropdown uses 1000; this uses 99999 to beat it), flexbox
centring for the card, and `backdrop-filter: blur(6px)` to blur whatever is behind the dark
tint (`-webkit-` prefix for Safari). The two `@keyframes` animations — `amFadeIn` for the
backdrop and `amScaleUp` (a 0.95 → 1 scale with a springy `cubic-bezier` curve) for the card —
give it the pop-in.

**What this is:** `@keyframes` defines a named animation by listing the CSS values at points
during the animation (`from`/`to`, or percentages); an element plays it via the `animation`
property. `AddMovies.css` has three: `amFadeIn`, `amScaleUp`, and `am-fade-in` (opacity 0 +
5px upward drift), the last reused as the entrance for the selected-movie strip, link chips,
success banner and loading row — a cheap way to make state changes feel smooth.

Interaction is wired in JSX, not CSS: clicking the overlay closes it
(`onClick={() => !adminModalLoading && setAdminModalOpen(false)}`) while the card calls
`e.stopPropagation()` so clicking inside does not. The password field's show/hide toggle is
`.am-pass-toggle-btn { position: absolute; right: 10px; }` inside
`.am-pass-input-box { position: relative }`, with `padding-right: 42px !important` on the input
so the typed password never runs under the eye icon.

#### Buttons, success states and responsive rules

`.am-btn` is the shared base (inline-flex, centred, `gap: 7px`, `transition: all 0.2s`), with
`.am-btn-add` (outline teal), `.am-btn-back` (gray) and the primary action:

```css
.am-btn-publish {
  flex: 1; background: linear-gradient(135deg, #005f5f, #008080);
  box-shadow: 0 3px 14px rgba(0, 128, 128, 0.28);
}
.am-btn-publish:not(:disabled):hover {
  background: linear-gradient(135deg, #008080, #00aaaa);
  transform: translateY(-1px);
}
```

A diagonal gradient plus a coloured glow shadow, and on hover the button lightens and lifts
1px. `:not(:disabled)` keeps the effect off while the button is submitting, and
`.am-btn:disabled { opacity: 0.45; cursor: not-allowed; }` shows the disabled state. The
"already published" variant uses `!important` (`.am-btn-published { background: linear-gradient(...)
!important }`) to overpower the publish button's gradient.

At ≤960px the layout flips: `.am-page { flex-direction: column }`, the panel becomes full width,
`position: static` (no longer pinned) and its result list is capped at `max-height: 260px` so
it does not eat the whole screen. At ≤480px the horizontal form rows stack vertically and the
fixed 70px season-number box is released with `flex: unset`.

---

### Absolute positioning: where and why

`position: absolute` appears in only a handful of places, and always for the same reason —
pinning something to a corner of a parent without disturbing the flow of everything else.

**What this is:** an absolutely positioned element is removed from the normal layout flow and
placed relative to the nearest ancestor that has `position: relative` (or `fixed`/`absolute`)
— its *containing block*. If no ancestor qualifies it falls back to the whole page, which is
almost always a bug.

| Element | File | Anchor |
|---|---|---|
| Navbar search icon | `Navbar.css` `.search-box i { position: absolute; right: 0 }` | `.search-box { position: relative }` |
| Dropdown menus | `Navbar.css` `.dropdown-menu { position: absolute; top: 100% }` | `.navi-btn { position: relative }` |
| Announcement close × | `Alert.css` `.alert-x { position: absolute; right: 15px }` | `.alert { position: relative }` |
| Admin search icon / clear button | `AddMovies.css` `.am-search-icon`, `.am-search-clear` | `.am-search-wrap { position: relative }` |
| Password show/hide toggle | `AddMovies.css` `.am-pass-toggle-btn` | `.am-pass-input-box { position: relative }` |
| The whole admin modal | `AddMovies.css` `.am-modal-overlay { position: fixed; inset: 0 }` | the viewport |

Each input-side icon also reserves room with padding on the input (`padding-right: 45px` in the
navbar, `padding: 10px 36px 10px 34px` in the admin search) so text never slides underneath the
floating icon. The one place absolute positioning is *not* used for a corner icon is the
breadcrumb separators — those are ordinary flex children separated by `gap`, which is simpler
when the thing is part of the content rather than decoration on top of it.

---

### Classes in the JSX with no CSS at all

A few `className` values are hooks that were never given rules. They are harmless (unstyled
classes just render as default browser styling) but they are either unfinished features or
leftovers from the WordPress design this was ported from:

- `cat-badge` and `upload-time` — `frontend/src/components/MovieHeader.jsx` (the category chip
  and the calendar icon currently look like plain text/links)
- `comment-section`, `form-row`, `form-field` — `frontend/src/components/CommentSection.jsx`
  (so the name/email fields are stacked rather than side by side)
- `.movie-card-badges` / `.movie-card-badge` / `.movie-card-type` / `-lang` / `-genre` in
  `Postcards.css` are the opposite case: fully-written rules wrapped in a `/* ... */` comment
  at the bottom of the file (lines 94-119) for a badge feature that was designed but never
  rendered. Note the comment only starts at line 94 — the opening `/*` is on the
  `.movie-card-badges` line, so the whole block including the rule bodies is inert.

Also `frontend/src/index.css` is not imported by anything (see above), so the reset, the
14px mobile font size and the reduced-motion guard are currently not in effect.

---

### Image assets

The repo ships exactly two images, both in `frontend/src/assets/`, both imported into
JavaScript so Vite hashes their filenames and serves them from the bundle:

- `moviesmod.png` — the site logo, imported by `Navbar.jsx` and displayed at a fixed 248px wide.
- `tgmoviesmod.jpg` — the "Join Us on Telegram" banner in the sidebar (`Sidebar.css` `.social-img`
  gives it `border-radius: 6px`).

Everything else you see on screen comes from the network at runtime: TMDB poster URLs on the
movie cards, screenshot URLs from the movie data, the Google font files, Bootstrap, Font
Awesome, and that one IMDB star PNG on `moviesmod.zone` described above. `frontend/index.html`
also has `<link rel="preconnect">` hints for `fonts.gstatic.com`, `image.tmdb.org` and
`api.themoviedb.org` (**What this is:** preconnect performs the DNS lookup + TCP + TLS
handshake to a host ahead of time, so the first real request to it starts earlier) — a small but
free speed-up given how many TMDB images the home page loads.

`frontend/index.html` also declares `<link rel="icon" href="/favicon.png">`; that file lives in
`frontend/public/`, which Vite copies into the build verbatim.

---

### Key takeaways

- **One plain CSS file per component, imported on its first line.** Vite bundles them into a
  single stylesheet; classes stay global, so each component prefixes its names (`navi-`,
  `movie-card-`, `side-`, `dl-`, `am-`, `ep-`, `imdbwp__`) instead of relying on scoping tools.
- **Three styling layers:** Bootstrap 5.3.8's *CSS only* (base styles plus a few utilities —
  `my-5`, `mt-4`, `d-flex`, `justify-content-center`, `text-decoration-none`, `rounded-*`,
  `px-1`, `pe-1`), your hand-written dark theme, and Font Awesome 4.7 for icons. No Bootstrap
  JavaScript — dropdowns, the hamburger menu and the admin modal are all React state plus a
  class toggle.
- **The palette is Tailwind's zinc grays:** `#18181b` page, `#27272a` cards, `#3f3f46` borders,
  `#09090b` sidebar gutter, `#e4e4e7`→`#a1a1aa` text grays. Blue `#3b82f6` means "interactive"
  on the public site; the admin and episode pages use teal (`#008080` / `#14b8a6`) to look like
  a different app.
- **The poster grid is hand-written CSS Grid** going 2 → 3 → 4 → 5 columns at 480 / 768 / 1024px
  via mobile-first `min-width` queries; `RelatedPosts.css` reuses the same cards at 4 → 2.
- **Uniform posters come from a 300px-high wrapper plus `object-fit: cover`** (with
  `object-position: center top` to crop from the bottom), `overflow: hidden`, and `width`/`height`
  attributes on the `<img>` to stop layout shift.
- **Hovers are all `transition`-based**, mostly 0.15–0.3s (brightness filter on posters, colour
  on links/chips, opacity on buttons) — but several older rules use a sluggish `transition: 1s`,
  which is worth normalising.
- **`position: relative` on a parent + `position: absolute` on a corner icon** is the repeated
  pattern for search icons, close buttons, dropdowns and the password toggle; the modal uses
  `position: fixed` with `inset: 0`, a blurred backdrop and two `@keyframes` animations.
- **`AddMovies.css` is its own design system** (~1200 lines, `am-` prefix, Inter font loaded by
  CSS `@import`): sticky 380px tool panel, nested-flexbox form rows, pill chips for status,
  `box-shadow` focus glows, a data-URI SVG select arrow, and custom thin scrollbars.
- **Known rough edges:** `frontend/src/index.css` is never imported; `Social.css` and
  `Socialmini.css` are identical duplicates; `cat-badge`, `upload-time`, `comment-section`,
  `form-row` and `form-field` have no CSS; the comment form's focus rule sets a border colour on
  borderless inputs (so it does nothing); and the IMDB star image loads from an external
  WordPress domain that could disappear.
## 09. Glossary of Techniques

This is the reference section of the guide. Every technique the site relies on gets a short plain-English definition plus a pointer to where it actually lives in this repo. If a later section uses a word you half-remember, look it up here.

### Frontend concepts (React and JavaScript)

#### Single Page Application (SPA)
**What this is:** a website that loads exactly one HTML page from the server; after that, JavaScript intercepts every click, changes the URL, and re-draws the screen itself. The server never sends a second HTML page, so navigation feels instant — but the first load is heavier, and the browser must be told that "any URL should serve that same HTML file".

**In this project:** the entire app is one SPA. `frontend/index.html` contains only an empty `<div id="root"></div>` and one script tag; `frontend/src/main.jsx` fills that div with React, and `frontend/src/App.jsx` decides what to draw from the URL. Because the URL `/movie-details/12345` is not a real file, `frontend/vercel.json` tells the host to serve the shell for every path:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Without that rewrite, refreshing a details page would 404.

#### React component
**What this is:** a plain JavaScript function that returns markup. React calls it and inserts the result into the page; whenever the data it depends on changes, React calls it again and updates only what differs. Components can be composed — a page is made of components, which are made of smaller components.

**In this project:** everything under `frontend/src/components/` and `frontend/src/pages/` is a function component. `frontend/src/components/Postcards.jsx` is the smallest useful example — one card component reused by the grid and by related posts:

```jsx
const PosterCard = ({ movie }) => {
  const detail = getMovieDetails(movie);
  return (
    <Link to={`/movie-details/${movie.id}`} className="movie-card-link">
      ...
    </Link>
  );
};
```

`frontend/src/pages/HomePage.jsx` composes `Navbar`, `Social`, `Alert`, `MovieGrid`, `Pagination`, `Footer`.

#### JSX
**What this is:** the HTML-like syntax React files use (`<div>`, `{variable}`, `<Component />`). It is not HTML and not valid JavaScript — a build step (Vite, here) converts it into function calls before the browser sees it. Curly braces let you drop any JavaScript expression into the markup.

**In this project:** every `.jsx` file. Two idioms worth recognising in `frontend/src/components/Navbar.jsx` — a template literal building a class name, and a fragment (`<>...</>`) used when two sibling elements must be returned without a wrapping `<div>`:

```jsx
<div className={`navi-btn ${activeDropdown === index ? "active" : ""}`}>
```

```jsx
{item.link ? (
  <Link to={item.link}>{item.label}</Link>
) : (
  <>
    <button onClick={() => toggleDropdown(index)}>{item.label}</button>
    {item.dropdown && <div className="dropdown-menu">...</div>}
  </>
)}
```

#### props vs state
**What this is:** the two ways a component gets data. **Props** are inputs handed down from the parent — read-only, the child cannot change them. **State** is data the component owns and can change over time; changing it is what makes React re-render. Rule of thumb: data flowing *down* is props, data that *changes because the user did something* is state.

**In this project:** `frontend/src/components/Postcards.jsx` takes `movies` as a prop and never edits it — `HomePage` owns that data. The dismissible banner `frontend/src/components/Alert.jsx` owns its own state, because only the banner cares whether it was closed:

```jsx
const Alert = () => {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
```

And `frontend/src/pages/MovieDetails.jsx` passes everything the page needs downward as props: `<MovieHeader detail={displayDetail} />`, `<Sidebar tags={tags} popular={popular} />`.

#### `useState`
**What this is:** React's hook for giving a component memory. It returns the current value and a setter function; calling the setter schedules a re-render with the new value. The argument is the initial value, and it is only used on the first render.

**In this project:** used everywhere. `frontend/src/pages/HomePage.jsx` keeps the fetched page in one object so it updates atomically:

```jsx
const [pageData, setPageData] = useState({ movies: [], totalPages: null });
```

`frontend/src/hooks/useTmdbMovie.js` and `frontend/src/pages/AddMovies.jsx` pass a *function* to `useState` when the first value is expensive to compute — React then calls it only once:

```js
const [state, setState] = useState(() => {
  if (cacheKey && isCacheValid(cacheKey)) {
    return { data: tmdbCache[cacheKey], loading: false, error: null };
  }
  return { data: null, loading: Boolean(imdbID || tmdbId), error: null };
});
```

`AddMovies.jsx` also uses the setter-with-function form `setShowPassword((v) => !v)` to flip a boolean based on the previous value.

#### `useEffect`
**What this is:** React's hook for *side effects* — anything that touches the outside world (network requests, timers, document event listeners, scrolling). It runs after render, and its dependency array decides when it re-runs. Returning a function from the effect makes that function the *cleanup*, which runs before the next run and when the component is removed.

**In this project:** three distinct shapes.

Fetch data when the route/params change (`frontend/src/pages/HomePage.jsx`):

```jsx
useEffect(() => {
  let active = true;
  const request = filteredMode ? moviesApi.list({ all: 1 }) : moviesApi.list({ page, limit: PAGE_SIZE });
  request.catch(() => {});
  return () => { active = false; };
}, [filteredMode, tag, q, page]);
```

Attach a global listener and always remove it in cleanup (`frontend/src/components/Navbar.jsx`, closes the dropdown when you click elsewhere):

```jsx
document.addEventListener("mousedown", handleClickOutside);
return () => document.removeEventListener("mousedown", handleClickOutside);
```

React to a route change without network work (`frontend/src/pages/MovieDetails.jsx` scrolls back to the top whenever the movie id changes):

```jsx
useEffect(() => { window.scrollTo(0, 0); }, [id]);
```

Getting the dependency array wrong is the classic React bug: too few dependencies means stale data, too many (like the derived objects in `useTmdbMovie.js`, see its `eslint-disable` comment) means the request fires on every render.

#### `useMemo`
**What this is:** a hook that remembers the result of an expensive calculation and only recomputes when one of its dependencies changes. Between renders, the same array/object is returned instead of a new one being built.

**In this project:** twice.

`frontend/src/pages/HomePage.jsx` — the whole filter + sort pipeline over the full movie list (language, genre, year, type, OTT, tag, search, newest-first) is wrapped in `useMemo`, so typing one character in the search box does not re-run all of it for unrelated re-renders:

```jsx
const newestFirst = useMemo(() => {
  if (!filteredMode) return [];
  let base = published;
  if (langParam) base = base.filter((m) => matchesLang(m, langParam));
  ...
  return [...base].sort((a, b) => bt - at);
}, [filteredMode, tag, q, langParam, genreParam, yearParam, typeParam, ottParam, published]);
```

`frontend/src/components/Pagination.jsx` — the "1 … 4 5 6 … 20" page list is only rebuilt when the total or the current page changes:

```jsx
const pageItems = useMemo(() => getPageItems(totalPages, page), [totalPages, page]);
```

#### `useRef`
**What this is:** a hook that returns a mutable box (`ref.current`) which survives re-renders **without** triggering one. Use it for values that must persist but should not affect what is drawn — timer ids, "previous value" markers, or a handle on a DOM node.

**In this project:** all three uses.

Timer id for the debounce in `frontend/src/pages/AddMovies.jsx` (`const debounceRef = useRef(null)`); previous-key marker in `frontend/src/hooks/useTmdbMovie.js` (`const prevCacheKeyRef = useRef(cacheKey)`); and a real DOM handle in `frontend/src/components/Navbar.jsx` so the click-outside handler can test "was that click inside the menu?":

```jsx
const dropdownRef = useRef(null);
...
if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
  setActiveDropdown(null);
}
```

#### React StrictMode
**What this is:** a development-only wrapper that deliberately renders each component twice and runs effects twice, to expose code that assumes "renders happen once" (missing cleanups, impure render bodies). It changes nothing in a production build.

**In this project:** `frontend/src/main.jsx` wraps the whole app in it:

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Practical consequence: in dev you will see every fetch effect run twice (the cancellation flags described below are what keep that harmless). It is also why the `active`/`cancelled` pattern is not optional here.

#### Conditional rendering
**What this is:** showing different markup depending on data — with `if (...) return <X/>` at the top of the component, ternaries inside JSX (`cond ? <A/> : <B/>`), or `cond && <A/>` for "only when true". Returning `null` renders nothing at all.

**In this project:** the loading/not-found early returns in `frontend/src/pages/MovieDetails.jsx`:

```jsx
if (loading) return (<> <Navbar /> <div className="not-found">Loading...</div> ... </>);
if (!movie || !siteData) return (<> ... Movie not found. <Link to="/">Go back to Home</Link> ... </>);
```

Other examples: `frontend/src/components/Alert.jsx` returns `null` once dismissed; `frontend/src/pages/EpisodePage.jsx` swaps between "no episodes yet" text and the episode list; `frontend/src/components/Screenshots.jsx` renders each image as `failed[i] ? null : <img ... />`, so a broken URL simply removes that screenshot instead of showing a broken-image icon.

#### List rendering with keys
**What this is:** turning an array into JSX with `.map()`. Each element needs a `key` — a stable id React uses to know which item is which between renders, so it can move or update DOM nodes instead of tearing everything down. Keys must be unique among siblings; array indexes are a last resort, because reordering an index-keyed list makes React mix up items.

**In this project:** stable domain ids wherever they exist — `frontend/src/components/Postcards.jsx` uses `key={movie.id}`, `frontend/src/pages/EpisodePage.jsx` uses `key={ep.episodeNumber}`, `frontend/src/pages/AddMovies.jsx` season blocks use `key={s.season}` and episodes `key={ep.episodeNumber}`:

```jsx
{movies.map((movie) => (
  <PosterCard key={movie.id} movie={movie} />
))}
```

Indexes are used only where the list is effectively append-only or synthetic: the quality chips in `AddMovies.jsx` (`key={i}`), the quality tabs in `EpisodePage.jsx`, and the `...` separators in `frontend/src/components/Pagination.jsx` (`key={`dots-${idx}`}` — note the prefix, because `"..."` alone would collide with itself).

#### Controlled inputs
**What this is:** a form field whose value comes from React state and whose `onChange` writes back to that state. React is the single source of truth, so the displayed value and the state can never drift apart (and you can clear or transform the field programmatically).

**In this project:** the pattern is `<input value={x} onChange={(e) => setX(e.target.value)} />` throughout. Search box in `frontend/src/components/Navbar.jsx`:

```jsx
<input type="text" value={query}
  onChange={(e) => setQuery(e.target.value)}
  onKeyDown={(e) => e.key === "Enter" && onSearch()} />
```

The admin password field in `frontend/src/pages/AddMovies.jsx` is controlled too, which is what lets the "show password" eye button swap `type={showPassword ? "text" : "password"}` and lets a cancel clear the field. `frontend/src/components/Sidebar.jsx` wraps one in a `<form onSubmit={handleSearch}>` and calls `e.preventDefault()` so the browser does not do a full-page submit.

#### React Router
**What this is:** the library that gives an SPA URLs. It matches the current path to a component (`<Routes>`/`<Route>`), offers `<Link>` instead of `<a>` so navigation stays client-side, and hooks to read the URL: `useParams` for path segments, `useSearchParams` for the part after `?`, `useNavigate` to change the URL from code.

**In this project:** the route table is all of `frontend/src/App.jsx`:

```jsx
<BrowserRouter>
  <Routes>
    <Route path='/' element={<HomePage/>}></Route>
    <Route path='/movie-details/:id' element={page(<MovieDetails/>)}></Route>
    <Route path='/AddMovies' element={page(<AddMovies/>)}></Route>
    <Route path='/series/:movieId/season/:seasonNum' element={page(<EpisodePage/>)}></Route>
  </Routes>
</BrowserRouter>
```

- `useParams()` pulls `:id` (`MovieDetails.jsx`) and `:movieId`/`:seasonNum` (`EpisodePage.jsx`).
- `useSearchParams()` in `HomePage.jsx` reads eight optional filters (`tag`, `q`, `lang`, `genre`, `year`, `type`, `ott`, `page`) — every navbar dropdown item in `Navbar.jsx` is just a pre-built query string like `/?lang=hi&type=tv`.
- `useNavigate()` powers programmatic jumps in `Navbar.jsx` (`navigate(`/?q=${encodeURIComponent(q)}`)`), `Sidebar.jsx` and both `Social.jsx`/`Socialmini.jsx` button rows.
- `<Link>` builds every internal hyperlink (`Postcards.jsx`, `SeriesSeasons.jsx`, `MovieHeader.jsx`), while real external links stay plain `<a target="_blank" rel="noopener noreferrer">`.

#### Code splitting / `React.lazy` / `Suspense`
**What this is:** instead of one huge JavaScript file, the bundler splits rarely-visited screens into separate files that the browser downloads only when needed. `lazy(() => import("./Page"))` tells React "fetch this component's file on first use", and `<Suspense fallback={...}>` says what to show while it arrives.

**In this project:** `frontend/src/App.jsx` keeps only the home page in the main bundle; the three other routes are split:

```jsx
const MovieDetails = lazy(() => import("./pages/MovieDetails"))
const AddMovies = lazy(() => import("./pages/AddMovies"))
const EpisodePage = lazy(() => import("./pages/EpisodePage"))

const page = (element) => <Suspense fallback={null}>{element}</Suspense>
```

`fallback={null}` means "render nothing for the split second the chunk loads" — acceptable because those pages show their own `Loading...` right after mounting. The result is visible on disk: `frontend/dist/assets/` contains separate `AddMovies-*.js`, `MovieDetails-*.js` and `EpisodePage-*.js` files, so a visitor reading the home page never downloads the big admin screen.

#### Vite (dev server, HMR, bundling, tree shaking)
**What this is:** the build tool for the frontend. In dev it is a server that serves your source files as-is and does **HMR** (hot module replacement — an edit is pushed into the running page in milliseconds without a reload or losing state). For production, `vite build` bundles and minifies everything into hashed static files. **Tree shaking** is its habit of dropping exported code nothing imports.

**In this project:** `frontend/vite.config.js` is deliberately minimal — one line of real configuration:

```js
export default defineConfig({
  plugins: [react()],
})
```

The scripts in `frontend/package.json` map to it: `"dev": "vite"` (port 5173), `"build": "vite build"` (writes `dist/`), `"preview": "vite preview"` (serves `dist/` locally to test the built site). Vite is also what makes `import.meta.env.VITE_TMDB_API_KEY` work — those variables are replaced with literal text at build time. Tree shaking is why `frontend/src/assets/Tags.js` can export a dozen helpers while a page that only needs `getTags` (`MovieDetails.jsx`) ships without the rest.

#### ESLint
**What this is:** a static checker that reads your code without running it and flags mistakes and risky patterns (unused variables, invalid JSX, wrong hook usage). Plugins add rule sets — for React the important one is `eslint-plugin-react-hooks`, which enforces the rules of hooks and warns when a `useEffect` dependency list looks wrong.

**In this project:** `frontend/eslint.config.js` (the modern "flat config" format) applies three rule sets to every `.js`/`.jsx` file and ignores the build output:

```js
extends: [
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
],
```

Run it with `npm run lint` in `frontend/`. The codebase has exactly two places where a rule is knowingly switched off, and both carry an explanatory comment: `frontend/src/hooks/useTmdbMovie.js` line 212 disables `react-hooks/exhaustive-deps` (including the derived `mediaTypeHint`/`seasonList` objects would re-fetch on every render), and `frontend/src/pages/AddMovies.jsx` line 383 disables `react-hooks/set-state-in-effect` (clearing results synchronously when the query is emptied is intentional).

#### fetch / Promises / async-await
**What this is:** `fetch(url)` starts an HTTP request and immediately returns a **Promise** — a placeholder for a value that does not exist yet. `.then()` runs when it resolves, `.catch()` when it fails. `async/await` is nicer syntax for the same thing: `await` pauses inside an `async` function until the promise settles. Promises let the browser keep rendering while the network is busy instead of freezing the page.

**In this project:** all network access goes through `fetch`. `frontend/src/api/moviesApi.js` is the single module that talks to your API, and its `list()` shows the whole chain:

```js
const res = await fetch(`${API}${params}`);
if (!res.ok) throw new Error("Failed to fetch movies");
const data = await res.json();   // res.json() is *also* a promise
```

Two further habits used here are worth copying. `Promise.all` runs independent requests at the same time instead of one after another — `backend/routes/movieRoutes.js` runs the page query plus the count in parallel, and `frontend/src/pages/MovieDetails.jsx` fetches the movie document and the sidebar list together:

```js
Promise.all([
  moviesApi.get(id),
  moviesApi.list({ all: 1 }).catch(() => ({ movies: [] })),
]).then(([doc, list]) => { ... });
```

And `.catch(() => ({}))` is used as a shield where an empty result is fine (`moviesApi.js` error bodies, the season fetches in `useTmdbMovie.js`), so one missing piece never blanks the whole page.

#### Race conditions and cancellation flags
**What this is:** a race condition happens when two slow operations finish out of order and the older one overwrites the newer one — e.g. you click movie A then quickly movie B, and A's slow response arrives last and gets displayed for B. A **cancellation flag** is the simple fix: a local variable set to `false` when the effect cleans up, checked before applying any result.

**In this project:** every fetch effect uses the same `active` flag. From `frontend/src/pages/HomePage.jsx`:

```jsx
useEffect(() => {
  let active = true;
  moviesApi.list({ page, limit: PAGE_SIZE }).then((r) => {
    if (active) setPageData({ ... });   // ignore if a newer effect started
  });
  return () => { active = false; };     // runs before the next run / on unmount
}, [filteredMode, tag, q, page]);
```

`frontend/src/hooks/useTmdbMovie.js` uses the same idea named `cancelled`, checked after *every* `await` in a long multi-request chain. `frontend/src/pages/MovieDetails.jsx` adds a second defence for the object it stores: the stored document remembers which id it was fetched for, and "am I loading?" is *derived* instead of being another piece of state:

```js
const [fetched, setFetched] = useState({ id, doc: null, ready: false });
...
const loading = fetched.id !== id || !fetched.ready;
const movie = fetched.id === id ? fetched.doc : null;
```

So a stale response can never be shown for the wrong movie — the route changed, the data simply does not match.

#### Debouncing
**What this is:** delaying an action until the user stops doing it. Every new keystroke cancels the pending timer and starts a new one; only after a quiet period does the real work run. Without it, a seven-letter search fires seven network requests.

**In this project:** the TMDB search box in `frontend/src/pages/AddMovies.jsx` waits 450 ms. The timer id lives in a `useRef` so it survives re-renders, and the effect's cleanup clears it — which is what actually implements the "restart the clock on every keystroke" behaviour:

```jsx
const debounceRef = useRef(null);

useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  const q = query.trim();
  if (!q) { setSearchResults([]); return; }

  debounceRef.current = setTimeout(async () => {
    setSearching(true);
    const res = await fetch(`${TMDB}/search/multi?query=${encodeURIComponent(q)}...`);
    ...
    setSearching(false);
  }, 450);

  return () => clearTimeout(debounceRef.current);
}, [query]);
```

Note the deliberate asymmetry: clearing the input resets the results *immediately* (no 450 ms lag), only the network call is debounced.

#### Memoization (caching computed values)
**What this is:** remembering the result of work keyed by its input, so repeating the same input skips the work. `useMemo` is the per-render version; a module-level object or `Map` is the app-lifetime version.

**In this project:** two hand-rolled app-level caches, both chosen so going "Home → Details → Back" does not refetch.

`frontend/src/api/moviesApi.js` caches your own API's list responses and invalidates them on any write:

```js
const listCache = new Map();
const listKey = (opts = {}) =>
  opts.all ? "all" : `page:${opts.page || 1}:limit:${opts.limit || 20}`;
...
async list(opts = {}) {
  const key = listKey(opts);
  if (listCache.has(key)) return listCache.get(key);
  ...
  listCache.set(key, normalized);
}
```

`add`/`update`/`remove` all call `listCache.clear()` first, so a freshly published movie shows up in the list immediately. `frontend/src/hooks/useTmdbMovie.js` does the same for TMDB responses in a plain object keyed by `imdbId`/`tmdbId` plus the season list — TMDB data changes rarely, so it is never deliberately invalidated.

#### Immutability (spread / map / filter)
**What this is:** React expects state to be treated as read-only — you build a *new* copy with the change applied instead of editing the old one, because React detects change by comparing references (`old !== new`). The tools are the spread operator `...` (copy an object/array), `.map()` (copy with some items transformed) and `.filter()` (copy with some items removed).

**In this project:** the nested season/episode editor in `frontend/src/pages/AddMovies.jsx` is the clearest example — three levels deep (link → season → episodes), never mutated:

```js
const addSeason = () => {
  ...
  const nextSeasons = existing
    ? seasons.map((s) => (s.season === sn ? { ...s, batchLink } : s))
    : [...seasons, { season: sn, batchLink, episodes: [] }].sort((a, b) => a.season - b.season);
  onChange({ ...quality, seasons: nextSeasons });
};
```

Reading it: `[...seasons, newItem]` appends without touching the old array; `{ ...s, batchLink }` copies a season while overwriting one field. Removal is always `.filter(...)` (`handleRemoveLink` in the same file: `prev.filter((_, i) => i !== index)`), and updates are `.map(...)` that return the original item unchanged when it does not match. One deliberate exception: `startEdit` in the same file uses `JSON.parse(JSON.stringify(fullDoc.downloadLinks))` — a quick-and-dirty *deep* clone so the editing form can't accidentally alter the cached object.

#### URLSearchParams
**What this is:** a browser built-in for reading and writing the query string (the part of a URL after `?`) without hand-building strings — it handles array-ish values and percent-encoding for you. Pairs like `Disney+ Hotstar` become `Disney%2B+Hotstar` automatically.

**In this project:** pagination in `frontend/src/pages/HomePage.jsx` edits *only* the `page` key and keeps every active filter:

```jsx
const handlePageChange = (nextPage) => {
  if (nextPage < 1 || nextPage > totalPages) return;
  const params = new URLSearchParams(searchParams); // copy of current ?...
  params.set("page", String(nextPage));
  setSearchParams(params);   // React Router updates the URL and re-renders
  window.scrollTo(0, 0);
};
```

Reading is the other half — the top of `HomePage.jsx` does `searchParams.get("tag")`, `.get("q")`, `.get("lang")` etc. (React Router's `useSearchParams` returns a `URLSearchParams`). Related helpers: `encodeURIComponent()` is used for the free-text pieces (search terms, tag names in `Sidebar.jsx`/`MovieHeader.jsx`), and `AddMovies.jsx` has `isValidUrl`, which uses the opposite trick — `new URL(str)` throws on garbage, so a `try/catch` becomes a URL validator used to enable/disable the "Add" buttons.

### Backend and data concepts

#### REST API
**What this is:** a convention for structuring an HTTP API around *resources* (nouns in the URL) and *methods* (verbs): `GET /things` lists, `GET /things/:id` reads one, `POST /things` creates, `PUT /things/:id` updates, `DELETE /things/:id` removes. It is a convention, not a technology — any client that can speak HTTP can use it.

**In this project:** the whole backend is one REST resource. `backend/routes/movieRoutes.js` mounted by `backend/server.js` at `/api/movies`:

| Method + path | Purpose | Auth |
| --- | --- | --- |
| `GET /api/movies` | one page (`?page=&limit=`) or everything light (`?all=1`) | public |
| `GET /api/movies/:tmdbId` | the full document for one title | public |
| `POST /api/movies` | publish a new title (409 if the `tmdbId` already exists) | public |
| `POST /api/movies/verify-admin` | check the admin password once, from the client | — |
| `PUT /api/movies/:tmdbId` | update a title | admin |
| `DELETE /api/movies/:tmdbId` | remove a title | admin |

Note the resource is keyed by `tmdbId` (the TMDB ID), not by a database-internal id — the same number used in the frontend URL and in TMDB lookups.

#### JSON
**What this is:** JavaScript Object Notation — a text format for structured data that both JS and every other language can read. It is how your frontend and backend talk: objects and arrays as strings over HTTP.

**In this project:** end to end. The backend converts with `res.json(...)` and parses incoming bodies with `app.use(express.json())` (`backend/server.js`); the frontend does the reverse with `JSON.stringify(movie)` and a `"Content-Type": "application/json"` header (`frontend/src/api/moviesApi.js`):

```js
const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(movie),
});
```

Two smaller uses: `res.json().catch(() => ({}))` tolerates an error response with no JSON body, and `AddMovies.jsx` uses `JSON.parse(JSON.stringify(x))` as a one-line deep clone.

#### HTTP methods and status codes (200 / 304 / 401 / 404 / 409 / 500)
**What this is:** every request has a **method** saying what it wants done (`GET` read, `POST` create, `PUT` update, `DELETE` delete) and gets back a three-digit **status code**: 2xx success, 3xx redirect/not-modified, 4xx the caller's mistake, 5xx the server's mistake.

**In this project:** from `backend/routes/movieRoutes.js` —

- **200** (implicit) — every successful `res.json(...)`, plus `res.status(201)` for a successful `POST` ("created").
- **304 Not Modified** — never written by hand; produced automatically (see HTTP caching below).
- **400** — the `catch` blocks of create/update, i.e. "your payload was rejected" (failed validation, bad `tmdbId`).
- **401 Unauthorized** — admin checks failed:

```js
if (!providedPass || providedPass !== adminPass) {
  return res.status(401).json({ message: "Unauthorized: Invalid or missing admin password" });
}
```

- **404 Not Found** — `GET`/`PUT`/`DELETE` on a `tmdbId` that does not exist. The frontend special-cases it: `moviesApi.get()` returns `null` on `res.status === 404` instead of throwing, so "movie not found" is a normal value, not an error.
- **409 Conflict** — `POST` of a title whose `tmdbId` is already published (`Movie already exists`), the standard code for "collides with something that's already there".
- **500** — the list route's `catch`, and `verifyAdmin` when the server has no `ADMIN_PASSWORD` configured (a server-side misconfiguration, hence 5xx).

The frontend turns these into messages in `moviesApi.js`: 401 becomes "Admin authorization required…", anything else uses the server's `message`.

#### CORS
**What this is:** Cross-Origin Resource Sharing — the browser's rule that a page from one origin (scheme + host + port) may not *read* another origin's responses unless that other origin explicitly allows it. It is enforced by the browser, so `curl` works fine while your web page gets blocked.

**In this project:** in dev the frontend is `localhost:5173` and the API `localhost:5000` — different origins — so without CORS every API response would be unreadable. `backend/server.js` reads the allow-list from the environment, accepting a comma-separated list:

```js
const corsOrigin = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.includes(",")
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : process.env.CORS_ORIGIN)
  : "*";

app.use(cors({ origin: corsOrigin }));
```

Unset in dev it is `"*"` (anyone) — fine locally, but in production `CORS_ORIGIN` should be exactly your Vercel domain. Separately, `api.themoviedb.org` already sends permissive CORS headers, which is the only reason the browser is allowed to call TMDB directly, with no backend in between.

#### Environment variables
**What this is:** configuration values supplied by the environment the program runs in rather than written in the code — database URLs, passwords, ports. They keep secrets out of git and let the same build run in dev and production with different settings.

**In this project:** two mechanisms, one per app.

Backend — the `dotenv` package loads `backend/.env` into `process.env` (this line must run before anything reads a variable):

```js
dotenv.config();
...
const PORT = process.env.PORT || 5000;
```

Frontend — Vite exposes only variables prefixed `VITE_`, and only through `import.meta.env`:

```js
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;           // AddMovies.jsx
const rawBase = import.meta.env.VITE_API_BASE_URL;            // moviesApi.js
: (import.meta.env.DEV ? "http://localhost:5000" : "");
```

`backend/.env.example` and `frontend/.env.example` document all five variables. The critical difference: `VITE_*` values are **baked into the JavaScript at build time and visible to every visitor** — that is fine for the TMDB key (restrict it in your TMDB account) but is exactly why `MONGODB_URI` and `ADMIN_PASSWORD` live only in the backend `.env`, which both root and subfolder `.gitignore` files exclude (`.env` / `.env.*` / `!.env.example`).

#### MongoDB and document databases
**What this is:** a database that stores **documents** (JSON-like objects with whatever fields they need) instead of rows in fixed tables. Related data — here, a quality's seasons and each season's episode links — nests inside the same document instead of living in separate joined tables. Queries are by field value, and the database is accessed over a connection string to a cluster (MongoDB Atlas is the hosted version this project uses).

**In this project:** one collection, `movies`, one document per published title. `backend/models/Movie.js` shows why documents suit this data — the download structure is an array of qualities, each holding an array of seasons, each holding an array of episodes:

```js
downloadLinks: [downloadLinkSchema],
seasonEpisodes: [downloadLinkSchema],
screenshots: [{ type: String }],
publishedAt: { type: Date, default: Date.now },
```

`backend/config/db.js` opens the single connection with `mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })` and prints a warning when the URI has no database name (Mongoose would silently write into a default database and your data would look like it vanished). Atlas also needs the server's IP allow-listed — the error message in `backend/server.js` links to the exact page.

#### Mongoose (schema, model, index, projection, lean)
**What this is:** an ODM — a library sitting between Node and MongoDB. You describe your documents with a **schema** (field types, defaults, requirements), get a **model** (the object with `.find()`, `.create()`, `.findOneAndUpdate()`), and can add **indexes** for speed, **projections** to fetch only some fields, and `.lean()` to get plain objects back.

**In this project:** all of it lives in two files.

Schema + model + index — `backend/models/Movie.js`:

```js
tmdbId: { type: Number, required: true, unique: true },
mediaType: { type: String, enum: ["movie", "tv"], required: true },
...
movieSchema.index({ publishedAt: -1 });   // every list query sorts by this
const Movie = mongoose.model("Movie", movieSchema);
```

`unique: true` is what makes duplicate `tmdbId`s impossible at the database level (the route checks first to return a friendly 409). `{ timestamps: true }` adds `createdAt`/`updatedAt` automatically, and `{ _id: false }` on the nested link schema keeps sub-documents from getting their own useless ids.

Projection + lean — `backend/routes/movieRoutes.js`. The projection (leading `-` = "exclude this field") drops everything the grid never renders, and `.lean()` skips building full Mongoose document objects, returning plain JSON-ready objects:

```js
const LIST_PROJECTION = "-downloadLinks -seasonEpisodes -screenshots -overview -__v";
...
Movie.find().select(LIST_PROJECTION).sort(sort)
  .skip((page - 1) * limit).limit(limit).lean()
```

The single-movie route (`GET /:tmdbId`) uses `.lean()` but **no** projection, because the details page does need the download links. Updates use `findOneAndUpdate(..., { new: true, runValidators: true })` — `new: true` returns the *updated* document rather than the old one, `runValidators` makes the schema rules apply to updates too. The route also strips `tmdbId` from an update payload (`delete updateData.tmdbId`) so the id in the URL always wins.

#### Pagination
**What this is:** returning data in numbered chunks instead of all at once, so the first screen is fast no matter how big the catalogue gets. Server-side pagination means the *server* slices (`skip`/`limit`); client-side pagination means the client already holds everything and just slices in memory.

**In this project:** both, chosen per view.

Server side — `backend/routes/movieRoutes.js` clamps user input and computes the pages:

```js
const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE));
const page = Math.max(1, parseInt(req.query.page, 10) || 1);
...
.skip((page - 1) * limit).limit(limit)
...
totalPages: Math.max(1, Math.ceil(total / limit)),
```

Defaults 20, hard cap 60 (`MAX_PAGE_SIZE`) so nobody can request the whole table with `?limit=999999`. The response is `{ movies, total, page, totalPages }`, and `movieRoutes.js` also offers `?all=1` — the entire list but with the light projection.

Client side — `frontend/src/pages/HomePage.jsx` picks a mode: no filter in the URL → show `pageData` straight from the server; any filter/search/tag → fetch `?all=1` once, filter/sort in `useMemo`, and slice the current page in the browser:

```js
const currentMovies = filteredMode
  ? newestFirst.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  : pageData.movies;
```

`frontend/src/components/Pagination.jsx` renders the numbers (with `...` gaps) and reports clicks up via `onPageChange`; `HomePage` also clamps a stale `?page=99` deep-link to the last real page once `totalPages` is known.

#### gzip compression
**What this is:** squeezing HTTP responses before sending them and letting the browser uncompress them. JSON compresses extremely well because it is repetitive text, so the same data costs a fraction of the bandwidth. The client advertises support with `Accept-Encoding: gzip`; the server replies with `Content-Encoding: gzip`.

**In this project:** one line in `backend/server.js`, mounted before the routes so every response is covered:

```js
app.use(compression()); // gzip JSON — the movie list shrinks ~5-10x on the wire
```

It matters most for `GET /api/movies?all=1`, which can be hundreds of trimmed documents — still one round-trip, but far fewer bytes.

#### Middleware (Express)
**What this is:** functions that run on the way to a route handler, in the order they are registered. Each gets `(req, res, next)` and either finishes the response itself or calls `next()` to pass control on. Used for cross-cutting jobs: parse the body, compress, check permission, log.

**In this project:** two kinds.

Global, in `backend/server.js` — three middlewares run for every request, in this order:

```js
app.use(cors({ origin: corsOrigin }));   // add CORS headers
app.use(compression());                  // gzip the response
app.use(express.json());                 // parse JSON bodies into req.body
```

Per-route, in `backend/routes/movieRoutes.js` — `verifyAdmin` is attached only to the routes that need it (`router.put("/:tmdbId", verifyAdmin, ...)`) and short-circuits with a 401 instead of calling `next()`:

```js
const verifyAdmin = (req, res, next) => {
  const providedPass = req.headers["x-admin-password"];
  if (!providedPass || providedPass !== adminPass) {
    return res.status(401).json({ message: "Unauthorized: ..." });
  }
  next();
};
```

`express.Router()` itself is the mini-app that groups these handlers under one prefix, so `server.js` can do `app.use("/api/movies", movieRoutes)`. Note the deliberate asymmetry in the codebase: `POST /api/movies` (adding) has **no** `verifyAdmin` — only edit and delete are protected.

### Web platform concepts

#### Caching: in-memory vs HTTP
**What this is:** two layers of "don't fetch that again". **In-memory caching** is code you write — a variable holding results for the life of the page, instantly available and instantly invalidatable. **HTTP caching** is the browser doing it for you based on response headers; it survives page reloads but you control it only through headers.

**In this project:** both, on different data.

In-memory, JavaScript side: `listCache` (a `Map`) in `frontend/src/api/moviesApi.js` for your API's list responses, cleared on every add/update/remove; `tmdbCache` (a plain object) in `frontend/src/hooks/useTmdbMovie.js` for TMDB payloads, keyed by title id + season list.

HTTP side: `backend/routes/movieRoutes.js` sets `Cache-Control: no-cache` on the read endpoints (see next entry). The division of labour makes sense: your own list data changes when *you* publish, so the app invalidates it precisely with `listCache.clear()`; TMDB data is effectively static, so it is cached forever in memory and never invalidated.

#### HTTP caching (Cache-Control, ETag, 304)
**What this is:** headers that tell the browser and proxies what may be stored and for how long. `Cache-Control: no-cache` does **not** mean "don't cache" — it means "store it, but revalidate before reusing". Revalidation works via the `ETag` (a fingerprint of the response): the browser sends `If-None-Match: <etag>` and the server answers `304 Not Modified` with an empty body when nothing changed, saving the whole payload.

**In this project:** `backend/routes/movieRoutes.js` sets it on all three read endpoints:

```js
res.set("Cache-Control", "no-cache"); // revalidate → cheap 304s
```

Why `no-cache` rather than a `max-age`: your own data can change the moment you publish, so a "fresh for 5 minutes" policy would show stale lists; revalidation costs one small round-trip and returns a 304 most of the time. Express generates `ETag` headers automatically for JSON responses, so no extra code is needed for the 304 path. The static files in `frontend/dist/assets/` are the opposite case: their names are content-hashed (`MovieDetails-o6rhZJA-.js`), so the host can tell the browser to cache them for a year — change the file, the name changes, the cache is bypassed.

#### localStorage vs sessionStorage
**What this is:** the two browser key-value stores a page can use. Both hold strings only and are per-origin. `localStorage` persists until deliberately cleared (it survives closing the browser); `sessionStorage` is wiped when the tab closes. Neither is encrypted — anything in them is readable by anyone with access to that browser.

**In this project:** only `sessionStorage` is used, in `frontend/src/api/moviesApi.js`, to remember that you unlocked admin features this session:

```js
const ADMIN_KEY = "moviesmod_admin_pass";

getAdminPassword() { return sessionStorage.getItem(ADMIN_KEY) || ""; },
setAdminPassword(pass) {
  if (pass) sessionStorage.setItem(ADMIN_KEY, pass);
  else sessionStorage.removeItem(ADMIN_KEY);
},
```

`sessionStorage` is the right call for a password: closing the tab locks the admin UI again automatically (`handleLockAdmin` also clears it explicitly via the padlock button). `AddMovies.jsx` reads it once as the initial state: `useState(() => moviesApi.isAdminUnlocked())`. Note this is convenience caching only — the real check is the `x-admin-password` header compared against `ADMIN_PASSWORD` on the server for every edit and delete.

#### CDN (Content Delivery Network)
**What this is:** a set of servers spread around the world holding copies of your static files, so every visitor downloads from a nearby machine instead of from your one origin server. Faster for visitors and cheaper for the origin.

**In this project:** three separate CDNs, no setup required.

1. Vercel serves `frontend/dist/` (the built SPA) from its edge network — that is your site's own CDN.
2. `image.tmdb.org` is TMDB's image CDN; every poster, backdrop and episode still on the site is loaded from it via URLs built in `frontend/src/hooks/useTmdbMovie.js` (`https://image.tmdb.org/t/p/w500/...`). Your server never proxies or stores images.
3. The CSS frameworks in `frontend/index.html` come from public CDNs — `cdn.jsdelivr.net` for Bootstrap 5 and `cdnjs.cloudflare.com` for Font Awesome 4.7, both with an `integrity` hash so a tampered file is refused by the browser.

#### TMDB API
**What this is:** The Movie Database's free HTTP API — the metadata source for the whole site (search, details, credits, seasons, images). It needs an API key passed as `api_key=` on every call.

**In this project:** called **from the browser only** — the backend has no TMDB code at all. Four endpoints are in use:

- Search, in `frontend/src/pages/AddMovies.jsx` — `GET /3/search/multi?query=...` matches movies and TV shows in one call, then filters to `media_type === "movie" || "tv"`.
- Details with extras, in `frontend/src/hooks/useTmdbMovie.js` and `AddMovies.jsx` — `?append_to_response=credits,external_ids,images` fetches cast/crew, the IMDb id and the image lists in the same request instead of three.
- External-id lookup, in `useTmdbMovie.js` — `GET /3/find/{imdbID}?external_source=imdb_id` for the older built-in titles that only know their IMDb id, and it also determines whether the id belongs to a movie or a show:

```js
const findRes = await fetch(
  `https://api.themoviedb.org/3/find/${imdbID}?api_key=${key}&external_source=imdb_id`
);
```

- Per-season episodes for series — `GET /3/tv/{id}/season/{n}`, launched with `Promise.all` so all seasons load in parallel with the details request.

Image URLs are built by the helpers exported from `useTmdbMovie.js` (`tmdbPoster(path, "w500")`, `tmdbBackdrop(path, "w1280")`); the size suffix (`w92`, `w300`, `w500`, `w780`, `w1280`) picks the resolution, and the admin search deliberately uses `w92` thumbnails to keep that list light. `frontend/src/pages/MovieDetails.jsx` has a fallback path ("screenshot rescue") that re-fetches only the backdrops when the hook comes back empty, so the page still shows real stills.

#### Lazy image loading
**What this is:** telling the browser not to download an image until it is near the viewport (`loading="lazy"`), plus `decoding="async"` so decoding does not block the main thread. Fixed `width`/`height` (or CSS aspect-ratio) reserve the layout space so the page does not jump when images arrive.

**In this project:** on every grid/sidebar thumbnail. `frontend/src/components/Postcards.jsx`:

```jsx
<img src={imgSrc} alt={title} className="movie-card-img"
     width="300" height="450" loading="lazy" decoding="async" />
```

and the same attributes on the "popular posts" thumbs in `frontend/src/components/Sidebar.jsx`. A 20-card page therefore fetches roughly the posters on screen, not all 20. `frontend/src/components/Screenshots.jsx` adds an `onError` handler on top — a dead screenshot URL is removed from the page instead of showing the browser's broken-image icon:

```jsx
onError={() => setFailed((prev) => ({ ...prev, [i]: true }))}
```

#### preconnect
**What this is:** an HTML hint that makes the browser open the connection (DNS lookup + TCP + TLS handshake) to a domain *before* it needs anything from it. Those handshakes take a few hundred milliseconds each, so doing them early shaves that off the first real request. Use it only for the two or three domains you will definitely hit soon.

**In this project:** `frontend/index.html` preconnects to exactly the four domains the site needs, before the requests that use them:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://image.tmdb.org">
<link rel="preconnect" href="https://api.themoviedb.org" crossorigin>
```

Two domains need `crossorigin` because their files are fetched in "anonymous CORS mode" (fonts and API calls are); getting that attribute wrong silently wastes the hint. `image.tmdb.org` matters the most here — the first poster request is usually the first thing the page needs.

#### Regular expressions (regex)
**What this is:** a pattern language for matching text. Used here to pull structure out of free-form strings — finding a season number in a title, or splitting a download label into coloured tokens. `/pattern/flags` creates one; `.test()` answers yes/no, `.match()`/`.exec()` return the pieces, `.replace()` swaps matches.

**In this project:** the site's "release-style" typography is regex-driven.

The token splitter in `frontend/src/components/DownloadSection.jsx` (duplicated in `AddMovies.jsx` and `SeriesSeasons.jsx`) matches `{audio tags}`, `x264`/`x265`, `10bit` and `[sizes]` so each can be coloured differently — `g` means find all of them, and `re.lastIndex` is what the `while` loop uses to keep slicing:

```js
const re = /\{[^}]*\}|x26\d|10bit|\[[^\]]*\]/gi;
let last = 0, m;
while ((m = re.exec(label)) !== null) { ... last = re.lastIndex; }
```

Title parsing in `frontend/src/assets/movieDetails.js` — `parseSeasonRange` reads "Season 1-5" (or "S03") out of a title to build the season list:

```js
const rangeMatch = title.match(/(?:Season|S)\s*(\d+)\s*[-–]\s*(\d+)/i);
```

`frontend/src/components/SeriesInfo.jsx` has the inverse — `cleanTitle` chains six `.replace()` calls to *strip* "Download", season markers, years and quality words from a title. `frontend/src/components/DownloadSection.jsx`'s `buildHeadingTitle` does the same extraction to rebuild a heading. Smaller uses: `moviesApi.js` trims trailing slashes with `.replace(/\/+$/, "")`, and `MovieDetails.jsx` checks `/Season/i.test(movie.title)`. All of these only *parse display text* — the structured data (season numbers, links) lives in MongoDB, so a parsing miss costs presentation, not data.

#### Web fonts and icon fonts
**What this is:** a **web font** is a font file downloaded from a server (so visitors see your typography without having it installed); an **icon font** is the same trick used for symbols — each icon is a letter-shaped glyph you insert with a class, so it scales and recolours like text.

**In this project:** `frontend/index.html` loads Roboto from Google Fonts with four weights plus italics, and `display=swap` so text is shown in a fallback font immediately and swaps when Roboto lands (no invisible text while it downloads):

```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
```

Icons are Font Awesome 4.7 from cdnjs, used as `<i className="fa fa-search" />`, `<i className="fa fa-download" />` etc. throughout `Navbar.jsx`, `AddMovies.jsx`, `MovieHeader.jsx`, and even for state — `AddMovies.jsx` swaps the search icon for a spinner with `` `fa ${searching ? "fa-spinner fa-spin" : "fa-search"}` ``, and the password eye toggles between `fa-eye` and `fa-eye-slash`. Both files are loaded with `integrity` hashes (`index.html`), so a modified file from the CDN is rejected by the browser rather than executed.

### Key takeaways

- The site is a React SPA (one HTML shell + `vercel.json` rewrite) with four routes; only the home page is in the initial bundle — the other three are `React.lazy` chunks you can see in `frontend/dist/assets/`.
- React state and effects follow the same few idioms everywhere: controlled inputs, `active`/`cancelled` flags against race conditions, `useMemo` for the filter pipeline and the page-number list, `useRef` for the debounce timer, the dropdown DOM node and the previous cache key.
- Data flows through exactly one module (`frontend/src/api/moviesApi.js`) for your API, and one hook (`frontend/src/hooks/useTmdbMovie.js`) for TMDB — each with its own in-memory cache, invalidated by writes in the first case and effectively never in the second.
- Pagination is two-sided by design: server `skip`/`limit` (default 20, capped at 60) for the default grid, and one `?all=1` light list filtered and sliced in the browser whenever a filter or search is active.
- The backend is a single REST resource at `/api/movies`; `tmdbId` is the key everywhere, edit/delete are gated by the `verifyAdmin` middleware (401) and duplicates get 409, while list responses use a Mongoose projection + `.lean()` + gzip + `Cache-Control: no-cache` to stay cheap and revalidatable (304).
- Secrets are split by prefix: `VITE_*` variables are compiled into the public bundle, `MONGODB_URI`/`ADMIN_PASSWORD`/`CORS_ORIGIN` stay server-side in `.env` files that git ignores.
- Presentation details are data-driven from strings: regexes colour the download labels and parse season ranges, `transformPublished` normalises MongoDB documents into the UI shape, and TMDB values win over stored values with stored values as fallback.
- Platform-level performance comes from a handful of one-liners: `loading="lazy"` + fixed dimensions on every image, four `preconnect` hints in `index.html`, `display=swap` on the web font, and hashed asset filenames for year-long browser caching.
