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
  const { login, signup, loginWithGoogle } = useAuth();
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
      console.error("Auth Error:", err.code, err.message);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. If you signed up with Google, please use the Google button.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use. Try logging in or use the Google button.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with this email but was created using a different sign-in method (like Google). Please sign in using that method.');
      } else {
        setError(err.message || 'Failed to authenticate. Please try again.');
      }
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to authenticate with Google');
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

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-transparent px-2 text-white/30 font-medium">Or continue with</span>
          </div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          type="button"
          className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all flex items-center justify-center gap-3 group transform hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
            />
          </svg>
          <span className="font-semibold text-sm group-hover:text-agri-light transition-colors">Google</span>
        </button>
        
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
