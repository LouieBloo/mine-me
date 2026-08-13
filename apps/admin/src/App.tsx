import { RouterProvider, createBrowserRouter } from 'react-router-dom';
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
import Effects from './pages/Effects/Effects';
import EffectDetail from './pages/Effects/EffectDetail';
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
        path: "mobs",
        element: <Mobs />
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
