import vtheme from '@booga/vtheme/preset';

/** @type {import('tailwindcss').Config} */
export default {
  // vTheme's preset is the whole color/spacing/type contract + light/dark vars.
  presets: [vtheme],
  content: [
    './index.html',
    './main.jsx',
    './node_modules/@booga/vchat/dist/**/*.{js,cjs}',
    './node_modules/@booga/vui/dist/**/*.{js,cjs}',
  ],
};
