# Chế độ giao diện theo tài khoản

Trong **Cài đặt tài khoản → Chế độ giao diện**, chọn **Nền sáng (White mode)** hoặc **Nền tối (Dark mode)**. Có thể đổi nhanh bằng nút mặt trời/mặt trăng ở thanh điều hướng học sinh hoặc thanh trên cùng trang quản trị. Lựa chọn tự lưu; tài khoản cũ mặc định nền sáng.

API `PUT /api/auth/me` nhận `theme: "light" | "dark"`, chỉ cập nhật tài khoản đang đăng nhập. Giá trị lưu trong User và trả về khi đăng nhập hoặc đọc hồ sơ. Không công khai tùy chọn trong danh sách bạn bè. Khi lưu thất bại, giao diện trở lại chế độ đã lưu và báo lỗi.

ThemeProvider đặt `data-theme` ở thẻ html và sử dụng màu dùng chung cho dashboard, cộng đồng, tài khoản, bài tập, lớp học, đề kiểm tra và quản trị. Các màu ảnh, video và màu bút vẽ giữ nguyên. Bản in giữ nền trắng, chữ dễ đọc. Bộ nhớ của từng tab giúp khôi phục màu trước khi tải xong hồ sơ; hồ sơ máy chủ là nguồn cài đặt chính khi đăng nhập lại hoặc chuyển tài khoản.

Kiểm tra: `npm.cmd run test:profile` trong backend; `npm.cmd run test:community` và `npm.cmd run build` trong frontend.
