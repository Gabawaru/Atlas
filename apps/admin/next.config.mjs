/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Musk delete / OWASP A06 : Image Optimization inutilisée — surface réduite.
  // Admin = localhost / réseau de confiance uniquement tant que Next 14.x
  // n'est pas upgradé vers une ligne patchée (voir docs + atlas-musk-actions-done).
  images: { unoptimized: true },
};

export default nextConfig;
