import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, username);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to authenticate');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center liquid-bg p-4 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-agri-light/10 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="glass-panel w-full max-w-md p-8 md:p-10 rounded-3xl relative z-10 border-t border-l border-white/20 shadow-[0_8px_32px_0_rgba(0,220,130,0.15)]">
        <h2 className="text-4xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-tight mb-8">
          {isLogin ? 'AgroAssistant' : 'Create Account'}
        </h2>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-xl mb-6 text-sm backdrop-blur-md">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div>
              <label className="block text-white/60 text-xs uppercase tracking-wider font-semibold mb-2">Username</label>
              <input 
                type="text" required 
                className="w-full px-5 py-3 glass-input"
                value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="Farmer John"
              />
            </div>
          )}
          <div>
            <label className="block text-white/60 text-xs uppercase tracking-wider font-semibold mb-2">Email</label>
            <input 
              type="email" required 
              className="w-full px-5 py-3 glass-input"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="farmer@example.com"
            />
          </div>
          <div>
            <label className="block text-white/60 text-xs uppercase tracking-wider font-semibold mb-2">Password</label>
            <input 
              type="password" required 
              className="w-full px-5 py-3 glass-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button 
            disabled={loading}
            type="submit" 
            className="w-full py-4 mt-8 bg-gradient-to-r from-agri-light to-emerald-400 hover:from-emerald-400 hover:to-agri-light text-black font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(0,220,130,0.4)] hover:shadow-[0_0_30px_rgba(0,220,130,0.6)] disabled:opacity-50 disabled:shadow-none transform hover:-translate-y-1"
          >
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>
        
        <p className="text-white/50 text-center mt-8 text-sm">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-agri-light font-bold hover:text-white transition-colors"
          >
            {isLogin ? 'Sign up here' : 'Log in here'}
          </button>
        </p>
      </div>
    </div>
  );
}
