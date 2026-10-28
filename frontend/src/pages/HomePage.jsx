import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiChevronDown, FiClipboard, FiHeart, FiMessageCircle, FiRefreshCw, FiUsers } from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import '../styles/home.css';

const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const questions = [
  { prompt: '3/4 + 1/4 = ?', choices: ['1/2', '1', '3/8', '4'], correct: 1, explanation: 'Hai phân số cùng mẫu: cộng tử số, giữ nguyên mẫu. (3 + 1)/4 = 4/4 = 1.' },
  { prompt: 'Tìm x: 2x + 6 = 14', choices: ['10', '7', '4', '3'], correct: 2, explanation: 'Trừ 6 ở hai vế: 2x = 8. Chia hai vế cho 2, ta được x = 4.' },
  { prompt: '25% của 80 bằng bao nhiêu?', choices: ['20', '25', '40', '60'], correct: 0, explanation: '25% = 1/4. Lấy 80 chia cho 4, ta được 20.' },
];
const faqs = [
  ['Mới bắt đầu thì nên làm gì?', 'Bạn có thể xem các lớp đang mở trước khi tạo tài khoản. Khi chọn được lớp phù hợp, tạo tài khoản học sinh, gửi đăng ký lớp và liên hệ thầy để được hướng dẫn.'],
  ['Tạo tài khoản có đồng nghĩa với việc đã vào lớp không?', 'Tạo tài khoản là bước đầu tiên. Đăng ký tham gia lớp cần được thầy xét duyệt. Sau khi được duyệt, học sinh có thể vào lớp để xem các bài học và bài tập được giao.'],
  ['Trong lớp, học sinh có thể làm những gì?', 'Học sinh xem bài học, nộp bài tập bằng ảnh, làm đề kiểm tra và ôn luyện theo chủ đề. Khu vực cộng đồng còn có tự luyện, thử thách và đấu trường Toán để cùng bạn bè củng cố kiến thức.'],
  ['Chưa biết lớp nào phù hợp thì liên hệ ở đâu?', 'Học sinh và phụ huynh có thể nhắn Zalo cho thầy Hiếu qua số 0382 468 988. Hãy chia sẻ khối lớp, phần kiến thức cần củng cố và thời gian có thể học để thầy hướng dẫn.'],
];

function MathTryout() {
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState(null);
  const q = questions[index];
  return <div className="home-tryout">
    <div className="home-tryout-top"><span><span className="home-status-dot" /> MỘT CHÚT TOÁN MỖI NGÀY</span><span>0{index + 1} / 03</span></div>
    <div className="home-tryout-heading"><span className="home-icon-box"><FiBookOpen /></span><div><h2>Bắt đầu từ một câu nhỏ.</h2><p>Chọn đáp án và cùng hiểu cách giải.</p></div></div>
    <div className="home-math-prompt">{q.prompt}</div>
    <div className="home-demo-options" role="group" aria-label="Chọn đáp án câu hỏi minh họa">{q.choices.map((choice, i) => <button key={`${index}-${i}`} type="button" disabled={answer !== null} className={answer === null ? '' : i === q.correct ? 'is-correct' : i === answer ? 'is-incorrect' : ''} onClick={() => setAnswer(i)}><span>{'ABCD'[i]}</span><b>{choice}</b>{answer !== null && i === q.correct && <FiCheckCircle />}</button>)}</div>
    <div className="home-demo-feedback" aria-live="polite">{answer === null ? <p><FiHeart /> Không cần vội. Hiểu từng bước là được.</p> : <><b>{answer === q.correct ? 'Đúng rồi, bạn làm tốt lắm!' : 'Cùng xem lại một chút nhé.'}</b><p>{q.explanation}</p><button type="button" onClick={() => { setIndex(i => (i + 1) % questions.length); setAnswer(null); }}>Thử câu tiếp theo <FiArrowRight /></button></>}</div>
    <div className="home-demo-caption">Câu hỏi trải nghiệm · Không cần đăng nhập</div>
  </div>;
}

export default function HomePage() {
  const [classes, setClasses] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(async signal => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/classes', { signal, timeout: 10000 });
      if (!signal?.aborted) setClasses(Array.isArray(data) ? data.slice(0, 3) : []);
    } catch { if (!signal?.aborted) setError('Chưa tải được danh sách lớp. Bạn có thể thử lại hoặc nhắn thầy để được hướng dẫn.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);

  return <div className="home-page">
    <a className="home-skip-link" href="#home-main">Đến nội dung chính</a>
    <Navbar homeNavigation />
    <main id="home-main" tabIndex={-1}>
      <section className="home-hero home-container" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow"><span /> TOÁN THẦY HIẾU · HỌC CÙNG NHAU, LỚN CÙNG NHAU</p>
          <h1 id="home-title">Hiểu bản chất.<br />Tự tin <span>học Toán.</span></h1>
          <p className="home-hero-description">Một nơi để học bài, luyện tập và tiến bộ từng ngày. Cùng thầy Hiếu xây nền tảng vững vàng, gỡ từng chỗ khó và tìm thêm niềm vui trong môn Toán.</p>
          <div className="home-hero-actions"><Link to="/classes" className="home-button home-button-primary">Tìm lớp học phù hợp <FiArrowRight /></Link><a href="https://zalo.me/0382468988" target="_blank" rel="noopener noreferrer" className="home-button home-button-outline"><FiMessageCircle /> Nhắn thầy qua Zalo<span className="sr-only"> (mở tab mới)</span></a></div>
          <p className="home-hero-note"><FiCheckCircle /> Xem lớp trước, chọn hướng học phù hợp với mình.</p>
          <div className="home-hero-bottom"><span className="home-mini-symbols" aria-hidden="true"><span>π</span><span>+</span><span>√</span></span><p>Không cần giỏi ngay từ đầu.<br /><b>Chỉ cần bắt đầu và học đều từng chút.</b></p></div>
        </div>
        <div className="home-hero-visual"><div className="home-orbit-symbol home-symbol-one" aria-hidden="true">a² + b²</div><div className="home-orbit-symbol home-symbol-two" aria-hidden="true">✦</div><MathTryout /><div className="home-visual-note"><FiCheck /><span>Từng bước nhỏ.<br /><b>Một nền tảng vững hơn.</b></span></div></div>
      </section>

      <section className="home-principles" aria-label="Tinh thần học tập"><div className="home-container"><p>HỌC ĐỂ HIỂU.<br /><b>LUYỆN ĐỂ VỮNG.</b></p><span><FiBookOpen /> Kiến thức có hệ thống</span><span><FiClipboard /> Luyện tập theo chủ đề</span><span><FiUsers /> Cùng bạn bè tiến bộ</span></div></section>

      <section id="cach-hoc" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-eyebrow">MỘT HÀNH TRÌNH, TỪNG BƯỚC RÕ RÀNG</p><h2>Học có hướng.<br />Luyện có niềm vui.</h2></div><p>Từ bài học trên lớp đến những phút tự luyện, mỗi phần đều giúp học sinh chủ động hơn với việc học của mình.</p></div>
        <div className="home-learning-grid">{[
          { number: '01', icon: FiBookOpen, title: 'Hiểu bài từ nền tảng', text: 'Xem lại nội dung bài học trong lớp, củng cố kiến thức và dành thời gian cho những phần mình chưa hiểu.', tag: 'BÀI HỌC & TÀI LIỆU', color: 'blue' },
          { number: '02', icon: FiClipboard, title: 'Luyện đều, biết mình ở đâu', text: 'Làm bài tập, gửi ảnh bài giải và xem kết quả kiểm tra để nhận ra phần đã vững, phần cần luyện thêm.', tag: 'BÀI TẬP & KIỂM TRA', color: 'sage' },
          { number: '03', icon: FiUsers, title: 'Học cùng nhau, vui hơn', text: 'Tự luyện theo chủ đề, thử sức với đề thử thách và cùng bạn bè so tài trong đấu trường Toán học.', tag: 'TỰ LUYỆN & CỘNG ĐỒNG', color: 'amber' },
        ].map(({ number, icon: Icon, title, text, tag, color }) => <article className={`home-learning-card is-${color}`} key={number}><div className="home-learning-card-top"><span className="home-icon-box"><Icon /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p><span className="home-card-tag">{tag}</span></article>)}</div>
      </section>

      <section id="lop-hoc" className="home-classes-section"><div className="home-container home-section">
        <div className="home-section-heading"><div><p className="home-eyebrow">TÌM MỘT LỚP HỌC CHO MÌNH</p><h2>Bắt đầu từ lớp phù hợp.</h2></div><Link to="/classes" className="home-text-link">Xem tất cả lớp học <FiArrowRight /></Link></div>
        <p className="home-section-intro">Xem thông tin và lịch học, rồi liên hệ thầy nếu bạn cần được hướng dẫn trước khi đăng ký.</p>
        {loading ? <div className="home-class-grid" role="status" aria-label="Đang tải lớp học">{[0, 1, 2].map(i => <div className="home-class-skeleton" key={i}><span /><span /><span /></div>)}</div> : error ? <div className="home-class-empty" role="alert"><p>{error}</p><button type="button" className="home-text-link" onClick={() => load()}><FiRefreshCw /> Thử tải lại</button></div> : !classes.length ? <div className="home-class-empty"><FiBookOpen /><h3>Lớp học mới sẽ được cập nhật tại đây.</h3><p>Trong lúc chờ, hãy nhắn thầy để tìm hiểu lớp phù hợp với nhu cầu của bạn.</p><a className="home-text-link" href="https://zalo.me/0382468988" target="_blank" rel="noopener noreferrer">Liên hệ thầy Hiếu <FiArrowRight /><span className="sr-only"> (mở tab mới)</span></a></div> : <div className="home-class-grid">{classes.map((cls, i) => <article className="home-class-card" key={cls._id}><div className={`home-class-cover cover-${i}`} aria-hidden="true"><span>{['x² + y²', '∑', '√x'][i]}</span><FiBookOpen /></div><div className="home-class-content"><p className="home-class-label">LỚP HỌC CÙNG THẦY HIẾU</p><h3>{cls.name}</h3><p className="home-class-description">{cls.description || 'Củng cố kiến thức, luyện tập và học cùng bạn bè trong lớp.'}</p><div className="home-class-schedule"><FiCalendar /><span>{cls.schedules?.length ? cls.schedules.slice(0, 2).map(s => `${days[s.dayOfWeek] || 'Buổi học'} · ${s.startTime}–${s.endTime}`).join(' / ') : 'Liên hệ thầy để biết lịch học'}</span></div><Link to="/classes" className="home-class-link" aria-label={`Tìm hiểu lớp ${cls.name}`}>Tìm hiểu lớp học <FiArrowRight /></Link></div></article>)}</div>}
      </div></section>

      <section id="bat-dau" className="home-section home-container home-start">
        <div className="home-start-intro"><p className="home-eyebrow">CHÀO MỪNG BẠN ĐẾN VỚI LỚP</p><h2>Lần đầu ghé thăm?<br />Mình bắt đầu nhé.</h2><p>Học sinh hay phụ huynh đều có thể xem lớp và trao đổi với thầy trước khi quyết định tham gia.</p><Link to="/register" className="home-button home-button-primary">Tạo tài khoản học sinh <FiArrowRight /></Link><p className="home-signin-note">Đã có tài khoản? <Link to="/login">Đăng nhập tại đây</Link></p></div>
        <ol className="home-steps">{[
          ['Tìm hiểu lớp học', 'Xem thông tin lớp, lịch học và các nội dung đang được giảng dạy.'],
          ['Tạo tài khoản, gửi đăng ký', 'Dùng tài khoản học sinh để gửi đăng ký lớp. Nhắn thầy qua Zalo nếu cần hỗ trợ.'],
          ['Vào lớp và bắt đầu học', 'Sau khi được thầy duyệt, vào lớp để học bài, làm bài tập và luyện tập cùng bạn bè.'],
        ].map(([title, text], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>

      <section className="home-faq-section home-container"><div><p className="home-eyebrow">THÊM MỘT CHÚT THÔNG TIN</p><h2>Những điều bạn<br />có thể đang thắc mắc.</h2><p>Chưa tìm được câu trả lời?<br /><a className="home-text-link" href="https://zalo.me/0382468988" target="_blank" rel="noopener noreferrer">Nhắn thầy để được hướng dẫn <FiArrowRight /><span className="sr-only"> (mở tab mới)</span></a></p></div><div className="home-faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<FiChevronDown /></summary><p>{a}</p></details>)}</div></section>

      <section className="home-last-call home-container"><div><p className="home-eyebrow">MỖI NGÀY, HIỂU THÊM MỘT CHÚT.</p><h2>Hành trình học Toán<br />bắt đầu từ hôm nay.</h2><p>Chọn một lớp phù hợp. Cùng thầy và các bạn bước tiếp.</p></div><Link to="/classes" className="home-button home-button-light">Khám phá lớp học <FiArrowRight /></Link><span aria-hidden="true" className="home-last-symbol">π</span></section>
    </main>
    <footer className="home-footer home-container"><div><Link to="/" className="home-footer-brand">Toán Thầy Hiếu<span>Học cùng nhau, lớn cùng nhau.</span></Link><p>© {new Date().getFullYear()} Toán Thầy Hiếu</p></div><nav aria-label="Liên kết cuối trang"><Link to="/classes">Lớp học</Link><Link to="/register">Tạo tài khoản</Link><Link to="/login">Đăng nhập</Link><a href="https://zalo.me/0382468988" target="_blank" rel="noopener noreferrer">Zalo: 0382 468 988<span className="sr-only"> (mở tab mới)</span></a></nav></footer>
  </div>;
}
