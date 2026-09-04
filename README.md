# MoviesMod

A full-stack movie and TV series catalog web application inspired by MoviesMod, built with React, Node.js, Express, MongoDB, and The Movie Database (TMDB) API.

---

## Features

- **Dynamic Catalog**: Browse movies and TV shows with posters, ratings, synopsis, and genres.
- **TMDB Integration**: Seamlessly fetches movie/series details, cast, backdrops, and season/episode information via TMDB API.
- **Custom Admin & Management**: Add, update, and manage movies and series with download links, episode servers, and custom metadata.
- **TV Series & Seasons**: Dynamic season and episode listing with per-episode streaming/download links.
- **Search & Filter**: Filter titles with custom category tags and sidebar navigation.
- **Comments & Interactions**: Interactive comment section and social media links.
- **Modern Dark UI**: Fully custom CSS styling designed for a high-contrast, responsive dark theme experience.

---

## Tech Stack

- **Frontend**: React 19, React Router v7, Vite, Vanilla CSS
- **Backend**: Node.js (ES Modules), Express, Mongoose
- **Database**: MongoDB Atlas
- **External APIs**: [TMDB (The Movie Database) API](https://www.themoviedb.org/documentation/api)

---

## Project Structure

```
moviesmod/
├── backend/                # Express & MongoDB backend
│   ├── config/             # Database connection setup
│   ├── models/             # Mongoose schemas (Movie, Series, etc.)
│   ├── routes/             # Express API routes (/api/movies)
│   ├── server.js           # Backend entry point
│   ├── .env.example        # Backend environment variables template
│   └── package.json
├── frontend/               # React Vite client
│   ├── public/             # Static assets & icons
│   ├── src/
│   │   ├── api/            # API client services
│   │   ├── assets/         # Static images & local datasets
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks (TMDB fetching)
│   │   ├── pages/          # Application routes/pages
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example        # Frontend environment variables template
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account or local MongoDB instance
- [TMDB API Key](https://developer.themoviedb.org/docs/getting-started) (v3 API key)

---

### Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` variables:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   CORS_ORIGIN=http://localhost:5173
   ```

5. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The API will start running at `http://localhost:5000`.*

---

### Frontend Setup

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` variables:
   ```env
   VITE_TMDB_API_KEY=your_tmdb_api_key_here
   VITE_API_BASE_URL=http://localhost:5000
   ```

5. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The application will be accessible at `http://localhost:5173`.*

---

## License

This project is open-source and intended for educational and portfolio purposes.