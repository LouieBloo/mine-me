import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout/AppLayout';
import { MainMenu } from './views/MainMenu/MainMenu';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { Auth } from './views/Auth/Auth';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { CharacterSelection } from './views/CharacterSelection/CharacterSelection';
import { HomeView } from './views/HomeView/HomeView';
import { UserProfile } from './views/UserProfile/UserProfile';

import { InGameLayout } from './components/InGameLayout/InGameLayout';

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute />}>
              <Route path="characters" element={<CharacterSelection />} />
              <Route element={<AppLayout />}>
                {/* Views WITH sidebars (in-game) */}
                <Route element={<InGameLayout />}>
                  <Route index element={<MainMenu />} />
                  <Route path="home" element={<HomeView />} />
                </Route>
                
                {/* Views WITHOUT sidebars (standard UI) */}
                <Route path="profile" element={<UserProfile />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
