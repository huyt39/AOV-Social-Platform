import React, { useState } from 'react';
import { Upload, Eye, EyeOff, Shield, User as UserIcon, Mail, Lock, Sword, Trophy, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { Rank, Role } from '../types';

interface FormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  mainRole: string;
  profileScreenshot: File | null;
}

interface ValidationErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  mainRole?: string;
  profileScreenshot?: string;
}

interface VerifiedData {
  level: number;
  rank: string;
  total_matches: number;
  win_rate: number;
  credibility_score: number;
  verified_at: string;
  screenshot_url: string;
}

export const Register: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    mainRole: '',
    profileScreenshot: null,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [apiError, setApiError] = useState<string>('');

  // Validation functions
  const validateUsername = (username: string): string | undefined => {
    if (!username) return 'Vui lòng nhập tên người dùng';
    if (username.length < 3) return 'Tên người dùng phải có ít nhất 3 ký tự';
    if (username.length > 20) return 'Tên người dùng không được quá 20 ký tự';
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Tên người dùng chỉ được chứa chữ, số và dấu gạch dưới';
    return undefined;
  };

  const validateEmail = (email: string): string | undefined => {
    if (!email) return 'Vui lòng nhập email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ';
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) return 'Vui lòng nhập mật khẩu';
    if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!/[A-Z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ hoa';
    if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất 1 số';
    return undefined;
  };

  const validateConfirmPassword = (password: string, confirmPassword: string): string | undefined => {
    if (!confirmPassword) return 'Vui lòng xác nhận mật khẩu';
    if (password !== confirmPassword) return 'Mật khẩu xác nhận không khớp';
    return undefined;
  };

  const validateFile = (file: File | null): string | undefined => {
    if (!file) return 'Vui lòng tải lên ảnh hồ sơ game';

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) return 'Chỉ chấp nhận file JPG hoặc PNG';

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) return 'Kích thước file không được vượt quá 5MB';

    return undefined;
  };

  // Handle input changes
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field as keyof ValidationErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;

    if (file) {
      const error = validateFile(file);
      if (error) {
        setErrors(prev => ({ ...prev, profileScreenshot: error }));
        return;
      }

      setFormData(prev => ({ ...prev, profileScreenshot: file }));

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Clear error
      setErrors(prev => ({ ...prev, profileScreenshot: undefined }));
    }
  };

  // Validate all fields
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {
      username: validateUsername(formData.username),
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
      confirmPassword: validateConfirmPassword(formData.password, formData.confirmPassword),
      profileScreenshot: validateFile(formData.profileScreenshot),
    };

    if (!formData.mainRole) newErrors.mainRole = 'Vui lòng chọn vị trí chính';

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
      // Step 1: Verify profile screenshot
      const formDataToSend = new FormData();
      formDataToSend.append('profile_screenshot', formData.profileScreenshot!);

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

      const verifyResponse = await fetch(`${API_URL}/auth/verify-profile`, {
        method: 'POST',
        body: formDataToSend,
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyResult.success) {
        setApiError(verifyResult.error || 'Không thể xác thực ảnh hồ sơ. Vui lòng thử lại.');
        setIsLoading(false);
        return;
      }

      setVerifiedData(verifyResult.data);

      // Step 2: Register user with verified data
      const registerData = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        rank: verifyResult.data.rank,
        main_role: formData.mainRole,
        level: verifyResult.data.level,
        win_rate: verifyResult.data.win_rate,
        total_matches: verifyResult.data.total_matches,
        credibility_score: verifyResult.data.credibility_score,
        profile_screenshot_url: verifyResult.data.screenshot_url,
      };

      const registerResponse = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
      });

      const registerResult = await registerResponse.json();

      if (!registerResponse.ok) {
        setApiError(registerResult.error || 'Đăng ký thất bại. Vui lòng thử lại.');
        setIsLoading(false);
        return;
      }

      // Success
      setRegistrationSuccess(true);
    } catch (error) {
      console.error('Registration error:', error);
      setApiError('Có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render roles dropdown options
  const renderRoleOptions = () => {
    return Object.entries(Role).map(([key, value]) => (
      <option key={key} value={key}>
        {value}
      </option>
    ));
  };

  // Success screen
  if (registrationSuccess && verifiedData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-900/80 backdrop-blur border border-green-500/50 p-1 rounded-none clip-angled shadow-[0_0_30px_rgba(34,197,94,0.3)]">
            <div className="bg-slate-800/50 p-8 clip-angled border-l-2 border-green-500">
              {/* Decorative corners */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-500"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-500"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-500"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-500"></div>

              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full border-2 border-green-500 mb-4">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                </div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">
                  ĐĂNG KÝ THÀNH CÔNG!
                </h2>
                <p className="text-slate-400">Chào mừng bạn đến với ArenaHub</p>
              </div>

              {/* Verified Profile Info */}
              <div className="bg-slate-950/50 border border-slate-700 p-6 mb-6">
                <h3 className="text-gold-400 font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  THÔNG TIN ĐÃ XÁC THỰC
                </h3>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Rank</p>
                    <p className="text-white font-bold">{verifiedData.rank}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Cấp độ</p>
                    <p className="text-white font-bold">Level {verifiedData.level}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Tổng số trận</p>
                    <p className="text-white font-bold">{verifiedData.total_matches.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Tỷ lệ thắng</p>
                    <p className="text-white font-bold">{verifiedData.win_rate}%</p>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Uy tín</p>
                    <p className="text-white font-bold">{verifiedData.credibility_score}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase text-xs mb-1">Rank</p>
                    <p className="text-white font-bold">{verifiedData.rank}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => window.location.hash = 'login'}
                className="w-full bg-gold-500 hover:bg-gold-400 text-slate-950 font-display font-bold py-3 px-6 clip-hex-button transition-all hover:translate-y-[-2px] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
              >
                ĐĂNG NHẬP NGAY
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-4xl w-full">
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
          <h2 className="text-2xl font-display font-bold text-white mb-2">ĐĂNG KÝ TÀI KHOẢN</h2>
          <p className="text-slate-400">Tham gia cộng đồng game thủ Liên Quân Mobile</p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-1 rounded-none clip-angled shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="bg-slate-800/50 p-6 md:p-8 clip-angled border-l-2 border-gold-500">

              {/* API Error Message */}
              {apiError && (
                <div className="mb-6 bg-red-900/20 border border-red-500/50 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-bold text-sm mb-1">LỖI ĐĂNG KÝ</p>
                    <p className="text-red-300 text-sm">{apiError}</p>
                  </div>
                </div>
              )}

              {/* Basic Info Section */}
              <div className="mb-8">
                <h3 className="text-gold-400 font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <UserIcon className="w-5 h-5" />
                  THÔNG TIN CƠ BẢN
                </h3>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Username */}
                  <div>
                    <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                      Tên người dùng *
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        className={`w-full bg-slate-950/50 text-white pl-11 pr-4 py-3 border ${
                          errors.username ? 'border-red-500' : 'border-slate-700'
                        } focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all`}
                        placeholder="vd: ProGamerVN"
                      />
                    </div>
                    {errors.username && (
                      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.username}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                      Email *
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
                  <div>
                    <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                      Mật khẩu *
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
                        placeholder="Tối thiểu 8 ký tự"
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

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                      Xác nhận mật khẩu *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                        className={`w-full bg-slate-950/50 text-white pl-11 pr-11 py-3 border ${
                          errors.confirmPassword ? 'border-red-500' : 'border-slate-700'
                        } focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all`}
                        placeholder="Nhập lại mật khẩu"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Game Profile Section */}
              <div className="mb-8">
                <h3 className="text-gold-400 font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  HỒ SƠ GAME
                </h3>

                {/* Main Role */}
                <div className="mb-6">
                  <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                    Vị trí chính *
                  </label>
                  <div className="relative">
                    <Sword className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 z-10" />
                    <select
                      value={formData.mainRole}
                      onChange={(e) => handleInputChange('mainRole', e.target.value)}
                      className={`w-full bg-slate-950/50 text-white pl-11 pr-4 py-3 border ${
                        errors.mainRole ? 'border-red-500' : 'border-slate-700'
                      } focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all appearance-none cursor-pointer`}
                    >
                      <option value="">-- Chọn vị trí --</option>
                      {renderRoleOptions()}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-400"></div>
                    </div>
                  </div>
                  {errors.mainRole && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.mainRole}
                    </p>
                  )}
                </div>

                {/* Profile Screenshot Upload */}
                <div>
                  <label className="block text-slate-300 text-sm font-bold mb-2 uppercase tracking-wider">
                    Ảnh hồ sơ game *
                    <span className="text-slate-500 text-xs font-normal ml-2">(Chụp màn hình hồ sơ trong game)</span>
                  </label>

                  <div className={`border-2 border-dashed ${
                    errors.profileScreenshot ? 'border-red-500' : 'border-slate-600'
                  } bg-slate-950/30 p-6 transition-all hover:border-gold-500/50 cursor-pointer relative`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />

                    {previewUrl ? (
                      <div className="flex flex-col items-center">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="max-h-64 object-contain mb-4 border border-slate-700"
                        />
                        <p className="text-slate-400 text-sm">
                          {formData.profileScreenshot?.name}
                          <span className="text-slate-600 ml-2">
                            ({(formData.profileScreenshot!.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </p>
                        <p className="text-gold-400 text-xs mt-2">Click để thay đổi ảnh</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <Upload className="w-12 h-12 text-slate-500 mb-3" />
                        <p className="text-slate-300 font-bold mb-1">
                          Tải lên ảnh hồ sơ game
                        </p>
                        <p className="text-slate-500 text-sm mb-2">
                          Kéo thả hoặc click để chọn file
                        </p>
                        <p className="text-slate-600 text-xs">
                          JPG, PNG • Tối đa 5MB
                        </p>
                      </div>
                    )}
                  </div>

                  {errors.profileScreenshot && (
                    <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.profileScreenshot}
                    </p>
                  )}

                  {/* Info box */}
                  <div className="mt-4 bg-blue-900/20 border border-blue-500/30 p-3 flex gap-3">
                    <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="text-sm text-blue-300">
                      <p className="font-bold mb-1">Xác thực hồ sơ tự động</p>
                      <p className="text-blue-400/80 text-xs">
                        Hệ thống sẽ tự động trích xuất thông tin từ ảnh: <strong>Rank, Level, Số trận, Tỷ lệ thắng, Uy tín</strong>.
                        Vui lòng chụp rõ các thông tin này.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex flex-col gap-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gold-500 hover:bg-gold-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 disabled:text-slate-500 font-display font-bold py-4 px-6 clip-hex-button transition-all hover:translate-y-[-2px] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      ĐANG XỬ LÝ...
                    </>
                  ) : (
                    'ĐĂNG KÝ'
                  )}
                </button>

                <p className="text-center text-slate-400 text-sm">
                  Đã có tài khoản?{' '}
                  <a href="#login" className="text-gold-400 hover:text-gold-300 font-bold transition-colors">
                    Đăng nhập ngay
                  </a>
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer note */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Bằng việc đăng ký, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật của ArenaHub
        </p>
      </div>
    </div>
  );
};
