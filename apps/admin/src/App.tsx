import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Cities from './pages/Cities/Cities';
import CityDetail from './pages/Cities/CityDetail';
import Items from './pages/Items/Items';
import Mobs from './pages/Mobs/Mobs';
import Rates from './pages/Rates/Rates';
import Users from './pages/Users/Users';
import Login from './pages/Login/Login';
import Inventory from './pages/Inventory/Inventory';
import { EntityDetail } from './pages/EntityDetail/EntityDetail';
import MobDetail from './pages/Mobs/MobDetail';
import ItemDetail from './pages/Items/ItemDetail/ItemDetail';
import MapEditor from './pages/MapEditor/MapEditor';
import CharacterLevel from './pages/CharacterLevel/CharacterLevel';
import CharacterEditor from './pages/CharacterEditor/CharacterEditor';
import MobViewer from './pages/MobViewer/MobViewer';
import Effects from './pages/Effects/Effects';
import EffectDetail from './pages/Effects/EffectDetail';
import ParticleEffects from './pages/ParticleEffects/ParticleEffects';
import ParticleEffectDetail from './pages/ParticleEffects/ParticleEffectDetail/ParticleEffectDetail';
import Blocks from './pages/Blocks/Blocks';
import BlockDetail from './pages/Blocks/BlockDetail/BlockDetail';
import Fluids from './pages/Fluids/Fluids';
import FluidDetail from './pages/Fluids/FluidDetail/FluidDetail';
import Gases from './pages/Gases/Gases';
import GasDetail from './pages/Gases/GasDetail/GasDetail';
import Biomes from './pages/Biomes/Biomes';
import BiomeDetail from './pages/Biomes/BiomeDetail/BiomeDetail';
import Extractors from './pages/Extractors/Extractors';
import ExtractorDetail from './pages/Extractors/ExtractorDetail/ExtractorDetail';
import ItemWeights from './pages/ItemWeights/ItemWeights';
import MiningConfig from './pages/MiningConfig/MiningConfig';
import Music from './pages/Music/Music';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import './App.css';

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />
      },
      {
        path: "cities",
        element: <Cities />
      },
      {
        path: "cities/:id",
        element: <CityDetail />
      },
      {
        path: "items",
        element: <Items />
      },
      {
        path: "effects",
        element: <Effects />
      },
      {
        path: "effects/:id",
        element: <EffectDetail />
      },
      {
        path: "particle-effects",
        element: <ParticleEffects />
      },
      {
        path: "particle-effects/:id",
        element: <ParticleEffectDetail />
      },
      {
        path: "blocks",
        element: <Blocks />
      },
      {
        path: "blocks/:id",
        element: <BlockDetail />
      },
      {
        path: "fluids",
        element: <Fluids />
      },
      {
        path: "fluids/:id",
        element: <FluidDetail />
      },
      {
        path: "gases",
        element: <Gases />
      },
      {
        path: "gases/:id",
        element: <GasDetail />
      },
      {
        path: "biomes",
        element: <Biomes />
      },
      {
        path: "biomes/:id",
        element: <BiomeDetail />
      },
      {
        path: "extractors",
        element: <Extractors />
      },
      {
        path: "extractors/:id",
        element: <ExtractorDetail />
      },
      {
        path: "item-weights",
        element: <ItemWeights />
      },
      {
        path: "mining-config",
        element: <MiningConfig />
      },
      {
        path: "music",
        element: <Music />
      },
      {
        path: "mobs",
        element: <Mobs />
      },
      {
        path: "mob-viewer",
        element: <MobViewer />
      },
      {
        path: "character-editor",
        element: <CharacterEditor />
      },
      {
        // The page used to be called the Character Viewer
        path: "character-viewer",
        element: <Navigate to="/character-editor" replace />
      },
      {
        path: "rates",
        element: <Rates />
      },
      {
        path: "users",
        element: <Users />
      },
      {
        path: "character-levels",
        element: <CharacterLevel />
      },
      {
        path: "inventory-items",
        element: <Inventory />
      },
      {
        path: "mobs/:id",
        element: <MobDetail />
      },
      {
        path: "items/:id",
        element: <ItemDetail />
      },
      {
        path: "map-editor",
        element: <MapEditor />
      },
      {
        path: ":entity/:id",
        element: <EntityDetail />
      }
    ]
  }
]);

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
