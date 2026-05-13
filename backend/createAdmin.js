require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

async function createAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Kết nối MongoDB thành công');

  const email = 'admin@eduonline.com';
  const password = 'Admin@123456';
  const name = 'Admin';

  const existing = await User.findOne({ email });
  if (existing) {
    // Nếu đã tồn tại thì nâng cấp lên admin
    existing.role = 'admin';
    await existing.save();
    console.log(`✅ Đã nâng cấp tài khoản ${email} thành admin`);
  } else {
    const hashed = await bcrypt.hash(password, 12);
    await User.create({ name, email, password: hashed, role: 'admin' });
    console.log(`✅ Tạo tài khoản admin thành công!`);
    console.log(`   Email   : ${email}`);
    console.log(`   Mật khẩu: ${password}`);
  }

  console.log('👉 Hãy đổi mật khẩu sau khi đăng nhập lần đầu!');
  await mongoose.disconnect();
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
