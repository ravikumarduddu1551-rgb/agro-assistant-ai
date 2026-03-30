import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import ChatInterface from './pages/ChatInterface';

// Simple wrapper for protected routes
function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/auth" />;
}

function AppRoutes() {
  const { currentUser } = useAuth();
  
  return (
    <Routes>
      <Route 
        path="/auth" 
        element={currentUser ? <Navigate to="/" /> : <Auth />} 
      />
      <Route 
        path="/" 
        element={
          <PrivateRoute>
            <ChatInterface />
          </PrivateRoute>
        } 
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
