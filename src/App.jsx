import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './screens/Home'
import TranscriptViewer from './screens/TranscriptViewer'
import WordBank from './screens/WordBank'
import WordDetail from './screens/WordDetail'
import Quiz from './screens/Quiz'
import Settings from './screens/Settings'

export default function App() {
  return (
    <>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session/:sessionId" element={<TranscriptViewer />} />
          <Route path="/words" element={<WordBank />} />
          <Route path="/words/:wordId" element={<WordDetail />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <NavBar />
    </>
  )
}
