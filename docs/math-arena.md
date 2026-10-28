# Đấu trường Toán học

Truy cập **Mạng xã hội → Đấu trường**, đường dẫn `/community?tab=arena`. Admin cũng có lối tắt tại **Cộng đồng & thử thách**.

## Chuẩn bị kho câu hỏi

1. Tại **Quản lý lớp học → Tạo / Chỉnh sửa lớp học**, nhập **Năm sinh của học sinh trong lớp**. Đây là năm sinh chung của khóa học sinh, không sửa ngày sinh trong từng tài khoản.
2. Khối tự tính theo công thức **năm hiện tại − năm sinh − 5** (6 tuổi vào lớp 1), theo năm lịch tại Việt Nam. Ví dụ sinh năm 2014 là khối 7 năm 2026, khối 8 năm 2027. Không cần gán khối thủ công. Lớp cũ chưa có năm sinh cần được admin cập nhật trước khi mở thi đấu; đấu trường hỗ trợ khối 6–12.
3. Danh sách khối được quản lý tại **Cài đặt → Khối** (`/admin/settings`), dùng chung cho **Chủ đề kiểm tra**, đề kiểm tra và **Kho câu hỏi Toán nhanh**. Mỗi khối có số 1–12, tên hiển thị và màu. Các mục cũ như “Lớp 6” tự được nhận diện và hiển thị “Khối 6”, giữ nguyên ID và liên kết đề. Không dùng danh sách khối cố định riêng trong kho câu hỏi. Mở **Đấu trường → Kho câu hỏi**, chọn khối và độ khó: Khởi động, Tăng tốc hoặc Bứt phá.
4. Thêm câu thủ công hoặc chọn **Chủ đề để Gemini tạo nháp** từ danh sách **chương** trong **Cài đặt → Chủ đề kiểm tra** của khối đang chọn để tạo 10–30 câu. Gemini nhận cả tên chương và các chủ đề bên trong; máy chủ kiểm tra chương còn thuộc đúng khối trước khi gọi AI. Khi đổi khối, danh sách chương tự cập nhật. Khối chưa có chương vẫn thêm câu thủ công được. Khi chưa có chương trình tùy chỉnh nào được lưu, dùng cùng chương trình mặc định với trang cài đặt. Gemini dùng `GEMINI_API_KEY` và `GEMINI_MODEL` hiện có.
5. Sau khi kiểm tra, bấm **Lưu và công bố tất cả** để đưa toàn bộ câu Gemini vào sử dụng bằng một lần bấm, hoặc **Lưu tất cả vào kho nháp** để chỉnh sửa sau.

Với câu hỏi đã lưu, tick từng câu nháp hoặc **Chọn tất cả câu nháp**, rồi bấm **Công bố đã chọn**. Chọn tất cả áp dụng cho **khối và độ khó đang lọc**, bao gồm tất cả các trang; có thể bỏ tick một số câu. Lựa chọn được giữ khi chuyển trang, được xóa khi đổi khối/độ khó. Câu đã công bố không có ô tick. Các khối/độ khó khác giữ nguyên. Bấm **Thêm thủ công** để nhập câu trắc nghiệm hoặc đáp án ngắn; có thể công bố ngay khi lưu hoặc để nháp.

Mỗi khối và độ khó cần ít nhất 10 câu đã công bố. Hỗ trợ trắc nghiệm 4 lựa chọn và đáp án ngắn. Công thức dùng `$LaTeX$`. Đáp án số chấp nhận dấu phẩy/chấm và phân số tương đương, chẳng hạn `0,5`, `0.5`, `1/2`. Biểu thức không được thực thi như mã. Đáp án chữ so sánh sau khi chuẩn hóa chữ hoa/thường và khoảng trắng.

Kho câu hỏi có phân trang, sửa, công bố và xóa. Câu đã sửa/xóa không thay đổi bộ đề đã chốt trong trận đang diễn ra.

## Mời đấu và luật chơi

- Hai cách hiển thị: **Đua Xe Tốc Độ** (xe tiến dọc đường đua) và **Ai là Xạ Thủ?** (hạ các mục tiêu).
- Hình thức **1v1** hoặc **2v2**: chủ phòng chọn một đồng đội và hai đối thủ khi đấu đội. Tất cả phải là học sinh hoạt động thuộc cùng lớp.
- Tất cả người chơi phải hoàn thành điều kiện truy cập mạng xã hội. Giờ nghỉ chặn tạo phòng, nhận lời và bắt đầu trận mới; trận đã bắt đầu được hoàn tất.
- Lời mời xuất hiện trong chuông thông báo và sảnh đấu, hết hạn sau 2 phút. Mỗi người chỉ ở một phòng chờ/trận đang diễn ra. Người được mời có thể từ chối; chủ phòng có thể hủy phòng chờ.
- Tất cả người chơi phải chấp nhận, sau đó chủ phòng bắt đầu. Có 3 giây đếm ngược trước khi đồng hồ 60 giây chạy.
- Máy chủ chọn ngẫu nhiên tối đa 30 câu đã công bố đúng khối và độ khó, chốt cùng một bộ câu hỏi cho mọi người. Mỗi người có tiến độ trả lời riêng.
- Trả lời đúng được 1 điểm cho đội, trả lời sai sang câu tiếp theo và không trừ điểm. Đội chạm 10 điểm trước thắng ngay. Hết 60 giây so tổng điểm; bằng điểm là hòa. Nếu đã trả lời hết bộ câu hỏi, chờ đồng đội/đối thủ hoặc hết giờ.
- Mỗi thành viên đội thắng nhận **10 năng lượng và 10 điểm học tập** qua cơ chế thưởng hiện có; đội thua và trận hòa không nhận thưởng. Trận đấu không tự tưới cây.

## Đồng bộ và xử lý lỗi

Phòng đang mở đồng bộ khoảng mỗi giây khi thi đấu; sảnh làm mới mỗi 5 giây và khi có sự kiện cộng đồng. Bộ câu hỏi, điểm số và đồng hồ nằm ở máy chủ. Tải lại trang rồi mở lại phòng từ sảnh để tiếp tục; thời gian không đặt lại. Mất kết nối quá lâu sẽ tạm khóa nút trả lời đến khi đồng bộ lại.

Mỗi lần gửi đáp án phải khớp số thứ tự câu hiện tại. Gửi lại cùng câu không cộng điểm lần nữa. Cập nhật điểm dùng phiên bản trận đấu để tránh ghi đè khi nhiều người trả lời đồng thời. Kết quả được lưu trước khi thưởng; khóa thưởng theo trận/người chống nhận trùng và cho phép khôi phục nếu tiến trình dừng giữa chừng. Trận hết giờ được chốt khi người chơi mở phòng hoặc sảnh lần tiếp theo, không phụ thuộc bộ đếm trình duyệt.

Các collection mới là `ArenaQuestion`, `ArenaMatch`, `ArenaSeat`; Mongoose tạo index khi backend khởi động. Lớp lưu `birthYear`; `currentGrade` tự tính khi đọc, không lưu khối cố định để tránh sai khi sang năm mới. Khối gán bằng `arenaGrade` cũ không còn được dùng. Admin cần bổ sung năm sinh cho lớp cũ và công bố câu hỏi trước khi học sinh chơi được. Trận đang thi đấu giữ khối và bộ đề đã chốt; phòng chờ có khối thay đổi cần tạo lại.

## Kiểm thử

Chạy `npm.cmd run test:arena` tại `backend`. Bộ kiểm thử sử dụng MongoDB `127.0.0.1:27017`, tự tạo/xóa database tên `math_arena_test_*`, và giả lập Gemini, không gọi API tính phí. Kiểm tra quyền admin, tách khối, lời mời đồng thời, đồng ý tham gia, đếm ngược, đáp án trùng, hai bên cùng về đích, 2v2, hết giờ, hòa và khôi phục thưởng.
