import { FiMoon, FiSun } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme, savingTheme } = useTheme();
  const label = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối';
  return <button type="button" className="theme-toggle" aria-label={label} title={label} disabled={savingTheme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <FiSun /> : <FiMoon />}</button>;
}

export function ThemeSettings() {
  const { theme, setTheme, savingTheme } = useTheme();
  return <section className="community-panel theme-settings" aria-labelledby="theme-heading">
    <h2 id="theme-heading">Chế độ giao diện</h2>
    <p className="theme-description">Áp dụng cho tất cả các trang. Lựa chọn được lưu riêng cho tài khoản của bạn.</p>
    <div className="theme-options" role="group" aria-label="Chọn nền giao diện">
      {[['light', FiSun, 'Nền sáng', 'White mode'], ['dark', FiMoon, 'Nền tối', 'Dark mode']].map(([value, Icon, label, detail]) => <button key={value} type="button" className={`theme-option ${theme === value ? 'is-selected' : ''}`} disabled={savingTheme} aria-pressed={theme === value} onClick={() => setTheme(value)}>
        <span className={`theme-swatch theme-swatch-${value}`}><Icon /></span><span><b>{label}</b><small>{detail}</small></span><span aria-hidden="true" className="theme-check">{theme === value ? '✓' : ''}</span>
      </button>)}
    </div>
    <p className="theme-description" role="status">{savingTheme ? 'Đang lưu lựa chọn…' : 'Tự động lưu khi chọn.'}</p>
  </section>;
}
