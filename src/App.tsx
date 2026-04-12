import { Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import MockAnthropicDesign from './mocks/MockAnthropicDesign'
import MockDesignReview from './mocks/MockDesignReview'
import MockDarkTs from './mocks/MockDarkTs'
import MockFrontendDev from './mocks/MockFrontendDev'
import { StructuredGameReviewPage } from './pages/StructuredGameReviewPage'
import { GameReviewPage } from './pages/GameReviewPage'
import { AddGamePage } from './pages/AddGamePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/review" element={<StructuredGameReviewPage />} />
      <Route path="/addgame" element={<AddGamePage />} />
      <Route path="/g/:slug" element={<GameReviewPage />} />
      <Route path="/mock/anthropic-design" element={<MockAnthropicDesign />} />
      <Route path="/mock/design-review" element={<MockDesignReview />} />
      <Route path="/mock/dark-typescript-ui" element={<MockDarkTs />} />
      <Route path="/mock/frontend-dev-studio" element={<MockFrontendDev />} />
    </Routes>
  )
}
