# Cộng đồng học tập

## Truy cập

- Học sinh: ô **Tin học tập** trên dashboard hoặc menu **Mạng xã hội**, đường dẫn `/community`.
- Admin: **Cộng đồng & thử thách**, đường dẫn `/admin/community`.
- Dữ liệu lưu MongoDB; không cần thêm biến môi trường hoặc thư viện. Các collection và index Mongoose được tạo khi chạy backend.

## Cấu hình năng lượng

Tại `/admin/community`, mục **Điểm thưởng & chi phí năng lượng** cho phép admin đặt riêng mức thưởng nộp bài, ảnh học tập được duyệt, giúp bạn, mỗi câu ôn tập đúng, mỗi câu thử thách đúng, thắng đấu trường; đồng thời đặt phí tự luyện 10 câu và giá từng quà đổi. Giá trị là số nguyên từ 0 đến 100.000; 0 nghĩa là không thưởng hoặc miễn phí. Các mức số ở phần hướng dẫn bên dưới là mặc định ban đầu.

Máy chủ lưu cấu hình trong `CommunityPolicy.energySettings` và áp dụng khi xử lý hành động. Không tính lại điểm đã nhận; khóa nhận thưởng một lần vẫn giữ khi mức thưởng bằng 0. Mức thưởng đấu trường được chốt khi tạo phòng, điểm ôn tập được chốt khi nộp bài và giữ nguyên khi gửi lại yêu cầu. Phí tự luyện được ghi nhận cùng lượt luyện. Tài khoản học sinh chỉ đọc cấu hình, không được sửa; API cập nhật là `PUT /api/community/admin/energy`.

## Bảng tin, chat và kiểm duyệt

Bài viết và Tin có chữ được kiểm tra từ khóa tại backend trước khi lưu. Tin hết hiển thị sau 24 giờ kể từ khi đăng. Ba tương tác tích cực là Cổ vũ, Thả tim, Hữu ích; mỗi người có một tương tác trên mỗi bài và có thể đổi loại. Bấm tên/avatar để mở tường của bạn.

Ảnh JPEG/PNG/WebP tối đa 5 MB được lưu trong `backend/community-uploads/`, tách khỏi thư mục upload công khai. Trước khi admin duyệt, chỉ người đăng và admin đọc được ảnh. Admin kiểm tra ảnh học tập, từ chối nội dung không phù hợp; bài bị gỡ cũng mất quyền đọc ảnh đối với người khác. Cần sao lưu thư mục này cùng MongoDB. Tin hết hạn và ảnh bị gỡ vẫn lưu để quản lý, chưa có tác vụ xóa vật lý định kỳ.

Bộ lọc dùng danh sách từ/cụm từ admin cấu hình, xử lý viết hoa, phiên bản không dấu và một số cách chèn ký tự. Bộ lọc không phân loại ngữ nghĩa hoặc OCR ảnh tự động; ảnh được admin duyệt thủ công. Danh sách mặc định chỉ là điểm bắt đầu, cần bổ sung theo nội quy lớp.

Giờ nghỉ mặc định **22:00–06:00**, theo `Asia/Ho_Chi_Minh`. Admin có thể thay đổi hoặc tắt. Backend chặn đăng bài, Tin, bình luận và chat trong giờ nghỉ; vẫn cho đọc và làm bài. Các thao tác ghi được giới hạn 45 lần/phút/tài khoản.

Admin vào **Cộng đồng & thử thách → Quy định cộng đồng → Giới hạn ảnh mỗi ngày** để bật/tắt, đặt số ảnh từ 0–100 và chọn **Tất cả tài khoản, bao gồm admin** hoặc **Chỉ học sinh**. Mặc định bật 5 ảnh/tài khoản/ngày cho tất cả tài khoản. Đặt 0 để tạm khóa đăng ảnh cho phạm vi đã chọn.

Ảnh bài viết, hỏi bài và Tin 24 giờ dùng chung một hạn mức, tính cả ảnh chờ duyệt, bị từ chối hoặc đã gỡ; xóa bài không hoàn lại lượt. Máy chủ cập nhật số lượt nguyên tử để các yêu cầu gửi đồng thời không vượt hạn mức. Ảnh đăng từ trước khi có giới hạn cũng được tính trong ngày hiện tại. Ảnh không hợp lệ hoặc yêu cầu lưu bài thất bại được trả lại lượt khi xử lý hoàn tác. Ảnh đăng trong lúc tắt giới hạn vẫn được ghi nhận để tính đúng nếu bật lại trong ngày. Bài viết chỉ có chữ và ảnh nộp bài tập không dùng hạn mức mạng xã hội này.

Hạn mức được làm mới lúc **00:00 giờ Việt Nam**. Khung tạo khoảnh khắc hiển thị số ảnh đã đăng và số còn lại; hết lượt sẽ khóa thao tác thêm ảnh, vẫn cho chia sẻ bằng chữ. API `/api/community/image-quota` trả hạn mức của chính tài khoản đăng nhập.

Chat riêng chỉ mở giữa các tài khoản đã chấp nhận kết bạn, bao gồm học sinh và quản trị viên. Mở **Bạn bè** (`/community?tab=friends`) để xem lời mời đã nhận/đã gửi và tìm tài khoản. Kết quả tìm kiếm có nhãn **Quản trị viên** / **Học sinh** để phân biệt người trùng tên. Lời mời gắn với mã tài khoản, không gắn với tên hiển thị; gửi tới học sinh tên Admin sẽ không chuyển sang tài khoản quản trị viên cùng tên. Người nhận có thể **Chấp nhận** hoặc **Từ chối**; người gửi có thể **Thu hồi** lời mời; bạn bè có thể **Hủy kết bạn**. Tab **Trò chuyện** chỉ liệt kê bạn bè đã kết nối, có tìm kiếm và số tin chưa đọc. Dashboard, nút Bạn bè và chuông thông báo hiện số lời mời đang chờ, kể cả khi thông báo đã đánh dấu đọc. Trang quản trị cũng có nút Bạn bè, chuông và thông báo lời mời.

Phiên đăng nhập được lưu chung trong localStorage cho các tab cùng origin (giao thức, tên miền và cổng). Tab mới tự nhận tài khoản đã đăng nhập; các tab đang mở đồng bộ khi đăng nhập, đổi tài khoản hoặc đăng xuất qua sự kiện storage. Khi đổi tài khoản, giao diện xóa người dùng cũ và tải hồ sơ mới, bỏ qua phản hồi xác thực của phiên trước. Token sessionStorage từ phiên bản cũ không còn được sử dụng. Muốn dùng đồng thời hai tài khoản, hãy dùng hai hồ sơ trình duyệt riêng hoặc một cửa sổ ẩn danh.

Backend kiểm tra kết bạn khi đọc và gửi tin, kể cả truy cập API trực tiếp. Lời mời đang chờ chưa mở quyền chat. Hủy kết bạn chặn chat cả hai chiều và ẩn cuộc trò chuyện/số chưa đọc. Tin nhắn cũ vẫn lưu trong MongoDB, chỉ mở lại khi hai người kết bạn lại; không tự coi những người từng chat là bạn bè. Tài khoản không hoạt động cũng bị loại khỏi danh sách bạn và chat.

Chuông báo cập nhật khi có bình luận, tương tác, duyệt ảnh hoặc trao quà. Realtime dùng HTTP SSE có xác thực Bearer và tự kết nối lại. Sự kiện lưu trong collection `CommunityEvent` dùng chung, nên kết nối ở một tiến trình backend vẫn nhận tin gửi từ tiến trình khác sử dụng cùng MongoDB. Mỗi kết nối kiểm tra sự kiện mới khoảng 1 giây/lần; sự kiện tự hết hạn sau 24 giờ. Sự kiện chat chỉ mang mã tin và người gửi, không mang nội dung; trình duyệt tải nội dung qua API có kiểm tra quyền kết bạn.

Danh sách lời mời/bạn bè cập nhật độc lập với hộp thư và thông báo, đồng bộ dự phòng 5 giây/lần và tải lại khi quay lại tab hoặc cửa sổ. Lỗi tải lời mời được hiển thị với nút làm mới. Nội dung cuộc trò chuyện đồng bộ dự phòng 15 giây khi SSE kết nối, 5 giây khi đang mất kết nối. Tin mới được gộp theo mã tin để tránh trùng và giữ các tin cũ đã tải; phản hồi của cuộc trò chuyện trước không ghi đè lên cuộc trò chuyện vừa chọn. Khi triển khai reverse proxy, tắt buffering/cache cho `/api/community/events` và cho phép kết nối ít nhất 30 giây. Khởi động lại backend sau khi cập nhật để nạp các API và model kết bạn mới.

## Cây và năng lượng

- Bài tập có ảnh được nộp: **10 điểm/bài**, không nhận lại khi nộp lại. Submission tự tạo nhưng không có ảnh không được cộng điểm.
- Ảnh chia sẻ/Tin học tập tích cực được admin duyệt: **15 điểm/ngày đăng**. Ảnh hỏi bài không nhận điểm đăng ảnh.
- Chủ ảnh hỏi bài ghi nhận câu trả lời của bạn: **10 điểm cộng đồng/người/ảnh**. Không tự thưởng; lặp thao tác không cộng thêm.
- Bài trắc nghiệm ôn tập trong Vườn của tôi: **1 điểm năng lượng/câu đúng**, 10–20 câu/bài, mỗi bài nhận điểm một lần. Hoàn thành bài sẽ tưới cây; xem lại kết quả cũ không tưới cây vào ngày khác.
- Mỗi câu đúng trong thử thách: **5 điểm**.

Cây lớn tối đa một lần/ngày khi nộp bài tập, ảnh tích cực được duyệt, ôn tập hoặc hoàn thành thử thách. Sau 3 ngày không chăm, cây cần nước. Các mốc: mầm (<7 ngày), cây non (7–19), cây lớn (20+). Có lưu riêng tổng điểm học tập, cộng đồng và năng lượng còn lại sau đổi thưởng.

Điểm dùng mở sticker trong bình luận, mở và trang bị khung avatar, mua 5 phút game ghép hình hoặc yêu cầu quà nhỏ. Game trừ 1 phút khi bắt đầu một lượt; tải lại trong cùng lượt không trừ thêm. Quà vật lý được admin xác nhận đã trao. Các khoản cộng và chi dùng cập nhật nguyên tử để tránh nhận lặp hoặc chi quá số dư khi gửi nhiều yêu cầu đồng thời.

## Thử thách và quà tháng

Admin quản lý thử thách tại **Thử thách** (`/community?tab=challenges`), gồm tạo đề, xem đề/đáp án, tổng kết tháng và ghi nhận trao quà. `/admin/community` giữ lối tắt sang trang này; phần cấu hình năng lượng vẫn ở admin. Danh sách đề phân trang 10 đề/trang tại máy chủ, hiển thị tổng số đề và giờ mở/đóng theo giờ Việt Nam, sắp xếp giờ mở mới nhất trước. API danh sách chỉ tải thông tin tóm tắt và số câu; nội dung đầy đủ chỉ tải khi admin mở xem đề. Danh sách thử thách của học sinh cũng có phân trang 10 đề/trang để truy cập được các đề ngoài 50 đề đầu.

Admin tạo thử thách với câu hỏi trắc nghiệm 4 lựa chọn, đáp án, giờ mở/đóng, thời lượng và lớp được tham gia. Bỏ trống lớp để mở cho học sinh thuộc bất kỳ lớp đang hoạt động. Thành viên kiểm tra bằng `Class.students`, đồng thời kiểm tra ngày bắt đầu/kết thúc lớp.

Mỗi học sinh có một lượt. Hạn nộp là thời điểm sớm hơn giữa hết thời lượng cá nhân và giờ đóng thử thách. Tải lại trang không gia hạn; đáp án đúng không gửi đến trình duyệt, điểm do backend chấm. Lựa chọn chưa nộp lưu trong sessionStorage của tab để tiếp tục làm; cần chủ động nộp trước khi hết giờ, chưa có tự nộp bài.

Tổng kết tháng cộng số câu đúng và số bài nộp theo thời điểm nộp ở múi giờ Việt Nam, sắp theo điểm giảm dần. Admin ghi nhận quà tháng cho từng học sinh và gửi thông báo. Đây là ghi nhận trao quà thủ công, không tự thanh toán/gửi quà.

## Bài ôn tập tưới cây và top 10 cùng lớp

Tại **Admin → Bài học → Sửa bài học**, mục **Ôn tập để tưới cây** nằm cuối trang `/admin/lessons/:id/edit`, bên dưới nút lưu bài học (cũng hỗ trợ `/admin/lessons/:id`). Admin nhập 10–20 câu trắc nghiệm, mỗi câu có 4 lựa chọn, một đáp án đúng và giải thích. Có thể dùng Gemini tạo bản nháp dựa trên tiêu đề/nội dung bài đã lưu, kiểm tra đáp án, bật **Công bố trong Vườn của tôi** rồi **Lưu bài ôn tập**. Nút này lưu riêng bài trắc nghiệm, không gửi biểu mẫu nội dung bài học. Phần Tiêu chí đánh giá đã bỏ khỏi trang chỉnh sửa. Gemini dùng `GEMINI_API_KEY` và `GEMINI_MODEL` hiện có; tạo bằng AI chưa tự lưu hoặc công bố. Bài học cũng cần được bật hiển thị.

Học sinh bấm **Ôn tập để tưới cây** để mở popup danh sách chủ đề thuộc lớp của mình. Chọn chủ đề chưa hoàn thành để làm bài trong popup. Chủ đề đã hoàn thành hiện điểm và biểu tượng khóa, không thể bấm làm lại; máy chủ cũng từ chối mở lại bằng mã `409`. Có thể đóng popup bằng nút đóng, phím Escape hoặc bấm nền bên ngoài khi không đang gửi bài.

Học sinh chỉ thấy bài đã công bố của khóa học thuộc lớp đang hoạt động mà mình là thành viên. Bắt đầu bài sẽ lưu bộ câu hỏi riêng cho lượt làm; tải lại hoặc admin chỉnh sửa không thay bộ câu hỏi đang làm. Câu trả lời nháp lưu trong tab theo tài khoản/lượt làm. Đáp án và giải thích chỉ trả về sau khi nộp đủ tất cả câu. Máy chủ chấm thang 10, quy đổi số câu đúng thành điểm học tập và năng lượng, chống nộp song song/nhận điểm trùng. Sau khi nộp có thể xem đáp án ngay trong kết quả, rồi chọn chủ đề khác; không thể sửa câu trả lời hoặc mở lượt mới của chủ đề đã hoàn thành.

Top 10 lấy học sinh đang hoạt động trong cùng lớp, xếp theo tổng điểm học tập + cộng đồng tích lũy; đồng điểm ưu tiên điểm học tập, sau đó mã tài khoản để ổn định thứ tự. Đổi quà không giảm điểm xếp hạng. Học sinh có nhiều lớp được chọn lớp của mình; admin có thể xem các lớp đang hoạt động. Không công khai email/ngày sinh trên bảng xếp hạng.

Kiểm thử riêng: `npm.cmd run test:garden` trong backend, sử dụng database thử nghiệm độc lập và giả lập phản hồi Gemini, không gọi API AI có phí.

## Điều kiện truy cập mạng xã hội

Admin chọn tại **Cộng đồng & thử thách → Quy định cộng đồng → Điều kiện truy cập mạng xã hội**, rồi bấm **Lưu thiết lập**. `homeworkAccessMode` gồm `none` (truy cập tự do), `submitted` (nộp đủ bài, mặc định), `graded` (tất cả bài đã được giáo viên chấm). Cài đặt cũ chưa có trường này vẫn áp dụng `submitted`; chỉ admin được thay đổi.

Điều kiện áp dụng cho bài đã công bố trong các lớp đang hoạt động mà học sinh là thành viên, gồm cả bài quá hạn. Học sinh không có bài tập và admin luôn được truy cập. Trong chế độ `submitted`, bài có ảnh nộp hoặc đã chấm được tính hoàn thành; bản ghi bài làm trống không tính là đã nộp. Chế độ `graded` chỉ tính bài đã chấm.

API kiểm tra điều kiện ở máy chủ. Kết nối realtime đang mở cũng bị đóng khi admin siết điều kiện hoặc có bài mới chưa hoàn thành. Giao diện giữ thanh điều hướng và hiển thị bài còn thiếu, tự cập nhật sau khi nộp, khi trở lại tab và định kỳ 5 giây.

## Kiểm tra

```powershell
cd backend
npm.cmd run test:community
cd ../frontend
npm.cmd run test:community
npm.cmd run build
```

Kiểm thử API yêu cầu MongoDB tại `127.0.0.1:27017`, tạo database riêng `community_test_<timestamp>_<pid>` và dọn đúng database đó sau khi chạy; không nạp `.env` hoặc ghi vào dữ liệu lớp học hiện có.
