/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Musk delete / OWASP A06 : Image Optimization inutilisée — surface réduite.
  images: { unoptimized: true },
};

export default nextConfig;
