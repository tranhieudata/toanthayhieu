require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./src/models/Course');
const Lesson = require('./src/models/Lesson');
const User = require('./src/models/User');

const sampleCourses = [
  {
    title: 'Toán lớp 9 - Đại số căn bản',
    description: 'Khóa học hệ thống toàn bộ chương trình Đại số lớp 9: căn thức, phương trình bậc hai, hàm số. Bài giảng dễ hiểu, có bài tập từ cơ bản đến nâng cao.',
    category: 'Toán lớp 9',
    level: 'beginner',
    price: 0,
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format',
    duration: '20 giờ',
    tags: ['đại số', 'lớp 9', 'phương trình'],
    isPublished: true,
  },
  {
    title: 'Toán lớp 10 - Hình học Giải tích',
    description: 'Ôn tập và nâng cao kiến thức Hình học Giải tích lớp 10: tọa độ trong mặt phẳng, đường thẳng, đường tròn, elip. Luyện đề cương thi học kỳ.',
    category: 'Toán lớp 10',
    level: 'intermediate',
    price: 150000,
    thumbnail: 'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&auto=format',
    duration: '25 giờ',
    tags: ['hình học', 'lớp 10', 'tọa độ'],
    isPublished: true,
  },
  {
    title: 'Toán lớp 12 - Lượng giác & Hàm số',
    description: 'Tổng ôn toàn bộ phần Lượng giác và Hàm số lớp 12 – trọng tâm thi THPT Quốc gia. Phân tích đề thi các năm, giải chi tiết từng dạng bài.',
    category: 'Toán lớp 12',
    level: 'advanced',
    price: 250000,
    thumbnail: 'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=600&auto=format',
    duration: '30 giờ',
    tags: ['lượng giác', 'hàm số', 'lớp 12'],
    isPublished: true,
  },
  {
    title: 'Luyện thi THPT - Chuyên đề Tích phân',
    description: 'Chuyên đề Tích phân nâng cao dành cho học sinh lớp 12 luyện thi THPT Quốc gia. Bao gồm 50+ dạng tích phân, từ cơ bản đến nâng cao và mẹo tính nhanh.',
    category: 'Luyện thi THPT',
    level: 'advanced',
    price: 300000,
    thumbnail: 'https://images.unsplash.com/photo-1564939558297-fc396f18e5c7?w=600&auto=format',
    duration: '15 giờ',
    tags: ['tích phân', 'THPT', 'luyện thi'],
    isPublished: true,
  },
  {
    title: 'Toán lớp 8 - Phương trình & Bất phương trình',
    description: 'Khóa học bám sát chương trình SGK lớp 8: giải phương trình bậc nhất, bất phương trình, phân tích nhân tử. Phù hợp ôn thi học kỳ.',
    category: 'Toán lớp 8',
    level: 'beginner',
    price: 0,
    thumbnail: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&auto=format',
    duration: '18 giờ',
    tags: ['phương trình', 'lớp 8', 'bất phương trình'],
    isPublished: true,
  },
  {
    title: 'Toán lớp 11 - Giới hạn & Đạo hàm',
    description: 'Nắm vững Giới hạn và Đạo hàm lớp 11. Từ khái niệm, công thức đến áp dụng giải bài tập và đề thi. Video bài giảng chi tiết, dễ theo dõi.',
    category: 'Toán lớp 11',
    level: 'intermediate',
    price: 200000,
    thumbnail: 'https://images.unsplash.com/photo-1453733190371-0a9bedd82893?w=600&auto=format',
    duration: '22 giờ',
    tags: ['giới hạn', 'đạo hàm', 'lớp 11'],
    isPublished: true,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Kết nối MongoDB thành công');

  // Lấy admin làm instructor
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('❌ Chưa có tài khoản admin. Hãy chạy node createAdmin.js trước!');
    process.exit(1);
  }

  const existing = await Course.countDocuments();
  if (existing > 0) {
    console.log(`ℹ️  Đã có ${existing} khóa học trong database. Bỏ qua seed.`);
    console.log('   (Xóa toàn bộ courses trong MongoDB nếu muốn seed lại)');
    await mongoose.disconnect();
    process.exit(0);
  }

  const courses = await Course.insertMany(
    sampleCourses.map((c) => ({ ...c, instructor: admin._id, totalLessons: 0 }))
  );

  // Tạo vài bài học mẫu cho khóa đầu tiên
  const sampleLessons = [
    { title: 'Bài 1: Căn bậc hai và các phép tính', content: 'Trong bài này chúng ta sẽ ôn lại định nghĩa căn bậc hai, điều kiện xác định và các phép tính cơ bản với căn thức.', course: courses[0]._id, order: 1, duration: '30 phút', isPublished: true },
    { title: 'Bài 2: Rút gọn biểu thức chứa căn', content: 'Học cách rút gọn các biểu thức chứa căn thức: trục căn thức ở mẫu, nhân lượng liên hợp, và các kỹ thuật thường gặp trong đề thi.', course: courses[0]._id, order: 2, duration: '45 phút', isPublished: true },
    { title: 'Bài 3: Phương trình bậc hai một ẩn', content: 'Giải phương trình bậc hai ax² + bx + c = 0 bằng công thức nghiệm và công thức nghiệm thu gọn. Định lý Viét và ứng dụng.', course: courses[0]._id, order: 3, duration: '50 phút', isPublished: true },
  ];

  await Lesson.insertMany(sampleLessons);
  await Course.findByIdAndUpdate(courses[0]._id, { totalLessons: sampleLessons.length });

  console.log(`✅ Đã tạo ${courses.length} khóa học mẫu`);
  console.log(`✅ Đã tạo ${sampleLessons.length} bài học mẫu cho khóa "${courses[0].title}"`);
  console.log('👉 Truy cập http://localhost:5173 để xem kết quả!');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
