import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { MainMenu } from './views/MainMenu';
import { CityView } from './views/CityView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<MainMenu />} />
          <Route path="city/:id" element={<CityView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
