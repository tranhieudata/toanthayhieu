import { useEffect, useState } from 'react';
import { FiBell, FiCheck, FiExternalLink, FiRefreshCw, FiSave, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';

const notifications = [
  ['morning', 'Lịch dạy mỗi sáng', 'Tổng hợp giờ dạy, lớp, bài học và việc còn lại.'],
  ['preparation', 'Nhắc chuẩn bị trước buổi dạy', 'Mở đúng buổi, xác nhận đã chuẩn bị hoặc hẹn nhắc sau.'],
  ['journal', 'Nhắc hoàn tất nhật ký sau buổi dạy', 'Cập nhật đã dạy xong, dạy một phần hoặc viết nhận xét.'],
  ['weekly', 'Nhắc lập kế hoạch tuần mới', 'Tối Chủ nhật, tổng hợp lịch tuần sau và các buổi chưa chọn bài.'],
  ['grading', 'Thông báo bài làm mới cần chấm', 'Nhận thông báo, mở bài hoặc xác nhận chấm bằng AI.'],
  ['evening', 'Tổng kết cuối ngày', 'Buổi chưa ghi nhật ký, bài chưa chấm và công việc chưa xong.'],
  ['tuition', 'Nhắc học phí hàng tháng', 'Tổng hợp khoản chưa thanh toán, chỉ gửi riêng cho thầy.'],
];
const stateLabels = { pending: 'Chờ gửi', sending: 'Đang xử lý', sent: 'Đã gửi', failed: 'Lỗi', canceled: 'Đã hủy' };

export default function TelegramSettings() {
  const [form, setForm] = useState(null);
  const [token, setToken] = useState('');
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [activity, setActivity] = useState({ deliveries: [], tasks: [] });

  const loadActivity = async () => {
    const { data } = await api.get('/telegram/activity');
    setActivity(data);
  };
  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/telegram/settings');
      setForm(data);
      await loadActivity();
    } catch { setError('Không tải được cài đặt Telegram. Bấm tải lại để thử lại.'); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!pair) return undefined;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get('/telegram/settings');
        if (!active) return;
        setForm(prev => ({ ...prev, connected: data.connected, connectedAt: data.connectedAt, lastError: data.lastError, lastPollAt: data.lastPollAt }));
        if (data.connected) { setPair(null); toast.success('Đã kết nối tài khoản Telegram'); }
        else if (new Date(pair.expiresAt) < new Date()) { setPair(null); toast.error('Liên kết đã hết hạn. Tạo liên kết mới để kết nối.'); }
      } catch { /* Retry while the pairing link is valid. */ }
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [pair]);

  const action = async (name, fn) => {
    setBusy(name);
    try { await fn(); }
    catch (err) { toast.error(err.response?.data?.message || 'Không thực hiện được thao tác Telegram'); }
    finally { setBusy(''); }
  };
  const save = () => action('save', async () => {
    const { data } = await api.put('/telegram/settings', { ...form, ...(token.trim() ? { token: token.trim() } : {}) });
    setForm(data); setToken(''); setPair(null);
    toast.success('Đã lưu cài đặt Telegram');
  });
  const connect = () => action('pair', async () => {
    const { data } = await api.post('/telegram/pair');
    setPair(data);
  });
  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  if (!form) return <div className="rounded-xl bg-white p-6 text-sm text-gray-500">{error || 'Đang tải cài đặt Telegram...'}{error && <button type="button" onClick={load} className="ml-2 text-blue-600 underline">Tải lại</button>}</div>;

  return <div className="space-y-5">
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold text-gray-900"><FiSend className="text-blue-500" /> Trợ lý Telegram</h2><p className="mt-1 text-sm text-gray-500">Nhận lịch dạy, nhắc việc và cập nhật buổi dạy ngay trong cuộc trò chuyện riêng với bot.</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${form.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{form.connected ? 'Đã kết nối tài khoản' : 'Chưa kết nối'}</span>
      </div>
      <ol className="list-decimal space-y-1 rounded-lg bg-blue-50 p-4 pl-9 text-sm text-blue-900">
        <li>Mở <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a>, tạo bot bằng /newbot và lấy Bot Token.</li>
        <li>Nhập token bên dưới rồi bấm <b>Lưu cấu hình</b>.</li>
        <li>Bấm <b>Kết nối tài khoản</b>, mở Telegram và bấm Start để xác nhận.</li>
        <li>Bật thông báo, lưu cấu hình và gửi tin nhắn thử.</li>
      </ol>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-600">Bot Token<input type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} placeholder={form.hasToken ? 'Đã lưu token · nhập mới nếu muốn thay bot' : 'Dán token từ BotFather'} className="mt-1 w-full rounded-lg border px-3 py-2" /><span className="mt-1 block text-xs text-gray-400">Token được mã hóa trên máy chủ, không hiển thị lại khi tải trang.</span></label>
        <label className="text-sm text-gray-600">Địa chỉ website<input type="url" value={form.websiteUrl || ''} onChange={e => setField('websiteUrl', e.target.value)} placeholder="https://toanthayhieu.vn" className="mt-1 w-full rounded-lg border px-3 py-2" /><span className="mt-1 block text-xs text-gray-400">Dùng để các nút trong Telegram mở đúng trang trên điện thoại.</span></label>
      </div>
      {form.botUsername && <p className="text-sm text-gray-500">Bot: @{form.botUsername}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy || !form.hasToken || !!token.trim()} onClick={connect} className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700 disabled:opacity-50">{busy === 'pair' ? 'Đang tạo liên kết...' : 'Kết nối tài khoản'}</button>
        <button type="button" disabled={!!busy || !form.connected} onClick={() => action('test', async () => { await api.post('/telegram/test'); toast.success('Đã gửi tin nhắn thử'); })} className="rounded-lg border px-4 py-2 text-sm text-gray-600 disabled:opacity-50">Gửi tin nhắn thử</button>
        {form.connected && <button type="button" disabled={!!busy} onClick={() => action('disconnect', async () => { await api.post('/telegram/disconnect'); setPair(null); await load(); toast.success('Đã ngắt kết nối'); })} className="rounded-lg px-4 py-2 text-sm text-red-600">Ngắt kết nối</button>}
      </div>
      {pair && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><a href={pair.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Mở Telegram để xác nhận <FiExternalLink /></a><p className="mt-2 text-xs text-blue-700">Liên kết có hiệu lực 10 phút. Trang sẽ tự cập nhật sau khi kết nối.</p></div>}
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm font-medium text-gray-800"><input type="checkbox" checked={!!form.enabled} disabled={!form.connected || !!busy} onChange={e => setField('enabled', e.target.checked)} className="h-4 w-4" />Bật trợ lý và thông báo Telegram</label>
      {form.lastError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.lastError}</p>}
      <p className="text-xs text-gray-400">Lần kiểm tra gần nhất: {form.lastPollAt ? new Date(form.lastPollAt).toLocaleString('vi-VN') : 'Chưa chạy'}. Máy chủ website cần hoạt động để bot nhận lệnh và gửi thông báo.</p>
    </section>

    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-900"><FiBell className="text-amber-500" /> Thông báo và thời gian</h2>
      <div className="divide-y">{notifications.map(([key, label, description]) => <label key={key} className="flex items-start gap-3 py-3 text-sm"><input type="checkbox" checked={!!form.notifications?.[key]} onChange={e => setForm(prev => ({ ...prev, notifications: { ...prev.notifications, [key]: e.target.checked } }))} className="mt-1 h-4 w-4" /><span><b className="font-medium text-gray-800">{label}</b><span className="mt-1 block text-xs text-gray-500">{description}</span></span></label>)}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        {[['morningTime', 'Lịch mỗi sáng'], ['eveningTime', 'Tổng kết buổi tối'], ['weeklyTime', 'Kế hoạch tuần · Chủ nhật'], ['quietStart', 'Bắt đầu giờ yên lặng'], ['quietEnd', 'Kết thúc giờ yên lặng']].map(([key, label]) => <label key={key} className="text-xs text-gray-500">{label}<input type="time" value={form[key] || ''} onChange={e => setField(key, e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-800" /></label>)}
        {[['beforeMinutes', 'Nhắc trước buổi · phút', 5, 240], ['afterMinutes', 'Nhắc sau buổi · phút', 5, 240], ['tuitionDay', 'Ngày nhắc học phí hàng tháng', 1, 28]].map(([key, label, min, max]) => <label key={key} className="text-xs text-gray-500">{label}<input type="number" min={min} max={max} value={form[key] ?? ''} onChange={e => setField(key, Number(e.target.value))} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-800" /></label>)}
      </div>
      <p className="mt-3 text-xs text-gray-400">Tất cả giờ theo Việt Nam (UTC+7). Thông báo tự động tạm dừng trong giờ yên lặng; lệnh thầy gửi vẫn được xử lý.</p>
      <button type="button" disabled={!!busy} onClick={save} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><FiSave />{busy === 'save' ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
    </section>

    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-gray-900">Lệnh và thao tác nhanh</h2>
      <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">{[['/homnay', 'Lịch dạy hôm nay'], ['/tuan', 'Kế hoạch tuần'], ['/chuacham', 'Bài làm có ảnh chưa chấm'], ['/vieccanlam', 'Việc từ ghi chú kế hoạch'], ['/hocphi', 'Học phí chưa thanh toán'], ['/nopbai', 'Gửi ảnh → chọn lớp, đề, học sinh'], ['/xong', 'Tiếp tục lưu ảnh đã gửi'], ['/huy', 'Hủy nhập ảnh hoặc nhận xét']].map(([command, text]) => <p key={command}><code className="mr-2 rounded bg-gray-100 px-2 py-1 text-blue-700">{command}</code>{text}</p>)}</div>
      <p className="mt-4 text-xs text-gray-500">Mỗi dòng ghi chú trong kế hoạch tuần là một việc cần làm. Bot có nút hoàn thành/dời việc. Chấm AI cần bấm xác nhận; kết quả được lưu trên web và gửi riêng cho tài khoản đã liên kết.</p>
    </section>

    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-gray-900">Việc cần làm và lịch sử gửi</h2><button type="button" onClick={() => action('reload', loadActivity)} disabled={!!busy} className="inline-flex items-center gap-1 text-sm text-blue-600"><FiRefreshCw /> Tải lại</button></div>
      <div className="max-h-64 space-y-2 overflow-y-auto">{activity.tasks.length ? activity.tasks.map(task => <div key={task._id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-medium text-gray-800">{task.text}</p><p className="mt-1 text-xs text-gray-500">{task.className} · {task.date}</p></div><button type="button" disabled={!!busy} onClick={() => action('task', async () => { await api.post(`/telegram/tasks/${task._id}/complete`); await loadActivity(); })} className="shrink-0 rounded bg-green-50 p-2 text-green-700" title="Hoàn thành"><FiCheck /></button></div>) : <p className="text-sm text-gray-400">Chưa có việc cần làm.</p>}</div>
      <div className="mt-4 max-h-72 divide-y overflow-y-auto">{activity.deliveries.map(item => <div key={item._id} className="py-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="truncate text-gray-700">{item.kind === 'ai' ? 'Chấm bằng AI' : item.payload?.text?.split('\n')[0] || 'Thông báo'}</span><span className={`shrink-0 text-xs ${item.state === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>{stateLabels[item.state]}</span></div><p className="mt-1 text-xs text-gray-400">{new Date(item.sentAt || item.createdAt).toLocaleString('vi-VN')}{item.lastError ? ` · ${item.lastError}` : ''}</p></div>)}</div>
    </section>
    {error && <p className="text-sm text-red-600">{error}</p>}
  </div>;
}
