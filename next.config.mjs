/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf.js loads its worker file at run time — left to node_modules rather
  // than bundled (lib/drawingRequest.js).
  serverExternalPackages: ['pdfjs-dist'],
};
export default nextConfig;
