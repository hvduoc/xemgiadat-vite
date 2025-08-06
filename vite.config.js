// vite.config.js

// Gộp cả hai cấu hình vào MỘT khối export default duy nhất
export default {
  base: './', // Cấu hình cho Netlify
  
  server: {
    port: 3000 // Cấu hình cho server local
  }
};