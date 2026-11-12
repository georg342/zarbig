# segurança

- nunca `innerHTML` com dados externos (spotify, youtube, nome de arquivo do bucket, tags ID3). use `textContent` ou `window.escapeHtml` (main.js).
- `showCustomModal`: assuma que `message` já é escapado pelo próprio helper — mande texto cru.
- todo `await` de supabase: `try/catch` + fallback visual (toast). mínimo: `loadSets`, `upload`, `remove`.
- `navigator.clipboard` sempre via `window.copyText` (fallback execCommand). nunca direto.
- nomes de download (`a.download`) passam por `window.sanitizeFileName`.
- nunca commitar `.env`, `repomix-output.xml`, artefatos com credenciais.
- chaves em `localStorage` só se forem client-safe (yt key, supabase anon). NUNCA commitar novas.
