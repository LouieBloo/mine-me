import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout/AppLayout';
import { MainMenu } from './views/MainMenu/MainMenu';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { SocketProvider } from './contexts/SocketContext';
import { ChatProvider } from './contexts/ChatContext';
import { Auth } from './views/Auth/Auth';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { CharacterSelection } from './views/CharacterSelection/CharacterSelection';
import { HomeView } from './views/HomeView/HomeView';
import { UserProfile } from './views/UserProfile/UserProfile';
import { TestMobView } from './views/TestMobView/TestMobView';
import { CombatView } from './views/CombatView/CombatView';

import { InGameLayout } from './components/InGameLayout/InGameLayout';

import { Toaster } from 'sonner';

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <SocketProvider>
          <ChatProvider>
            <BrowserRouter>
              <Toaster position="top-center" visibleToasts={9} expand={true} richColors closeButton />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<ProtectedRoute />}>
                  <Route path="characters" element={<CharacterSelection />} />
                  <Route element={<AppLayout />}>
                    {/* Views WITH sidebars (in-game) */}
                    <Route element={<InGameLayout />}>
                      <Route index element={<MainMenu />} />
                      <Route path="home" element={<HomeView />} />
                      <Route path="combat" element={<CombatView />} />
                    </Route>
                    
                    {/* Views WITHOUT sidebars (standard UI) */}
                    <Route path="profile" element={<UserProfile />} />
                    <Route path="test-mob" element={<TestMobView />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </ChatProvider>
        </SocketProvider>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
