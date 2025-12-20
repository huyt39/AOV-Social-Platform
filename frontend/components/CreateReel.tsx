import React, { useState, useRef } from 'react';
import { Upload, X, FileVideo, Loader, CheckCircle, AlertCircle } from 'lucide-react';

interface CreateReelProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateReel: React.FC<CreateReelProps> = ({ onClose, onSuccess }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [caption, setCaption] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Vui lòng chọn file video');
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      setError('File video quá lớn. Tối đa 100MB');
      return;
    }

    setVideoFile(file);
    setError('');

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleSubmit = async () => {
    if (!videoFile) {
      setError('Vui lòng chọn video');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Chưa đăng nhập');
      }

      // Step 1: Request video upload URL
      setUploadProgress(10);
      const initResponse = await fetch(`${API_URL}/videos/upload-request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: videoFile.name,
          content_type: videoFile.type,
        }),
      });

      if (!initResponse.ok) {
        throw new Error('Không thể khởi tạo upload');
      }

      const initData = await initResponse.json();
      const { video_id, upload_url } = initData;

      // Step 2: Upload video to S3
      setUploadProgress(30);
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: videoFile,
        headers: {
          'Content-Type': videoFile.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Không thể upload video');
      }

      // Step 3: Mark upload complete
      setUploadProgress(60);
      await fetch(`${API_URL}/videos/${video_id}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Step 4: Create reel
      setUploadProgress(80);
      const reelResponse = await fetch(`${API_URL}/reels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_id: video_id,
          caption: caption || undefined,
        }),
      });

      if (!reelResponse.ok) {
        const errorData = await reelResponse.json();
        throw new Error(errorData.detail || 'Không thể tạo reel');
      }

      setUploadProgress(100);
      setSuccess(true);

      // Close after 2 seconds
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-gold-400 flex items-center gap-2">
            <FileVideo className="w-6 h-6" />
            Tạo Reel Mới
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
            disabled={isUploading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Video Upload Area */}
          <div>
            <label className="block text-slate-300 text-sm font-bold mb-3">
              Video *
            </label>

            {!videoFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 rounded-xl p-12 text-center cursor-pointer hover:border-gold-500 transition bg-slate-950/30"
              >
                <Upload className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                <p className="text-slate-300 font-medium mb-2">
                  Click để chọn video
                </p>
                <p className="text-slate-500 text-sm">
                  MP4, MOV, AVI • Tối đa 100MB • Tỷ lệ 9:16 (vertical) tốt nhất
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="relative border border-slate-700 rounded-xl overflow-hidden bg-black">
                <video
                  src={previewUrl}
                  controls
                  className="w-full max-h-96 object-contain"
                />
                <button
                  onClick={() => {
                    setVideoFile(null);
                    setPreviewUrl('');
                  }}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Mô tả (Caption)
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Viết mô tả cho reel của bạn..."
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 transition resize-none"
              rows={3}
              maxLength={500}
              disabled={isUploading}
            />
            <p className="text-slate-500 text-xs mt-1">
              {caption.length}/500 ký tự
            </p>
          </div>



          {/* Progress Bar */}
          {isUploading && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300 text-sm font-medium">
                  Đang upload...
                </span>
                <span className="text-gold-400 text-sm font-bold">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-gold-500 to-amber-500 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-500/10 border border-green-500 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <p className="text-green-400 font-medium">
                Upload thành công! Reel của bạn đang được xử lý...
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition"
            disabled={isUploading}
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={!videoFile || isUploading || success}
            className="px-8 py-3 bg-gradient-to-r from-gold-500 to-amber-500 text-black rounded-lg font-bold hover:from-gold-600 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Đang upload...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Hoàn thành!
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Đăng Reel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

