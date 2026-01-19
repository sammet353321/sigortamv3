import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Environment Variable Check
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  document.body.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; text-align:center; padding:20px;">
      <h1 style="color:#e11d48;">Kurulum Hatası</h1>
      <p style="font-size:18px; max-width:600px;">
        Uygulamanın çalışması için gerekli olan <strong>Supabase</strong> bağlantı bilgileri bulunamadı.
      </p>
      <div style="background:#f1f5f9; padding:20px; border-radius:8px; margin-top:20px; text-align:left;">
        <p style="margin:0 0 10px 0;"><strong>Vercel Ayarlarında Eksik Olan Değişkenler:</strong></p>
        <code style="display:block; margin-bottom:5px; color:#0f172a;">VITE_SUPABASE_URL</code>
        <code style="display:block; color:#0f172a;">VITE_SUPABASE_ANON_KEY</code>
      </div>
      <p style="margin-top:20px; color:#64748b;">
        Lütfen Vercel panelinde <strong>Settings > Environment Variables</strong> kısmına giderek bu değerleri ekleyin ve tekrar <strong>Redeploy</strong> yapın.
      </p>
    </div>
  `;
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
