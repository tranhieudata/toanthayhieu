import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiCamera, FiImage, FiMessageCircle, FiUsers, FiGrid, FiAward, FiSun, FiPlus, FiX, FiSend, FiHeart, FiZap } from 'react-icons/fi';
import { Avatar, CommunityImage } from '../components/CommunityWidgets';
import Navbar from '../components/Navbar';
import GardenReview from '../components/GardenReview';
import GardenLeaderboard from '../components/GardenLeaderboard';
import GardenArtwork from '../components/GardenArtwork';
import MathArena from '../components/MathArena';
import CommunityWall from '../components/CommunityWall';
import CommunityAccessNotice from '../components/CommunityAccessNotice';
import { FriendshipActions, FriendRequests, FriendRequestNotice } from '../components/CommunityFriends';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import api from '../api/axios';
import '../styles/community.css';

const box = 'community-panel';
const input = 'community-input';
const button = 'community-button';
const errorMessage = e => e.response?.data?.message || 'Không thể kết nối. Vui lòng thử lại.';
const date = d => new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
function useNow() { const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; }

function PostCard({ post, reload, visit, stickers = [] }) {
  const { user, isAdmin } = useAuth();
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  async function act(path, body) {
    setBusy(true);
    try { await api.post(path, body); setText(''); await reload(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <article className="locket-post">
    <div className="flex items-center gap-3 mb-4">
      <button onClick={() => visit(post.author?._id)} aria-label={`Xem tường ${post.author?.name}`}><Avatar person={post.author} frame={post.frame} /></button>
      <div className="flex-1"><button onClick={() => visit(post.author?._id)} className="font-bold hover:text-blue-600">{post.author?.name || 'Học sinh'}</button><p className="text-xs text-gray-400">{date(post.createdAt)} · {post.kind === 'question' ? 'Ảnh hỏi bài' : post.kind === 'story' ? 'Tin 24 giờ' : 'Chia sẻ học tập'}</p></div>
      {(isAdmin || user._id === post.author?._id) && <button className="text-xs text-red-500" disabled={busy} onClick={async () => {
        setBusy(true); try { await api.delete(`/community/posts/${post._id}`); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Gỡ bài</button>}
    </div>
    {post.image ? <div className="locket-photo"><CommunityImage post={post._id} className="locket-photo-image" /><span className="locket-photo-tag">{post.kind === 'question' ? '💡 Cùng giải bài' : post.kind === 'story' ? '✨ Tin hôm nay' : '💛 Một chút chăm chỉ'}</span></div> : <div className="locket-text-moment"><FiHeart aria-hidden="true" /><p>{post.text}</p></div>}
    {post.image && <p className="locket-caption">{post.text}</p>}
    <div className="locket-reactions">
      {[['cheer', '🙌', 'Cổ vũ'], ['heart', '💛', 'Thả tim'], ['helpful', '💡', 'Hữu ích']].map(([kind, emoji, label]) => <button key={kind} disabled={busy} onClick={() => act(`/community/posts/${post._id}/reactions`, { kind })} className={`locket-reaction ${post.myReaction === kind ? 'is-active' : ''}`}>
        {emoji} {label} · {post.reactions?.[kind] || 0}
      </button>)}
    </div>
    <button className="locket-comment-toggle" aria-expanded={commentsOpen} onClick={() => setCommentsOpen(v => !v)}><FiMessageCircle /> {post.comments?.length || 0} lời nhắn <span>{commentsOpen ? 'Thu gọn' : 'Gửi một lời động viên'}</span></button>
    {commentsOpen && <div className="space-y-3 mt-4">
      {post.comments?.map(c => <div className="bg-gray-50 rounded-xl px-3 py-2" key={c._id}>
        <button className="text-sm font-bold text-blue-700" onClick={() => visit(c.author?._id)}>{c.author?.name || 'Học sinh'}</button>
        <p className="text-sm whitespace-pre-wrap break-words">{c.text}</p>
        {post.kind === 'question' && post.image && post.author?._id === user._id && c.author?._id !== user._id && <button disabled={busy} onClick={() => act(`/community/comments/${c._id}/helpful`, {}).then(() => {})} className="mt-1 text-xs text-emerald-700">✓ Ghi nhận giúp đỡ (+10 điểm, một lần cho ảnh hỏi bài)</button>}
      </div>)}
    </div>}
    <form className="flex gap-2 mt-4" onSubmit={e => { e.preventDefault(); act(`/community/posts/${post._id}/comments`, { text }); }}>
      <input aria-label="Viết bình luận" className={input} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Một lời động viên hoặc câu trả lời…" required />
      <button aria-label="Gửi bình luận" className={button} disabled={busy || !text.trim()}><FiSend /></button>
    </form>
    {stickers.length > 0 && <div className="flex gap-2 mt-2">{stickers.map(s => <button key={s.id} title={s.label} onClick={() => setText(t => t + s.value)} className="text-2xl">{s.value}</button>)}</div>}
  </article>;
}

function Feed({ params, setParams }) {
  const { user } = useAuth();
  const { revision } = useCommunity();
  const [posts, setPosts] = useState([]), [stories, setStories] = useState([]), [own, setOwn] = useState([]);
  const [students, setStudents] = useState([]), [search, setSearch] = useState('');
  const [text, setText] = useState(''), [image, setImage] = useState(null), [kind, setKind] = useState(params.get('compose') === 'story' ? 'story' : 'study');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [more, setMore] = useState(false);
  const [garden, setGarden] = useState(null);
  const [preview, setPreview] = useState('');
  const [quota, setQuota] = useState(null), [quotaError, setQuotaError] = useState('');
  const imageLimitReached = Boolean(quota?.enabled && quota.remaining <= 0);
  const loadQuota = useCallback(() => api.get('/community/image-quota').then(r => { setQuota(r.data); setQuotaError(''); }).catch(() => setQuotaError('Chưa tải được số lượt đăng ảnh.')), []);
  const file = useRef();
  const camera = useRef();
  const composer = useRef();
  const author = params.get('author'), focused = params.get('post');
  const visit = authorId => setParams(authorId ? { author: authorId } : {});
  const feedRequest = useRef(0);
  const reload = useCallback(async () => {
    const request = ++feedRequest.current;
    setError('');
    try {
      const [p, s, o] = await Promise.all([
        api.get(focused ? `/community/posts/${focused}` : '/community/posts', { params: { author: author || undefined } }),
        api.get('/community/stories'), api.get('/community/my-posts'),
      ]);
      if (request !== feedRequest.current) return;
      setPosts(focused ? [p.data] : p.data); setMore(!focused && p.data.length === 20); setStories(s.data); setOwn(o.data);
    } catch (e) { if (request === feedRequest.current) setError(errorMessage(e)); }
    finally { if (request === feedRequest.current) setLoading(false); }
  }, [author, focused]);
  useEffect(() => { setLoading(true); reload(); }, [reload]);
  useEffect(() => { loadQuota(); }, [revision, loadQuota]);
  useEffect(() => { api.get('/community/garden').then(r => setGarden(r.data)).catch(() => {}); }, [revision]);
  useEffect(() => { const timer = setTimeout(() => { api.get('/community/people', { params: { q: search } }).then(r => setStudents(r.data)).catch(() => {}); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (params.get('compose') === 'story') setKind('story'); }, [params]);
  useEffect(() => {
    if (params.get('compose')) composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (params.get('friends')) document.getElementById('community-friends')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [params]);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const chooseImage = e => {
    if (imageLimitReached) { e.target.value = ''; toast.error('Bạn đã hết lượt đăng ảnh hôm nay. Hãy quay lại vào ngày mai.'); return; }
    const selected = e.target.files?.[0];
    if (selected && (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024)) { toast.error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB'); e.target.value = ''; return; }
    setImage(selected || null); e.target.value = '';
  };
  const stickers = garden?.rewards?.filter(r => r.type === 'sticker' && garden.inventory.includes(r.id)) || [];
  return <div className="locket-feed-layout">
    <div className="locket-feed-column">
      {author && <CommunityWall author={author} />}
      {!author && <>
      <section className="locket-stories" aria-label="Tin học tập trong 24 giờ">
        <div className="locket-section-heading"><h2>Một ngày của chúng mình</h2><span>24 giờ</span></div>
        <div className="locket-story-list">
          <button className="locket-story" onClick={() => { setKind('story'); setParams({ compose: 'story' }); }}><span className="locket-story-add"><FiPlus /></span><span>Tin của bạn</span></button>
          {stories.map(s => <button className="locket-story" key={s._id} onClick={() => setParams({ post: s._id })}><span className="locket-story-ring"><Avatar person={s.author} frame={s.frame} /></span><span>{s.author?.name}</span></button>)}
          {!stories.length && <p className="locket-story-empty">Một khoảnh khắc nhỏ.<br />Một ngày học vui hơn.</p>}
        </div>
      </section>
      <form ref={composer} className="locket-composer" onSubmit={async e => {
        e.preventDefault();
        if (image && imageLimitReached) { toast.error('Bạn đã hết lượt đăng ảnh hôm nay. Có thể bỏ ảnh để chia sẻ bằng chữ.'); return; }
        setBusy(true);
        try {
          const data = new FormData(); data.append('text', text); data.append('kind', kind);
          if (image) { data.append('image', image); data.append('hasImage', 'true'); }
          const r = await api.post('/community/posts', data);
          if (r.data.imageQuota) setQuota(r.data.imageQuota);
          toast.success(r.data.status === 'pending' ? 'Ảnh đã gửi, chờ thầy duyệt trước khi hiển thị.' : 'Đã chia sẻ!');
          setText(''); setImage(null); if (file.current) file.current.value = ''; await reload();
        } catch (e) { if (e.response?.data?.imageQuota) setQuota(e.response.data.imageQuota); toast.error(errorMessage(e)); } finally { setBusy(false); loadQuota(); }
      }}>
        <div className="locket-composer-top"><span><span className="locket-live-dot" /> Khoảnh khắc học tập</span><select aria-label="Loại bài đăng" value={kind} onChange={e => setKind(e.target.value)}><option value="study">Chia sẻ</option><option value="question">Hỏi bài</option><option value="story">Tin 24 giờ</option></select></div>
        <div className={`locket-photo-quota ${imageLimitReached ? 'is-exhausted' : ''}`} role="status">{quota ? <><span>Hôm nay đã đăng <b>{quota.used}{quota.enabled ? `/${quota.limit}` : ''} ảnh</b></span><span>{quota.enabled ? `Còn ${quota.remaining} ảnh · Làm mới lúc 00:00` : 'Không giới hạn'}</span></> : <span>{quotaError || 'Đang tải số lượt đăng ảnh…'}</span>}{quotaError && <button type="button" onClick={loadQuota}>Tải lại lượt</button>}</div>
        <div className={`locket-camera-stage ${preview ? 'has-photo' : ''}`}>
          {preview ? <><img src={preview} alt="Xem trước ảnh sắp đăng" /><button type="button" className="locket-remove-photo" aria-label="Bỏ ảnh đã chọn" onClick={() => setImage(null)}><FiX /></button></> : <button type="button" className="locket-camera-invitation" disabled={imageLimitReached} onClick={() => camera.current?.click()}><span className="locket-camera-heart"><FiHeart /></span><h2>Học một chút.<br />Chia sẻ một chút.</h2><p>{imageLimitReached ? 'Đã hết lượt ảnh hôm nay. Bạn vẫn có thể viết lời nhắn bên dưới.' : 'Gửi một góc học tập đến bạn bè'}</p><span className="locket-camera-hint"><FiCamera /> {imageLimitReached ? 'Lượt mới bắt đầu lúc 00:00 giờ Việt Nam' : 'Chạm để thêm ảnh'}</span></button>}
          <div className="locket-viewfinder" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
        <label className="sr-only" htmlFor="moment-caption">Lời nhắn cho khoảnh khắc</label>
        <textarea id="moment-caption" className="locket-caption-input" rows={2} maxLength={3000} value={text} onChange={e => setText(e.target.value)} placeholder="Thêm một lời nhắn cho bạn bè…" required />
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Chọn ảnh từ thư viện" onChange={chooseImage} />
        <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" aria-label="Chụp ảnh học tập" onChange={chooseImage} />
        <div className="locket-camera-controls">
          <button type="button" className="locket-round-control" disabled={imageLimitReached} onClick={() => file.current?.click()} aria-label="Mở thư viện ảnh"><FiImage /><span>Thư viện</span></button>
          <button type="button" className="locket-shutter" disabled={imageLimitReached} onClick={() => camera.current?.click()} aria-label="Chụp hoặc chọn ảnh"><span><FiCamera /></span></button>
          <button type="submit" className="locket-round-control locket-send-control" disabled={busy || !text.trim() || Boolean(image && imageLimitReached)}><FiSend /><span>{busy ? 'Đang gửi…' : 'Chia sẻ'}</span></button>
        </div>
        <p className="locket-composer-note">Chỉ những điều tích cực 💛 · Ảnh được thầy duyệt trước khi hiển thị</p>
      </form>
      {own.length > 0 && <details className={box}><summary className="cursor-pointer font-semibold">Bài của tôi đang chờ duyệt / bị từ chối ({own.length})</summary><div className="space-y-3 mt-3">{own.map(p => <div className="border rounded-lg p-3" key={p._id}><span className="text-xs text-amber-700">{p.status === 'pending' ? 'Chờ duyệt' : 'Đã từ chối'}</span><p className="text-sm whitespace-pre-wrap">{p.text}</p>{p.image && <CommunityImage post={p._id} className="max-h-40 mt-2" />}</div>)}</div></details>}
      </>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-lg">{focused ? 'Bài đăng' : author ? 'Bài đăng trên tường' : 'Bảng tin cộng đồng'}</h2><button className="text-sm text-blue-600" onClick={() => { if (focused || author) setParams({}); else reload(); }}>Xem bảng tin chung</button></div>
      {error && <div role="alert" className="bg-red-50 p-4 rounded-xl text-red-700">{error} <button className="underline" onClick={reload}>Thử lại</button></div>}
      {loading ? <div className={`${box} animate-pulse`}>Đang tải bảng tin…</div> : !posts.length && !error ? <div className={`${box} text-gray-500 text-center py-12`}>Chưa có bài đăng. Hãy chia sẻ điều bạn vừa học nhé.</div> : posts.map(p => <PostCard key={p._id} post={p} reload={reload} visit={visit} stickers={stickers} />)}
      {more && <button className={`${button} w-full`} disabled={busy} onClick={async () => {
        setBusy(true); try { const r = await api.get('/community/posts', { params: { author: author || undefined, before: posts.at(-1)._id } }); setPosts(p => [...p, ...r.data]); setMore(r.data.length === 20); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Xem bài cũ hơn</button>}
    </div>
    <aside className={`${box} locket-friends`} id="community-friends">
      <div className="locket-friends-heading"><span className="locket-icon-tile"><FiUsers /></span><div><h2>Bạn cùng học</h2><p>Gần nhau hơn mỗi ngày</p></div></div><input aria-label="Tìm học sinh" className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên bạn…" />
      <FriendRequests />
      <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">{students.map(s => <div key={s._id} className="flex gap-2 items-center"><Avatar person={s} /><div className="min-w-0 flex-1"><button onClick={() => visit(s._id)} className="text-sm font-medium truncate block w-full text-left hover:text-blue-600">{s.name}</button><FriendshipActions person={s} /></div></div>)}</div>
      <button onClick={() => visit(user._id)} className="mt-4 text-blue-600 text-sm">Tường của tôi →</button>
    </aside>
  </div>;
}

function FriendsPage() {
  const { user } = useAuth();
  const { friendships } = useCommunity();
  const [search, setSearch] = useState(''), [students, setStudents] = useState([]), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get('/community/people', { params: { q: search }, signal: controller.signal, timeout: 10000 }).then(r => { setStudents(r.data.filter(s => s._id !== user._id)); setError(''); }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, user._id]);
  return <div className="grid md:grid-cols-2 gap-5">
    <section className={box}><h2 className="font-bold text-lg">Bạn bè & lời mời</h2><p className="text-sm text-gray-500 mt-2">Chấp nhận lời mời để hai bạn có thể trò chuyện.</p><FriendRequests showEmpty />
      <h3 className="font-semibold text-sm mb-4">Bạn bè của tôi ({friendships.friends.length})</h3><div className="space-y-4">{friendships.friends.map(p => <div className="flex gap-3 items-center" key={p._id}><Link to={`/community?author=${p._id}`} aria-label={`Thăm tường ${p.name}`}><Avatar person={p} /></Link><div><Link to={`/community?author=${p._id}`} className="text-sm font-bold hover:text-blue-600">{p.name}</Link><Link to={`/community?author=${p._id}`} className="block text-xs text-blue-600 mt-1">Thăm tường nhà →</Link><FriendshipActions person={p} /></div></div>)}</div>
    </section>
    <section className={box}><h2 className="font-bold text-lg mb-2">Tìm và kết bạn</h2><p className="text-xs text-gray-500 mb-4">Chọn đúng tài khoản theo nhãn Quản trị viên hoặc Học sinh, đặc biệt khi trùng tên.</p><input aria-label="Tìm học sinh hoặc quản trị viên để kết bạn" className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nhập tên học sinh hoặc quản trị viên…" />
      {error && <p role="alert" className="text-sm text-red-500 mt-3">{error}</p>}
      <div className="space-y-4 mt-5">{students.map(p => <div className="flex gap-3 items-center" key={p._id}><Link to={`/community?author=${p._id}`} aria-label={`Thăm tường ${p.name}`}><Avatar person={p} /></Link><div><Link to={`/community?author=${p._id}`} className="text-sm font-bold hover:text-blue-600">{p.name}</Link><Link to={`/community?author=${p._id}`} className="block text-xs text-blue-600 mt-1">Thăm tường nhà →</Link><FriendshipActions person={p} /></div></div>)}</div>
    </section>
  </div>;
}

function Chat({ params, setParams, policy }) {
  const { user } = useAuth();
  const { revision, connected, inbox, refresh, friendships, friendshipsReady } = useCommunity();
  const [conversation, setConversation] = useState({ peer: null, messages: [], more: false });
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [search, setSearch] = useState('');
  const [error, setError] = useState({ peer: null, message: '' });
  const bottom = useRef(), selectedPeer = useRef(), requestVersion = useRef(0);
  const peer = params.get('peer');
  selectedPeer.current = peer;
  const friend = friendships.friends.find(s => s._id === peer);
  const canChat = friendshipsReady && Boolean(friend);
  const students = friendships.friends.filter(s => s.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const messages = canChat && conversation.peer === peer ? conversation.messages : [];
  const more = canChat && conversation.peer === peer && conversation.more;
  const merge = (old, added) => [...new Map([...old, ...added].map(m => [m._id, m])).values()].sort((a, b) => a._id.localeCompare(b._id));
  useEffect(() => { setText(''); }, [peer]);
  useEffect(() => {
    const version = ++requestVersion.current;
    if (!peer || !canChat) { setConversation({ peer, messages: [], more: false }); return; }
    const controller = new AbortController();
    api.get(`/community/messages/${peer}`, { signal: controller.signal }).then(r => {
      if (requestVersion.current !== version) return;
      setConversation(c => ({ peer, messages: merge(c.peer === peer ? c.messages : [], r.data), more: c.peer === peer && c.messages.length > 50 ? c.more : r.data.length === 50 }));
      setError({ peer, message: '' }); refresh();
    }).catch(e => {
      if (controller.signal.aborted || requestVersion.current !== version) return;
      setError({ peer, message: errorMessage(e) });
      if ([403, 404].includes(e.response?.status)) { setConversation({ peer, messages: [], more: false }); refresh(); }
    });
    return () => { ++requestVersion.current; controller.abort(); };
  }, [peer, canChat, revision, refresh]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [peer, messages.at(-1)?._id]);
  return <div className={`${box} grid md:grid-cols-[240px_minmax(0,1fr)] gap-5`}>
    <aside><h2 className="font-bold mb-2">Bạn bè của tôi</h2><p className="text-xs text-gray-500 mb-3">Chỉ bạn bè đã chấp nhận mới có thể chat.</p><input aria-label="Tìm trong bạn bè" className={input} placeholder="Tìm bạn đã kết nối…" value={search} onChange={e => setSearch(e.target.value)} /><FriendRequests /><div className="max-h-80 md:max-h-[32rem] overflow-auto mt-3 space-y-1">{students.map(s => <button disabled={busy} className={`w-full flex gap-2 items-center text-left p-2 rounded-xl ${peer === s._id ? 'bg-blue-50' : 'hover:bg-gray-50'}`} key={s._id} onClick={() => setParams({ tab: 'chat', peer: s._id })}><Avatar person={s} /><span className="flex-1 text-sm">{s.name}</span>{inbox.find(i => i._id === s._id)?.count > 0 && <span className="text-xs bg-blue-600 text-white rounded-full px-2">{inbox.find(i => i._id === s._id).count}</span>}</button>)}{friendshipsReady && !students.length && <p className="text-sm text-gray-500 py-3">{search ? 'Không tìm thấy bạn trong danh sách.' : 'Chưa có bạn bè. Gửi lời mời và chờ bạn chấp nhận nhé.'}</p>}</div><button className="text-sm text-blue-600 mt-4" onClick={() => setParams({ friends: '1' })}>＋ Tìm và kết bạn</button></aside>
    <div className="min-w-0"><div className="border-b pb-3"><h2 className="font-bold">{friend?.name || 'Chọn một người bạn để trò chuyện'}</h2><p className={`text-xs ${connected ? 'text-emerald-600' : 'text-amber-600'}`}>{connected ? '● Kết nối trực tiếp' : '● Đang kết nối lại · tự đồng bộ tin nhắn'}</p></div>
      {error.peer === peer && error.message && <p role="alert" className="text-red-600 text-sm p-3">{error.message}</p>}
      <div className="h-80 md:h-[28rem] overflow-y-auto space-y-3 py-4">
        {!friendshipsReady && <p className="text-center text-gray-400 text-sm">Đang kiểm tra danh sách bạn bè…</p>}
        {friendshipsReady && peer && !canChat && <p className="text-center text-gray-400 text-sm">Hai bạn cần kết bạn và chấp nhận lời mời trước khi trò chuyện.</p>}
        {more && <button className="text-sm text-blue-600 w-full" onClick={async () => { const version = requestVersion.current; try { const r = await api.get(`/community/messages/${peer}`, { params: { before: messages[0]._id } }); if (requestVersion.current !== version) return; setConversation(c => c.peer === peer ? { peer, messages: merge(r.data, c.messages), more: r.data.length === 50 } : c); } catch (e) { toast.error(errorMessage(e)); } }}>Tin nhắn cũ hơn</button>}
        {canChat && !messages.length && <p className="text-center text-gray-400 text-sm">Bắt đầu bằng một lời chào tích cực nhé!</p>}
        {messages.map(m => <div className={`flex ${m.sender === user._id ? 'justify-end' : ''}`} key={m._id}><div className={`max-w-[85%] rounded-2xl p-3 ${m.sender === user._id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}><p className="whitespace-pre-wrap break-words text-sm">{m.text}</p><p className="text-[10px] opacity-60 mt-1">{date(m.createdAt)}</p></div></div>)}<div ref={bottom} />
      </div>
      <form className="flex gap-2 border-t pt-3" onSubmit={async e => {
        e.preventDefault(); if (!canChat || busy) return;
        const recipient = peer; setBusy(true);
        try {
          const r = await api.post(`/community/messages/${recipient}`, { text });
          if (selectedPeer.current === recipient) { setText(''); setConversation(c => ({ peer: recipient, messages: merge(c.peer === recipient ? c.messages : [], [r.data]), more: c.peer === recipient && c.more })); }
          refresh();
        } catch (e) { toast.error(errorMessage(e)); if (e.response?.status === 403) refresh(); }
        finally { setBusy(false); }
      }}>
        <input aria-label="Nội dung tin nhắn" className={input} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={!canChat ? 'Chỉ nhắn tin với bạn bè đã kết nối' : policy?.inCurfew ? 'Đang trong giờ nghỉ' : 'Nhắn một lời tích cực…'} disabled={!canChat || policy?.inCurfew} required /><button className={button} disabled={!canChat || !text.trim() || busy || policy?.inCurfew}>Gửi</button>
      </form>
    </div>
  </div>;
}

function MemoryGame({ until }) {
  const now = useNow();
  const [cards, setCards] = useState(() => ['🌱', '📚', '🌟', '💡', '🌱', '📚', '🌟', '💡'].map((value, i) => ({ value, i, random: Math.random() })).sort((a, b) => a.random - b.random));
  const [open, setOpen] = useState([]), [matched, setMatched] = useState([]);
  useEffect(() => { if (open.length !== 2) return; const timer = setTimeout(() => { if (cards[open[0]].value === cards[open[1]].value) setMatched(m => [...m, ...open]); setOpen([]); }, 700); return () => clearTimeout(timer); }, [open, cards]);
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  return <div className="mt-4"><p className="text-sm mb-3">Ghép các cặp hình giống nhau · Còn {seconds}s {matched.length === 8 && '🎉 Hoàn thành!'}</p><div className="grid grid-cols-4 gap-2 max-w-sm">{cards.map((c, i) => <button className="rounded-xl p-4 bg-indigo-100 text-3xl" disabled={!seconds || open.length === 2 || matched.includes(i) || open.includes(i)} key={c.i} onClick={() => setOpen(o => [...o, i])}>{open.includes(i) || matched.includes(i) ? c.value : '?'}</button>)}</div>{matched.length === 8 && seconds > 0 && <button className="mt-3 text-sm text-blue-600" onClick={() => { setCards(c => [...c].sort(() => Math.random() - .5)); setOpen([]); setMatched([]); }}>Chơi ván tiếp</button>}</div>;
}

function Garden() {
  const [garden, setGarden] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(() => api.get('/community/garden').then(r => setGarden(r.data)).catch(e => setError(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);
  async function act(url, data) { setBusy(true); try { const r = await api.post(`/community/${url}`, data); await load(); return r.data; } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }
  if (!garden) return <div className={box}>{error || 'Đang chăm vườn…'}</div>;
  const waterLevel = garden.lastWatered ? Math.max(0, Math.min(100, Math.round((1 - (Date.now() - new Date(garden.lastWatered).getTime()) / (3 * 86400000)) * 100))) : 0;
  const wateredToday = garden.lastWatered && new Date(garden.lastWatered).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) === new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return <div className="garden-layout">
    <section className={`${box} garden-main-card`}>
      <header className="garden-card-heading"><span className="garden-eyebrow">HỌC MỖI NGÀY · XANH MỖI NGÀY</span><h2>Khu vườn của bạn</h2><p>Mỗi điều bạn học, một mầm xanh lớn lên.</p></header>
      <div className="garden-scene"><span className="garden-level">✦ {garden.growth >= 20 ? 'Cây tri thức' : garden.growth >= 7 ? 'Cây đang lớn' : 'Hành trình mới'}</span><GardenArtwork growth={garden.growth} />
        <div className="garden-water-status"><span>💧 Độ ẩm của cây</span><strong>{waterLevel}%</strong><progress max="100" value={waterLevel} aria-label="Độ ẩm của cây" /><small>{waterLevel === 0 ? 'Cùng tưới cây nhé!' : 'Ôn tập để giữ cây xanh'}</small></div>
      </div>
      <div className="garden-motivation" aria-live="polite"><h3>{garden.needsWater || !garden.lastWatered ? 'Cây đang cần một chút nước' : 'Cây đang lớn lên cùng bạn'}</h3><p><span>🔥 {garden.growth} ngày chăm cây</span> · {garden.lastWatered ? `Lần cuối: ${date(garden.lastWatered)}` : 'Bắt đầu chăm cây hôm nay'}</p></div>
      <div className="garden-resources"><div><span>NĂNG LƯỢNG</span><strong>{garden.energy} <span>⚡ còn lại</span></strong><small>Dùng để đổi những món quà</small></div><div><span>NƯỚC HÔM NAY</span><strong>{wateredToday ? 1 : 0} <span>💧 lượt tưới</span></strong><small>Tự động khi hoàn thành bài</small></div></div>
      <GardenReview onComplete={load} />
      <Link className="garden-homework-link" to="/homeworks">Làm bài tập <span aria-hidden="true">→</span></Link>
      <div className="garden-missions"><h3>✨ Bí kíp nuôi cây</h3><p><span>Bài tập có ảnh</span><b>+10 điểm/bài</b></p><p><span>Ảnh học tập được duyệt</span><b>+15 điểm/ngày</b></p><p><span>Giúp ảnh hỏi bài được ghi nhận</span><b>+10 điểm/ảnh</b></p><small>Mỗi câu ôn tập đúng = 1 ⚡. Mỗi ngày cây lớn một lần; sau 3 ngày chưa chăm, cây sẽ cần nước.</small></div>
      <p className="garden-point-summary">Đã tích lũy: <b>{garden.studyPoints}</b> học tập · <b>{garden.communityPoints}</b> cộng đồng</p>
    </section>
    <div className="space-y-5"><GardenLeaderboard points={garden.studyPoints + garden.communityPoints} /><section className={box}><h2 className="font-bold text-xl mb-4">Đổi năng lượng lấy niềm vui</h2><div className="space-y-3">{garden.rewards.map(r => <div className="flex items-center justify-between gap-3 p-3 border rounded-xl" key={r.id}><div><b className="text-sm">{r.label}</b><p className="text-sm text-amber-600">{r.cost} ⚡</p></div><button className={button} disabled={busy || garden.energy < r.cost || garden.inventory.includes(r.id)} onClick={async () => { const data = await act('rewards/redeem', { item: r.id }); if (data) toast.success('Đổi thành công!'); }}>{garden.inventory.includes(r.id) ? 'Đã mở' : 'Đổi'}</button></div>)}</div>
      {garden.inventory.includes('frame-green') && <button className="text-emerald-700 text-sm mt-4" disabled={busy} onClick={() => act('rewards/equip', { item: garden.equippedFrame ? '' : 'frame-green' })}>{garden.equippedFrame ? 'Tháo khung xanh' : 'Dùng khung avatar xanh'}</button>}
      <p className="text-xs text-gray-500 mt-3">Sticker đã mở xuất hiện khi bình luận. Quà nhỏ do admin xác nhận và trao trực tiếp.</p>
      {garden.redemptions?.map(r => <p className="text-sm mt-2" key={r._id}>🎁 {r.label} · {r.status === 'delivered' ? 'Đã trao' : 'Đang chờ trao'}</p>)}
    </section><section className={box}><h2 className="font-bold">Game luyện trí nhớ</h2><p className="text-sm text-gray-500 mt-1">Còn {garden.gameMinutes} phút. Mỗi lượt sử dụng 1 phút.</p><button className={`${button} mt-3`} disabled={busy} onClick={() => act('game/start', {})}>Bắt đầu / tiếp tục</button>{garden.gameUntil && new Date(garden.gameUntil) > new Date() && <MemoryGame until={garden.gameUntil} />}</section></div>
  </div>;
}

function Challenges() {
  const [challenges, setChallenges] = useState([]), [monthly, setMonthly] = useState(null), [month, setMonth] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7));
  const [active, setActive] = useState(null), [answers, setAnswers] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const now = useNow();
  const load = useCallback(() => api.get('/community/challenges').then(r => setChallenges(r.data)).catch(e => setError(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/community/monthly', { params: { month } }).then(r => setMonthly(r.data)).catch(e => setError(errorMessage(e))); }, [month, challenges]);
  useEffect(() => { if (!active) return; sessionStorage.setItem(`challenge:${active.id}`, JSON.stringify(answers)); }, [active, answers]);
  const left = active ? Math.max(0, Math.ceil((new Date(active.attempt.deadline).getTime() - now) / 1000)) : 0;
  return <div className="space-y-5">
    <section className={box}><h2 className="text-xl font-bold">Thử thách tuần</h2><p className="text-sm text-gray-500 mt-2">Chỉ học sinh đang thuộc lớp phù hợp được tham gia. Mỗi thử thách có một lượt; đồng hồ tiếp tục chạy khi rời trang. Hãy nộp trước khi hết giờ để ghi nhận kết quả. Mỗi câu đúng nhận 5 điểm năng lượng.</p></section>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {active && <section className={`${box} border-blue-300`}><div className="flex justify-between"><h3 className="font-bold">{active.title}</h3><span className="font-mono text-red-600">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></div>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { const r = await api.post(`/community/challenges/${active.id}/submit`, { answers }); toast.success(`Đã nộp: ${r.data.score}/${active.questions.length} câu đúng`); sessionStorage.removeItem(`challenge:${active.id}`); setActive(null); await load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>
        {active.questions.map((q, i) => <fieldset disabled={!left || busy} key={q._id} className="my-5"><legend className="font-medium whitespace-pre-wrap">{i + 1}. {q.prompt}</legend><div className="space-y-2 mt-2">{q.options.map((o, j) => <label className="flex gap-3 items-start bg-gray-50 rounded-lg p-3" key={j}><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers(a => a.map((v, k) => k === i ? j : v))} /><span>{o}</span></label>)}</div></fieldset>)}
        <button className={button} disabled={!left || busy}>{left ? 'Nộp bài' : 'Đã hết giờ'}</button>{!left && <button type="button" className="ml-4 text-blue-600" onClick={() => { setActive(null); load(); }}>Đóng lượt làm</button>}
      </form>
    </section>}
    {!challenges.length && !error && <div className={box}>Thầy chưa mở thử thách. Hãy quay lại sau nhé.</div>}
    <div className="grid md:grid-cols-2 gap-4">{challenges.map(c => {
      const closed = now >= new Date(c.endsAt).getTime() || (c.attempt && new Date(c.attempt.deadline).getTime() <= now), future = now < new Date(c.startsAt).getTime();
      return <section className={box} key={c._id}><h3 className="font-bold text-lg">🏆 {c.title}</h3><p className="text-sm text-gray-600 whitespace-pre-wrap my-2">{c.description}</p><p className="text-xs text-gray-500">{date(c.startsAt)} → {date(c.endsAt)}<br />Thời lượng: {c.durationMinutes} phút · Giờ Việt Nam</p>{c.monthlyPrize && <p className="text-sm text-amber-700 my-2">🎁 Quà tháng: {c.monthlyPrize}</p>}
        <p className="text-sm my-3">{c.attempt?.submittedAt ? `Đã nộp · ${c.attempt.score} câu đúng` : !c.eligible ? 'Bạn cần tham gia lớp phù hợp' : future ? 'Sắp mở' : closed ? 'Đã kết thúc lượt làm' : 'Đang mở'}</p>
        <button className={button} disabled={busy || active || !c.eligible || future || closed || Boolean(c.attempt?.submittedAt)} onClick={async () => { setBusy(true); try { const r = await api.post(`/community/challenges/${c._id}/start`); let saved; try { saved = JSON.parse(sessionStorage.getItem(`challenge:${c._id}`)); } catch {} setAnswers(Array.isArray(saved) && saved.length === r.data.questions.length ? saved : r.data.questions.map(() => -1)); setActive({ ...r.data, id: c._id, title: c.title }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>{c.attempt ? 'Tiếp tục làm' : 'Bắt đầu thử thách'}</button>
      </section>;
    })}</div>
    <section className={box}><div className="flex justify-between flex-wrap gap-3"><h2 className="font-bold text-xl">Tổng kết & quà theo tháng</h2><input aria-label="Tháng tổng kết" type="month" className="border rounded-lg p-2" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></div><div className="overflow-x-auto mt-4"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Học sinh</th><th>Điểm</th><th>Số thử thách</th><th>Quà đã trao</th></tr></thead><tbody>{monthly?.rows.map((r, i) => <tr key={r._id} className="border-b"><td className="p-3">{i + 1}. {r.name}</td><td>{r.score}</td><td>{r.completed}</td><td>{r.gift || '—'}</td></tr>)}</tbody></table>{!monthly?.rows.length && <p className="text-center py-8 text-gray-400">Chưa có bài nộp trong tháng này.</p>}</div></section>
  </div>;
}

function CommunityContent() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [policy, setPolicy] = useState(null);
  const { revision, friendships, inbox } = useCommunity();
  const unreadMessages = inbox.reduce((total, conversation) => total + conversation.count, 0);
  useEffect(() => { api.get('/community/policy').then(r => setPolicy(r.data)).catch(() => {}); }, [revision]);
  const tab = params.get('tab') || (params.has('friends') ? 'friends' : 'feed');
  const tabs = [['feed', FiGrid, 'Khoảnh khắc'], ['chat', FiMessageCircle, 'Trò chuyện'], ['garden', FiSun, 'Vườn của tôi'], ['challenges', FiAward, 'Thử thách'], ['arena', FiZap, 'Đấu trường']];
  return <div className="community-locket"><Navbar /><main className={`locket-main ${tab === 'feed' ? 'is-feed' : ''}`}>
    <div className="locket-page-heading"><div><p>BẠN BÈ Ở ĐÂY. NIỀM VUI Ở ĐÂY.</p><h1>{tab === 'friends' ? 'Kết nối những người bạn.' : tab === 'chat' ? 'Một lời nhắn, thêm gần nhau.' : tab === 'garden' ? 'Lớn lên từng chút một.' : tab === 'arena' ? 'Sẵn sàng bứt phá cùng Toán?' : tab === 'challenges' ? 'Cùng nhau thử sức nhé.' : 'Những điều nhỏ, thật đáng nhớ.'}</h1></div><button className="locket-friends-shortcut" aria-label={`Bạn bè${friendships.incoming.length ? `, ${friendships.incoming.length} lời mời mới` : ''}`} onClick={() => setParams({ tab: 'friends' })}><FiUsers /> Bạn bè{friendships.incoming.length > 0 && <span className="locket-invitation-count">{friendships.incoming.length}</span>}</button></div>
    {tab !== 'friends' && <FriendRequestNotice />}
    {policy?.curfewEnabled && <div className={`locket-curfew ${policy.inCurfew ? 'is-curfew' : ''}`}><span>☾</span><p>{policy.inCurfew ? 'Đến giờ nghỉ rồi. Hẹn bạn ngày mai nhé!' : 'Học vui, ngủ ngon.'}<small>Giờ nghỉ {policy.curfewStart}–{policy.curfewEnd} · Giờ Việt Nam{policy.inCurfew ? ' · Tạm dừng đăng bài, bình luận và chat' : ''}</small></p></div>}
    <nav aria-label="Mạng xã hội học tập" className="locket-navigation">{tabs.map(([key, Icon, label], i) => <button key={key} aria-label={key === 'chat' && unreadMessages > 0 ? `${label}, ${unreadMessages} tin nhắn chưa đọc` : label} aria-current={tab === key ? 'page' : undefined} className={`locket-nav-item ${tab === key ? 'is-active' : ''} ${i > 1 ? 'after-camera' : ''}`} onClick={() => setParams(key === 'feed' ? {} : { tab: key })}><span className="locket-nav-icon"><Icon />{key === 'chat' && unreadMessages > 0 && <span className="locket-unread-badge" aria-hidden="true">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}</span><span>{label}</span></button>)}<button className="locket-nav-camera" aria-label="Tạo khoảnh khắc" onClick={() => setParams({ compose: 'photo' })}><FiCamera /></button></nav>
    {tab === 'friends' ? <FriendsPage /> : tab === 'feed' ? <Feed params={params} setParams={setParams} /> : tab === 'chat' ? <Chat params={params} setParams={setParams} policy={policy} /> : tab === 'garden' ? <Garden /> : tab === 'challenges' ? <Challenges /> : tab === 'arena' ? <MathArena /> : <p>Tab không hợp lệ.</p>}
  </main></div>;
}

export default function CommunityPage() {
  const { access } = useCommunity();
  if (!access?.allowed) return <div className="community-locket"><Navbar /><main className="locket-main"><CommunityAccessNotice /></main></div>;
  return <CommunityContent />;
}
