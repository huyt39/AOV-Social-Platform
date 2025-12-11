import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, Sword, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '../contexts/authContext';

interface LoginFormData {
  email: string;
  password: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
}

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string>('');

  // Validation functions
  const validateEmail = (email: string): string | undefined => {
    if (!email) return 'Vui lòng nhập email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ';
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) return 'Vui lòng nhập mật khẩu';
    return undefined;
  };

  // Handle input changes
  const handleInputChange = (field: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== undefined);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        setApiError(result.error || 'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.');
        setIsLoading(false);
        return;
      }

      if (result.token && result.user) {
        login(result.token, result.user);
      }

      window.location.hash = 'feed';
    } catch (error) {
      console.error('Login error:', error);
      setApiError('Có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gold-500 blur-md opacity-50"></div>
              <Sword className="text-gold-400 w-10 h-10 relative z-10 rotate-45" strokeWidth={2.5} />
            </div>
            <h1 className="text-4xl font-display font-bold text-white tracking-wider italic">
              ARENA<span className="text-gold-500 glow-text">HUB</span>
            </h1>
          </div>
          <h2 className="text-2xl font-display font-bold text-white mb-2">ĐĂNG NHẬP</h2>
          <p className="text-slate-400">Chào mừng trở lại, chiến binh!</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-1 rounded-none clip-angled shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="bg-slate-800/50 p-6 clip-angled border-l-2 border-gold-500">

              {/* API Error Message */}
              {apiError && (
                <div className="mb-6 bg-red-900/20 border border-red-500/50 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-bold text-sm mb-1">LỖI ĐĂNG NHẬP</p>
                    <p className="text-red-300 text-sm">{apiError}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full bg-slate-950/50 text-white pl-11 pr-4 py-3 border ${
                      errors.email ? 'border-red-500' : 'border-slate-700'
                    } focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all`}
                    placeholder="email@example.com"
                  />
                </div>
                {errors.email && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`w-full bg-slate-950/50 text-white pl-11 pr-11 py-3 border ${
                      errors.password ? 'border-red-500' : 'border-slate-700'
                    } focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all`}
                    placeholder="Nhập mật khẩu"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gold-500 hover:bg-gold-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 disabled:text-slate-500 font-display font-bold py-3 px-6 clip-hex-button transition-all hover:translate-y-[-2px] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2 mb-4"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    ĐANG XỬ LÝ...
                  </>
                ) : (
                  'ĐĂNG NHẬP'
                )}
              </button>

              {/* Links */}
              <div className="text-center space-y-2">
                <p className="text-slate-400 text-sm">
                  Chưa có tài khoản?{' '}
                  <a href="#register" className="text-gold-400 hover:text-gold-300 font-bold transition-colors">
                    Đăng ký ngay
                  </a>
                </p>
                <a href="#forgot-password" className="text-slate-500 hover:text-slate-400 text-xs transition-colors block">
                  Quên mật khẩu?
                </a>
              </div>
            </div>
          </div>
        </form>

        {/* Footer note */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Bảo mật tài khoản với mã hóa end-to-end
        </p>
      </div>
    </div>
  );
};
