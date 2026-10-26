# Cài đặt tài khoản

Mở menu avatar → **Cài đặt tài khoản**, đường dẫn `/account`. Học sinh và admin đều cập nhật được tài khoản của mình. Trang quản trị cũng có liên kết ở cuối thanh bên. Liên kết đổi mật khẩu cũ `/change-password` chuyển đến phần mật khẩu của trang mới.

- **Tên hiển thị:** từ 1–80 ký tự, không chứa ký tự điều khiển hoặc từ khóa bị cấm. Không thay đổi email đăng nhập hay quyền tài khoản. Tên được lưu vào hồ sơ và sử dụng khi hiển thị bài viết, bạn bè, trò chuyện.
- **Avatar:** chọn JPEG, PNG hoặc WebP tối đa 5 MB, xem trước, chọn thay ảnh hoặc gỡ ảnh rồi bấm **Lưu thông tin**. Trình duyệt thu gọn ảnh; backend xác thực loại dữ liệu và lưu trong `backend/uploads/avatars/`. Chỉ ảnh do chức năng này tạo mới được tự dọn khi thay/gỡ; ảnh OAuth và ảnh cũ bên ngoài thư mục được giữ nguyên trên nguồn cũ. Cần sao lưu thư mục avatar cùng dữ liệu. Avatar không dùng hạn mức ảnh bài đăng mạng xã hội.
- **Ngày sinh:** chọn ngày, tháng, năm từ 1900 đến hôm nay theo giờ Việt Nam; có thể xóa để để trống. Lưu dạng ngày `YYYY-MM-DD` để không lệch ngày theo múi giờ. Không đưa ngày sinh vào dữ liệu bảng tin hoặc danh sách bạn bè.
- **Mật khẩu:** nhập mật khẩu hiện tại, mật khẩu mới và xác nhận trên giao diện. Mật khẩu mới tối thiểu 6 ký tự, tối đa 72 byte theo giới hạn bcrypt. Tài khoản OAuth chưa có mật khẩu có thể đặt mật khẩu đầu tiên để đăng nhập bằng email, những lần sau phải nhập mật khẩu hiện tại. Đổi mật khẩu không đăng xuất các phiên đang hoạt động.

API cập nhật hồ sơ `PUT /api/auth/me` yêu cầu đăng nhập, chỉ cho cập nhật tên, ngày sinh và avatar của chính tài khoản. Không nhận thay đổi role, email, mật khẩu hoặc mã người dùng qua API hồ sơ. Mật khẩu dùng API riêng `/api/auth/change-password`. Dữ liệu trả về chỉ có cờ `hasPassword`, không trả mật khẩu hoặc mã băm.

Kiểm tra bằng `npm.cmd run test:profile` trong `backend` và `npm.cmd run build` trong `frontend`. Kiểm thử profile tạo database riêng `profile_test_<timestamp>_<pid>` trên MongoDB local và chỉ dọn database cùng ảnh của lần kiểm thử đó.
