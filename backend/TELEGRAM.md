# Telegram trợ lý quản trị

Vào **Cài đặt → Telegram**. Tạo bot riêng bằng `@BotFather` → `/newbot`, nhập token và địa chỉ website, lưu cấu hình, tạo liên kết xác nhận tài khoản. Mở liên kết trên Telegram và bấm Start. Sau khi kết nối, bật thông báo, lưu lại và gửi tin thử.

Bot thực hiện đầy đủ lệnh và nút quản trị trong chat riêng và nhóm đã liên kết, chỉ chấp nhận tài khoản Telegram đã xác nhận. Tài khoản web thực hiện kết nối phải còn quyền admin. Token được mã hóa AES-256-GCM, không trả về trình duyệt. Khóa mã hóa lấy từ `TELEGRAM_ENCRYPTION_KEY`, hoặc `JWT_SECRET` nếu chưa đặt khóa riêng; cần giữ khóa này cố định qua các lần triển khai. Thay khóa sẽ cần nhập lại token.

## Gửi thông báo vào nhóm

Trong **Cài đặt → Telegram → Nơi nhận thông báo tự động**:

1. Thêm bot vào nhóm và đặt làm quản trị viên. Tài khoản Telegram riêng đã liên kết với web cũng cần là chủ nhóm hoặc quản trị viên của nhóm.
2. Bấm **Tạo mã kết nối nhóm**, sao chép lệnh `/connectgroup@ten_bot <mã>` rồi gửi vào nhóm bằng chính tài khoản đã liên kết. Mã dùng một lần và hết hạn sau 10 phút. Nếu dùng nhóm có chủ đề (forum), gửi lệnh ngay trong chủ đề muốn nhận thông báo.
3. Sau khi xác nhận thành công, bật **Gửi thông báo tự động vào nhóm**, chọn loại thông báo và lưu cấu hình. Có nút gửi thử và ngắt kết nối nhóm riêng.

Nếu Telegram báo **“You already in the group”**, bot đã ở trong nhóm nên không cần thêm lại bằng liên kết `startgroup`. Trên website bấm **Tạo mã kết nối nhóm** → **Sao chép lệnh xác nhận nhóm**, mở nhóm hiện có và dán gửi lệnh đó bằng tài khoản đã liên kết. Bước thêm bot chỉ cần cho nhóm chưa có bot; liên kết website được xác nhận qua lệnh `/connectgroup`, không phải nút thêm bot.

Có thể bật chat riêng, nhóm hoặc cả hai. Nút bật/tắt nơi nhận lưu ngay. Loại thông báo nhóm được lọc thêm bởi các công tắc thông báo chung; bài làm/học phí trong nhóm mặc định tắt. Thông báo có thể chứa thông tin quản trị nội bộ, nên chỉ chọn các mục phù hợp với thành viên nhóm.

Nhóm hỗ trợ tất cả lệnh, nhận ảnh, nút công việc, cập nhật trạng thái/nhận xét, tóm tắt và lưu nhật ký, xác nhận chấm AI và xem phiếu kết quả. Gõ `/help` (hoặc `/help@ten_bot`) trong nhóm để xem lệnh. Chỉ tài khoản Telegram đã liên kết được thực hiện; thành viên khác không được dùng nút quản trị. Bot bỏ qua trao đổi thông thường trong nhóm, lệnh gửi cho bot khác và nhóm chưa liên kết.

Kết quả và lỗi trả về ngay tại chat/chủ đề nơi thầy yêu cầu. Phiên nhận ảnh, ghi nhận xét và bản nháp tóm tắt được tách theo chat, chủ đề, tài khoản và lần liên kết nhóm; không ghi nhầm sang phiên chat riêng. Nút bấm ràng buộc với đúng nhóm/chủ đề và người quản trị. Các tác vụ AI/tóm tắt giữ nguyên nơi nhận kể cả xử lý sau; hoạt động khi tắt thông báo nhóm tự động, miễn trợ lý vẫn bật và nhóm vẫn liên kết. Ngắt nhóm hủy tác vụ còn chờ và xóa phiên nhóm; không ảnh hưởng phiên riêng.

Mỗi nơi nhận có hàng đợi và khóa chống lặp riêng; thử lại nhóm bị lỗi không gửi lại tin đã thành công trong chat riêng. Bot chưa được liên kết nhóm sẽ không gửi vào nhóm nào.

## Tính năng

- Lịch sáng, nhắc chuẩn bị, nhắc ghi nhật ký, kế hoạch tuần mới, tổng kết tối và nhắc học phí theo cấu hình. Mọi lịch theo UTC+7.
- Nút mở đúng lớp/ngày/bài/ca học; xác nhận đã chuẩn bị, nhắc sau 15 phút, cập nhật hoàn tất/dạy một phần và nhập nhận xét.
- Mỗi dòng ghi chú kế hoạch là một việc; `/vieccanlam` để hoàn thành hoặc dời đến 08:00 hôm sau. Có thể đánh dấu hoàn thành trên trang cài đặt web.
- `/homnay`, `/tuan`, `/chuacham`, `/hocphi`, `/help`.
- `/tomtat` → chọn buổi → bot tạo bản nháp từ đúng bài học và link bài tập. Có thể sửa bằng tin nhắn rồi chọn **Lưu buổi dạy**, **Lưu & đã dạy xong** hoặc **Lưu & dạy một phần**. `/luubuoi` mở luồng nhập/lưu thủ công. Thêm ngày để chọn buổi khác, ví dụ `/tomtat 04/11/2026` hoặc `/luubuoi 2026-11-04`.
- Tóm tắt chỉ được lưu vào `TeachingSession.summary` khi thầy bấm lưu. Giữ đúng lớp, ngày, ca và bài học; tạo buổi còn thiếu hoặc cập nhật buổi có sẵn. Bản nháp hết hạn sau 30 phút; nút bản cũ bị vô hiệu khi đã sửa nội dung. Nếu nhật ký vừa được chỉnh trên web, bot báo xung đột thay vì ghi đè. `/huy` hủy bản nháp và kết quả sinh muộn sẽ bị bỏ qua.
- Gửi ảnh hoặc `/nopbai` → chọn lớp → đề/bài tập thuộc lớp → học sinh trong lớp → gửi thêm ảnh → Lưu ảnh. Mỗi lượt tối đa 20 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 10 MB. `/xong` mở lại bước chọn/lưu, `/huy` hủy phiên nhập. Phiên hết hạn sau 30 phút.
- Chấm AI cần xác nhận. Dùng cùng controller chấm trên website, giữ quy tắc đáp án của thầy; phiếu trả về đúng chat/nhóm/chủ đề yêu cầu, có liên kết mở bản in/PDF trên web. Bot không tự gửi điểm hay tin nhắn cho phụ huynh khác.

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
