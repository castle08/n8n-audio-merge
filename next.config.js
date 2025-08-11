/** @type {import("next").NextConfig} */
const nextConfig = {
    experimental: { serverComponentsExternalPackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  };
  
export default nextConfig;