import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Cities from './pages/Cities/Cities';
import Items from './pages/Items/Items';
import Mobs from './pages/Mobs/Mobs';
import Rates from './pages/Rates/Rates';
import Users from './pages/Users/Users';
import { EntityDetail } from './pages/EntityDetail/EntityDetail';
import './App.css';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
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
        path: "items",
        element: <Items />
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
        path: ":entity/:id",
        element: <EntityDetail />
      }
    ]
  }
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
