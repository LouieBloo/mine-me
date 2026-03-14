import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Cities from './pages/Cities';
import Items from './pages/Items';
import Mobs from './pages/Mobs';
import Rates from './pages/Rates';
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
      }
    ]
  }
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
