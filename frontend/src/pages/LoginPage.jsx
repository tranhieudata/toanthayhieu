import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { FiMail, FiLock, FiLogIn } from 'react-icons/fi';
import { FaGoogle, FaFacebook } from 'react-icons/fa';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      login(res.data.token, res.data.user);
      toast.success('Đăng nhập thành công!');
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-bold text-blue-600">Toán Thầy Hiếu</Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-2">Đăng nhập</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input-field pl-9"
                placeholder="email@example.com"
                {...register('email', { required: 'Vui lòng nhập email', pattern: { value: /^\S+@\S+$/i, message: 'Email không hợp lệ' } })}
              />
            </div>
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                className="input-field pl-9"
                placeholder="••••••••"
                {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
              />
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            <FiLogIn /> {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <hr className="flex-1" /><span className="text-gray-400 text-sm">hoặc</span><hr className="flex-1" />
        </div>

        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <FaGoogle className="text-red-500" /> Đăng nhập với Google
          </a>
          <a
            href="/api/auth/facebook"
            className="flex items-center justify-center gap-3 w-full bg-blue-700 text-white rounded-lg px-4 py-2 hover:bg-blue-800 transition-colors text-sm font-medium"
          >
            <FaFacebook /> Đăng nhập với Facebook
          </a>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-blue-600 font-medium hover:underline">Đăng ký ngay</Link>
        </p>
      </div>
    </div>
  );
}
