# Telegram trợ lý quản trị

Vào **Cài đặt → Telegram**. Tạo bot riêng bằng `@BotFather` → `/newbot`, nhập token và địa chỉ website, lưu cấu hình, tạo liên kết xác nhận tài khoản. Mở liên kết trên Telegram và bấm Start. Sau khi kết nối, bật thông báo, lưu lại và gửi tin thử.

Bot chỉ nhận lệnh và nút bấm từ tài khoản đã liên kết trong chat riêng. Tài khoản web thực hiện kết nối phải còn quyền admin. Token được mã hóa AES-256-GCM, không trả về trình duyệt. Khóa mã hóa lấy từ `TELEGRAM_ENCRYPTION_KEY`, hoặc `JWT_SECRET` nếu chưa đặt khóa riêng; cần giữ khóa này cố định qua các lần triển khai. Thay khóa sẽ cần nhập lại token.

## Tính năng

- Lịch sáng, nhắc chuẩn bị, nhắc ghi nhật ký, kế hoạch tuần mới, tổng kết tối và nhắc học phí theo cấu hình. Mọi lịch theo UTC+7.
- Nút mở đúng lớp/ngày/bài/ca học; xác nhận đã chuẩn bị, nhắc sau 15 phút, cập nhật hoàn tất/dạy một phần và nhập nhận xét.
- Mỗi dòng ghi chú kế hoạch là một việc; `/vieccanlam` để hoàn thành hoặc dời đến 08:00 hôm sau. Có thể đánh dấu hoàn thành trên trang cài đặt web.
- `/homnay`, `/tuan`, `/chuacham`, `/hocphi`, `/help`.
- Gửi ảnh hoặc `/nopbai` → chọn lớp → đề/bài tập thuộc lớp → học sinh trong lớp → gửi thêm ảnh → Lưu ảnh. Mỗi lượt tối đa 20 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 10 MB. `/xong` mở lại bước chọn/lưu, `/huy` hủy phiên nhập. Phiên hết hạn sau 30 phút.
- Chấm AI cần xác nhận riêng. Dùng cùng controller chấm trên website, giữ quy tắc đáp án của thầy; phiếu gửi riêng cho thầy, có liên kết mở bản in/PDF trên web. Bot không tự gửi điểm hay tin nhắn cho phụ huynh.

## Vận hành

Backend tự chạy worker sau khi kết nối MongoDB; không cần cron riêng hoặc webhook công khai. Worker kiểm tra Telegram mỗi 15 giây và lên lịch thông báo mỗi phút. Vì dùng `getUpdates`, bot phải không có webhook của hệ thống khác. Máy chủ cần hoạt động liên tục và truy cập được `https://api.telegram.org`.

MongoDB giữ cấu hình, hàng đợi gửi, phiên nhập, nút thao tác và công việc. Lease bảo đảm chỉ một worker xử lý tại một thời điểm nếu chạy nhiều process. Thông báo có khóa chống gửi lặp, thử lại có giãn cách và tôn trọng giới hạn Telegram. Nút có hạn dùng và chỉ chạy một lần. Trước khi gửi nhắc, bot kiểm tra lại trạng thái trên web để bỏ qua buổi/việc đã hoàn thành. Lỗi mạng ngay sau khi Telegram đã nhận tin vẫn có thể gây gửi lặp khi thử lại (Bot API không có idempotency key).

Giờ yên lặng áp dụng cho thông báo tự động; lệnh thầy chủ động gửi vẫn được trả lời. AI do thầy xác nhận có thể chạy trong giờ yên lặng. Tác vụ AI lỗi/gián đoạn không tự chạy lại để tránh chấm và tính phí lặp; kiểm tra web rồi yêu cầu chấm lại. Chưa có Bot Token thì worker không gọi ra Telegram.

Nhắc học phí dựa trên bản ghi tháng hiện tại và cờ `isPaid`; ngày nhắc do thầy chọn, không suy đoán hạn thanh toán. Thông báo bài mới bắt đầu từ thời điểm bật thông báo; các bài cũ vẫn xem được qua `/chuacham`.

## Kiểm thử

```
node --test test/telegram.test.js test/telegram-integration.test.js
```

Kiểm thử tích hợp tạo database `telegram_test_*` riêng trên MongoDB localhost, giả lập Bot API và xóa database thử nghiệm sau khi chạy. Không dùng token thật, không gửi tin thật, không gọi mô hình AI thật.

Tài liệu API: https://core.telegram.org/bots/api
