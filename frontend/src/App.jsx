import "./App.css"
import HomePage from './pages/HomePage'
import MovieDetails from "./pages/MovieDetails"
import AddMovies from './pages/AddMovies'
import EpisodePage from './pages/EpisodePage'
import {BrowserRouter, Routes, Route} from "react-router-dom"

const App = () => {
  return (
    <BrowserRouter>
    <Routes>
      <Route path='/' element={<HomePage/>}></Route>
      <Route path='/movie-details/:id' element={<MovieDetails/>}></Route>
      <Route path='/AddMovies' element={<AddMovies/>}></Route>
      <Route path='/series/:movieId/season/:seasonNum' element={<EpisodePage/>}></Route>
    </Routes>
    </BrowserRouter>
  )
}

export default App