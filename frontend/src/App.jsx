import "./App.css"
import HomePage from './pages/HomePage'
import {lazy, Suspense} from "react"
import {BrowserRouter, Routes, Route} from "react-router-dom"

// Route-level code splitting: the initial bundle only carries the home page.
// Each other route is fetched on first visit (and cached by the browser).
const MovieDetails = lazy(() => import("./pages/MovieDetails"))
const AddMovies = lazy(() => import("./pages/AddMovies"))
const EpisodePage = lazy(() => import("./pages/EpisodePage"))

const App = () => {
  const page = (element) => <Suspense fallback={null}>{element}</Suspense>

  return (
    <BrowserRouter>
    <Routes>
      <Route path='/' element={<HomePage/>}></Route>
      <Route path='/movie-details/:id' element={page(<MovieDetails/>)}></Route>
      <Route path='/AddMovies' element={page(<AddMovies/>)}></Route>
      <Route path='/series/:movieId/season/:seasonNum' element={page(<EpisodePage/>)}></Route>
    </Routes>
    </BrowserRouter>
  )
}

export default App
