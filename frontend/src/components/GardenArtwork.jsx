import { useId } from 'react';

// Local vector artwork stays crisp on small screens and needs no external image service.
export default function GardenArtwork({ growth = 0 }) {
  const id = useId().replace(/:/g, '');
  return <svg className="garden-artwork" viewBox="0 0 480 350" role="img" aria-label={`Cây tri thức trên đảo xanh cùng robot đồng hành · ${growth} ngày chăm cây`}>
    <defs>
      <linearGradient id={`${id}grass`} x2=".8" y2="1"><stop stopColor="#d5ed99" /><stop offset="1" stopColor="#87bd67" /></linearGradient>
      <linearGradient id={`${id}earth`} x2="0" y2="1"><stop stopColor="#c99c68" /><stop offset="1" stopColor="#93683f" /></linearGradient>
      <linearGradient id={`${id}trunk`}><stop stopColor="#805133" /><stop offset=".5" stopColor="#bb8451" /><stop offset="1" stopColor="#70492f" /></linearGradient>
      <radialGradient id={`${id}leaf`} cx=".35" cy=".2"><stop stopColor="#bbdc75" /><stop offset=".5" stopColor="#71ac53" /><stop offset="1" stopColor="#397650" /></radialGradient>
      <radialGradient id={`${id}coin`} cx=".3" cy=".2"><stop stopColor="#fff5ba" /><stop offset=".65" stopColor="#ffda65" /><stop offset="1" stopColor="#e6a936" /></radialGradient>
      <linearGradient id={`${id}bot`} x2="1" y2="1"><stop stopColor="#f7ffff" /><stop offset="1" stopColor="#8ecfd2" /></linearGradient>
    </defs>
    <ellipse cx="244" cy="305" rx="197" ry="29" fill="#294d32" opacity=".09" />
    <path d="M37 251 Q35 242 50 235 L218 175 Q236 169 253 176 L431 239 Q444 244 441 258 L441 278 Q440 288 425 294 L261 346 Q242 351 224 345 L53 287 Q37 281 37 270Z" fill={`url(#${id}earth)`} stroke="#916b44" strokeWidth="2" />
    <path d="M39 249 Q36 239 52 232 L220 174 Q236 168 253 175 L429 236 Q449 244 431 254 L262 315 Q245 321 226 315 L54 260Z" fill={`url(#${id}grass)`} stroke="#73984e" strokeWidth="3" />
    <path d="M243 319V347" stroke="#825c3a" strokeWidth="2" opacity=".5" />
    {[70, 112, 163, 287, 333, 390, 420].map((x, i) => <circle key={x} cx={x} cy={x < 240 ? 276 + i * 6 : 320 - i * 7} r="3" fill="#765134" opacity=".6" />)}
    <ellipse cx="235" cy="249" rx="74" ry="17" fill="#4e7938" opacity=".24" />
    <path d="M225 254 Q235 221 223 178 L194 141 L208 131 L237 163 L241 117 L258 118 L255 177 L291 148 L300 159 Q258 194 255 222 Q254 245 274 256 L249 251 L239 263 L234 250 L211 259Z" fill={`url(#${id}trunk)`} stroke="#735032" strokeWidth="2.5" />
    <path d="M240 241 Q246 212 240 183 M227 173 L208 151 M254 188 L280 166" fill="none" stroke="#e4b37c" strokeWidth="3" strokeLinecap="round" />
    <g fill={`url(#${id}leaf)`} stroke="#428052" strokeWidth="1.5">
      {[[174,145,49],[294,143,51],[224,94,57],[271,98,51],[152,115,37],[180,78,41],[244,57,39],[292,72,38],[317,109,33],[208,136,49],[262,139,49]].map(([x,y,r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
    </g>
    <g opacity=".55" fill="#d5e992">
      {Array.from({ length: 40 }, (_, i) => { const angle = i * 2.39996; const radius = 20 + (i % 6) * 12; return <ellipse key={i} cx={236 + Math.cos(angle) * radius * 1.15} cy={108 + Math.sin(angle) * radius * .72} rx="9" ry="4.5" transform={`rotate(${i * 31} ${236 + Math.cos(angle) * radius * 1.15} ${108 + Math.sin(angle) * radius * .72})`} />; })}
    </g>
    {[[170,126,'+'],[215,69,'π'],[277,80,'÷'],[305,132,'×'],[243,139,'='],[192,162,'√']].map(([x,y,symbol]) => <g key={symbol} className="garden-math-fruit"><path d={`M${x} ${y - 17}v8`} stroke="#614f2d" strokeWidth="2" /><circle cx={x} cy={y} r="13" fill={`url(#${id}coin)`} stroke="#d99d36" strokeWidth="1.5" /><text x={x} y={y + 5} textAnchor="middle" fill="#8c641d" fontSize="16" fontWeight="800">{symbol}</text><circle cx={x-4} cy={y-5} r="2" fill="#fff" opacity=".8" /></g>)}
    <g fill="#f3d882">{[[102,244],[313,266],[167,276]].map(([x,y]) => <g key={x}><path d={`M${x-5} ${y+4}q4-15 10 0`} fill="#5e994b" /><circle cx={x} cy={y-3} r="4" /><circle cx={x} cy={y-3} r="1.5" fill="#b78145" /></g>)}</g>
    <g className="garden-robot" stroke="#448e96" strokeWidth="2.5" strokeLinejoin="round">
      <ellipse cx="367" cy="274" rx="27" ry="7" fill="#365d47" opacity=".16" stroke="none" />
      <path d="M354 255L350 271Q357 278 363 270L365 257M374 256L377 272Q387 277 389 269L383 252" fill={`url(#${id}bot)`} />
      <rect x="349" y="221" width="36" height="38" rx="13" fill={`url(#${id}bot)`} />
      <rect x="360" y="229" width="16" height="15" rx="5" fill="#ffdf73" />
      <path d="M368 232v8m-4-4h8" stroke="#b59239" strokeWidth="2" />
      <path d="M349 231Q334 237 331 222M384 232Q398 235 399 223" fill="none" stroke="#8ecfd2" strokeWidth="9" strokeLinecap="round" />
      <circle cx="331" cy="219" r="6" fill="#e6ffff" /><circle cx="399" cy="220" r="6" fill="#e6ffff" />
      <path d="M367 185v-12" /><circle cx="367" cy="170" r="5" fill="#ffdc6b" />
      <rect x="338" y="185" width="60" height="43" rx="20" fill={`url(#${id}bot)`} />
      <rect x="345" y="193" width="46" height="26" rx="12" fill="#214f60" stroke="none" />
      <path d="M354 204q3-6 6 0m14 0q3-6 6 0" fill="none" stroke="#a8f5ed" strokeLinecap="round" />
      <path d="M363 211q5 5 10 0" fill="none" stroke="#a8f5ed" strokeWidth="1.5" />
    </g>
    <g fill="#efc75a"><path d="M357 112l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" /><path d="M116 175l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" /></g>
  </svg>;
}

export function StudentAvatar({ seed = '' }) {
  const value = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const colors = ['#e0eddc', '#fde5d6', '#e2e8fb', '#f9e4ef', '#fff0c9'];
  const hair = ['#44352f', '#654336', '#303c46', '#785145'][value % 4];
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="garden-student-avatar">
    <circle cx="24" cy="24" r="24" fill={colors[value % 5]} />
    <path d="M9 47q1-14 15-14t15 14" fill={['#6b9b8a','#db9b6a','#859acb'][value % 3]} />
    <path d="M11 29V20q0-15 13-15t13 15v12" fill={hair} />
    {value % 2 === 0 && <><circle cx="10" cy="26" r="6" fill={hair} /><circle cx="38" cy="26" r="6" fill={hair} /></>}
    <rect x="20" y="31" width="8" height="8" rx="4" fill="#eaba98" />
    <ellipse cx="24" cy="23" rx="12" ry="13" fill="#fbd8bc" />
    <path d="M12 21Q9 6 25 8q14 0 12 14-9-2-14-10-2 8-11 9" fill={hair} />
    <ellipse cx="19" cy="25" rx="1.6" ry="2.2" fill="#3d3639" /><ellipse cx="29" cy="25" rx="1.6" ry="2.2" fill="#3d3639" />
    <path d="M21 31q3 3 6 0" fill="none" stroke="#b96f65" strokeWidth="1.4" strokeLinecap="round" />
    <ellipse cx="15" cy="29" rx="3" ry="1.5" fill="#eca59a" opacity=".6" /><ellipse cx="33" cy="29" rx="3" ry="1.5" fill="#eca59a" opacity=".6" />
    <path d="M18 37l6 5 6-5" fill="none" stroke="#fff" strokeWidth="2" />
  </svg>;
}

export function WateringCan() {
  return <svg viewBox="0 0 56 48" fill="none" aria-hidden="true"><path d="M37 17q20-12 15 8l-10 8" stroke="#986323" strokeWidth="5" /><path d="M16 25L5 17l-3 5 15 16" fill="#83c9c3" stroke="#438f8e" strokeWidth="2" /><path d="M15 17h27l3 23q-14 8-29-1Z" fill="#ffd467" stroke="#ae772c" strokeWidth="2" /><ellipse cx="28" cy="18" rx="13" ry="4" fill="#fff0b3" stroke="#ae772c" strokeWidth="2" /><path d="M26 27q-7 8 0 10t0-10" fill="#76c6d5" /><path d="M5 29l-2 4m7 0-2 4" stroke="#88d5e4" strokeWidth="2" strokeLinecap="round" /></svg>;
}
