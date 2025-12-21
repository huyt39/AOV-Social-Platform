import React, { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { AuthUser } from '../contexts/authContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Game role options
const GAME_ROLES = [
    { value: 'TOP', label: 'Đường Caesar' },
    { value: 'JUNGLE', label: 'Rừng' },
    { value: 'MID', label: 'Đường Giữa' },
    { value: 'AD', label: 'Xạ Thủ' },
    { value: 'SUPPORT', label: 'Trợ Thủ' },
];

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser;
    token: string;
    onProfileUpdate: (updatedUser: Partial<AuthUser>) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
    isOpen,
    onClose,
    user,
    token,
    onProfileUpdate,
}) => {
    const [username, setUsername] = useState(user.username);
    const [mainRole, setMainRole] = useState(user.main_role || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setUsername(user.username);
            setMainRole(user.main_role || '');
            setError(null);
        }
    }, [isOpen, user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const updateData: { username?: string; main_role?: string } = {};

            if (username !== user.username) {
                updateData.username = username;
            }
            if (mainRole !== user.main_role) {
                updateData.main_role = mainRole;
            }

            // Only call API if there are changes
            if (Object.keys(updateData).length === 0) {
                onClose();
                return;
            }

            const response = await fetch(`${API_URL}/auth/me/profile`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(updateData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Cập nhật thất bại');
            }

            // Update parent component with new user data
            onProfileUpdate(result.user);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md mx-4 overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-lg font-display font-bold text-white">Chỉnh sửa hồ sơ</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Error message */}
                    {error && (
                        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded text-sm">
                            {error}
                        </div>
                    )}

                    {/* Username field */}
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                            Tên người dùng
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-gold-500 transition-colors"
                            minLength={3}
                            maxLength={50}
                            required
                        />
                    </div>

                    {/* Main Role field */}
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                            Vị trí chính
                        </label>
                        <select
                            value={mainRole}
                            onChange={(e) => setMainRole(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-gold-500 transition-colors"
                        >
                            <option value="">Chọn vị trí</option>
                            {GAME_ROLES.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                            disabled={isLoading}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold rounded transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Đang lưu...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Lưu thay đổi
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
