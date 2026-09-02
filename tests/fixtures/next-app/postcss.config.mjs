const fixtureBase = process.cwd();

export default {
  plugins: {
    "tailwind-variant-groups/postcss": {
      base: fixtureBase,
      include: ["app/**/*.{js,jsx,ts,tsx}"],
    },
    "@tailwindcss/postcss": {},
  },
};
