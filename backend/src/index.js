require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const passport = require('./config/passport');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/toanthayhieu';

const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Connect to MongoDB
connectDB();

// Middleware
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      process.env.CLIENT_URL
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

// Configure multer for file upload
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_PDF_TYPES   = ['application/pdf'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')),
});

const uploadImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadPdf = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PDF_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file PDF'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Upload image endpoint (QR, avatar, thumbnail…)
app.post('/api/upload/image', (req, res) => {
  uploadImage.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Không có file được gửi lên' });
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
  });
});

// Upload PDF endpoint (lesson attachments)
app.post('/api/upload', (req, res) => {
  uploadPdf.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Không có file được gửi lên' });
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/class-enrollments', require('./routes/classEnrollments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tuition', require('./routes/tuition'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/homeworks', require('./routes/homeworks'));
app.use('/api/levels', require('./routes/levels'));

app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
