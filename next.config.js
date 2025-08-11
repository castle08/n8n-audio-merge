/** @type {import("next").NextConfig} */
const nextConfig = {
    experimental: { serverComponentsExternalPackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  };
  module.exports = nextConfig;