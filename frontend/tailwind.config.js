/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';
import colors from 'tailwindcss/colors';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [plugin(({ addBase }) => {
    const rules = {};
    const neutrals = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
    const families = [...neutrals, 'blue', 'indigo', 'purple', 'violet', 'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky'];
    for (const family of families) {
      const neutral = neutrals.includes(family);
      for (const shade of [50, 100, 200, 300]) {
        const background = neutral ? (shade < 100 ? '#101012' : shade < 200 ? '#19191c' : '#27272b') : `color-mix(in srgb, ${colors[family][900]} 40%, #141416)`;
        for (const prefix of ['', 'hover:']) {
          const pseudo = prefix ? ':hover' : '';
          const escaped = prefix ? 'hover\\:' : '';
          rules[`html[data-theme="dark"] .${escaped}bg-${family}-${shade}${pseudo}`] = { backgroundColor: background };
        }
        rules[`html[data-theme="dark"] .border-${family}-${shade}`] = { borderColor: neutral ? '#3f3f46' : colors[family][800] };
        if (shade === 50) for (const opacity of [40, 50, 60, 70]) {
          rules[`html[data-theme="dark"] .bg-${family}-${shade}\\/${opacity}`] = { backgroundColor: background };
        }
        rules[`html[data-theme="dark"] .from-${family}-${shade}`] = {
          '--tw-gradient-from': `${background} var(--tw-gradient-from-position)`,
          '--tw-gradient-to': 'transparent var(--tw-gradient-to-position)',
          '--tw-gradient-stops': 'var(--tw-gradient-from), var(--tw-gradient-to)',
        };
        rules[`html[data-theme="dark"] .to-${family}-${shade}`] = { '--tw-gradient-to': `${background} var(--tw-gradient-to-position)` };
      }
      for (const shade of [400, 500, 600, 700, 800, 900, 950]) {
        const foreground = neutral ? (shade >= 700 ? '#f4f4f5' : '#b3b3bd') : colors[family][300];
        rules[`html[data-theme="dark"] .text-${family}-${shade}`] = { color: foreground };
        rules[`html[data-theme="dark"] .hover\\:text-${family}-${shade}:hover`] = { color: foreground };
      }
    }
    addBase({ '@media screen': rules });
  })],
}
