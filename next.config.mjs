/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Existing lint setup is separate; production still checks TypeScript.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return { beforeFiles: [{
      source: '/api/gym/:path*',
      destination: 'https://32-192-89-83.sslip.io/api/gym/:path*',
    }] };
  },

  /**
   * If you have `experimental: { appDir: true }` set, then you must comment the below `i18n` config
   * out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
};

export default config;
