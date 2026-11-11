# Bài viết tại /new

- `/new`: danh sách bài viết công khai, tìm theo tiêu đề/tóm tắt và lọc chuyên mục.
- `/new/write`: admin soạn bài mới.
- `/new/:slug`: đọc bài viết. Bản nháp chỉ admin xem được.
- `/new/:slug/edit`: admin sửa bài, xuất bản, chuyển về nháp hoặc xóa.
- `/new?manage=true`: admin xem cả bài đã đăng và bản nháp.

Menu quản trị có mục **Bài viết & SEO**. Trình soạn thảo hỗ trợ ảnh tải lên và công thức toán (nút công thức hoặc `$...$`, `$$...$$`). Lưu nháp được phép chưa có nội dung; xuất bản cần tiêu đề và nội dung. Lưu sau khi ảnh tải lên hoàn tất. Bài viết được lưu trong collection `articles` của MongoDB, tách khỏi bài học và khóa học.

Thông tin SEO gồm đường dẫn slug duy nhất, tiêu đề SEO, mô tả SEO, canonical và dữ liệu có cấu trúc Article. Nếu không nhập tiêu đề/mô tả SEO thì dùng tiêu đề/tóm tắt bài viết. Đây là ứng dụng React SPA: metadata được cập nhật khi chạy JavaScript; chưa có SSR/prerender, sitemap hay HTML metadata riêng trong phản hồi ban đầu cho bot chia sẻ mạng xã hội.

API: `GET /api/articles` (tham số `q`, `category`, `page`, `manage`), `GET /api/articles/:slug`; `POST /api/articles`, `PUT /api/articles/:id`, `DELETE /api/articles/:id` yêu cầu token admin. Danh sách tối đa 12 bài/trang và không trả nội dung đầy đủ.

Kiểm tra: `cd frontend && npm run build`; `cd backend && node --test test/articles.test.js`. Kiểm tra API dùng MongoDB local và database tạm có tiền tố `articles_test_`, tự xóa sau khi chạy.
