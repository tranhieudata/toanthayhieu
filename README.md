# EduOnline - Nền tảng học trực tuyến

## Cấu trúc dự án

```
toanthayhieu/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── config/   # DB & Passport config
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/   # Mongoose models
│   │   ├── routes/
│   │   └── index.js
│   ├── .env
│   └── package.json
└── frontend/         # React + Vite + Tailwind CSS
    ├── src/
    │   ├── api/
    │   ├── components/
    │   ├── context/
    │   └── pages/
    │       └── admin/
    └── package.json
```

## Cài đặt

### Yêu cầu
- Node.js >= 18
- MongoDB (local hoặc MongoDB Atlas)
- Google OAuth credentials
- Facebook App credentials

### Backend

```bash
cd backend
npm install
```

Cấu hình file `.env` với thông tin thực:
- `MONGODB_URI` - chuỗi kết nối MongoDB
- `JWT_SECRET` - khóa bí mật JWT
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - [Google Cloud Console](https://console.cloud.google.com)
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` - [Facebook Developers](https://developers.facebook.com)

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Tính năng

### Người dùng
- Đăng ký / Đăng nhập bằng email, Google, Facebook
- Xem danh sách khóa học (tìm kiếm, lọc)
- Đăng ký học khóa học
- Xem bài học (video + nội dung)
- Làm bài tập trắc nghiệm
- Dashboard theo dõi tiến độ

### Admin
- Tổng quan thống kê
- Quản lý khóa học (CRUD)
- Đăng bài học với video
- Tạo bài tập trắc nghiệm
- Quản lý học sinh (xem, khóa, xóa)
- Quản lý lớp học + lịch học

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | /api/auth/register | Đăng ký |
| POST | /api/auth/login | Đăng nhập |
| GET | /api/auth/google | OAuth Google |
| GET | /api/auth/facebook | OAuth Facebook |
| GET | /api/courses | Lấy danh sách khóa học |
| POST | /api/courses | Tạo khóa học (admin) |
| GET | /api/lessons | Lấy bài học |
| POST | /api/exercises/:id/submit | Nộp bài tập |
| GET | /api/classes | Lấy danh sách lớp học |
| GET | /api/users | Quản lý người dùng (admin) |

## Cài đặt Google OAuth

1. Vào [Google Cloud Console](https://console.cloud.google.com)
2. Tạo project mới → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
5. Copy Client ID và Secret vào `.env`

## Cài đặt Facebook OAuth

1. Vào [Facebook Developers](https://developers.facebook.com)
2. Tạo app mới → Facebook Login
3. Valid OAuth Redirect URI: `http://localhost:5000/api/auth/facebook/callback`
4. Copy App ID và Secret vào `.env`

## Tạo tài khoản Admin

Sau khi đăng ký tài khoản bình thường, mở MongoDB Compass hoặc shell và cập nhật:
```js
db.users.updateOne({ email: "your@email.com" }, { $set: { role: "admin" } })
```
