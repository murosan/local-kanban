import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "../pkg/ui/dist",
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		host: true,
		proxy: {
			"/api": {
				target: process.env.VITE_API_TARGET || "http://backend:3737",
				changeOrigin: true,
			},
		},
	},
});
