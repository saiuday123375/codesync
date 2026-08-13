import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { Code2, Zap, Terminal, MessageSquare, ShieldCheck, ArrowRight } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-200 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center bg-[#252526] border border-gray-800 rounded-2xl p-6 lg:p-10 shadow-2xl overflow-hidden relative">
        
        {/* Glow Background Elements */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Left Side: Branding & Features Showcase */}
        <div className="space-y-6 pr-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-gray-800 pb-6 lg:pb-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-wider text-white">CodeSync</span>
          </div>

          <div>
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight mb-3">
              Welcome Back to <br />
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
                Collaborative Coding
              </span>
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Log in to access your shared coding rooms, continue real-time pair programming, and run code instantly in the cloud.
            </p>
          </div>

          {/* Feature Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="flex items-start space-x-3 bg-[#1e1e1e]/60 border border-gray-800 p-3.5 rounded-xl hover:border-gray-700 transition">
              <Zap className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">Live Code Sync</h4>
                <p className="text-xs text-gray-400">Collaborative editing with live cursor movement.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#1e1e1e]/60 border border-gray-800 p-3.5 rounded-xl hover:border-gray-700 transition">
              <Terminal className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">Remote Compiler</h4>
                <p className="text-xs text-gray-400">Execute JS, Python, C++, Java & C instantly.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#1e1e1e]/60 border border-gray-800 p-3.5 rounded-xl hover:border-gray-700 transition">
              <MessageSquare className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">In-Room Chat</h4>
                <p className="text-xs text-gray-400">Integrated team chat & participant presence.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#1e1e1e]/60 border border-gray-800 p-3.5 rounded-xl hover:border-gray-700 transition">
              <ShieldCheck className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">Secure Workspaces</h4>
                <p className="text-xs text-gray-400">JWT security with Redis & Mongo storage.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="pl-0 lg:pl-4">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Sign In</h2>
            <p className="text-xs text-gray-400">Enter your credentials to access your workspaces</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-300">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-700 bg-[#1e1e1e] p-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-300">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-700 bg-[#1e1e1e] p-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 flex items-center justify-center space-x-2 mt-2"
            >
              <span>{isSubmitting ? 'Logging in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium hover:underline">
              Register Now
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
