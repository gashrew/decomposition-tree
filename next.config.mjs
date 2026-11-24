/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app runs entirely in the browser, so build it as plain static files
  output: "export",
  images: {
    unoptimized: true,
  },
}

export default nextConfig
