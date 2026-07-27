import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // There is an unrelated package-lock.json in the user's home directory, so
    // Turbopack's lockfile walk would otherwise pick C:\Users\<name> as the
    // workspace root and watch/resolve from there. Pin it to this project.
    root: __dirname,
  },
};

export default nextConfig;
