# Prezentacja PewnySzlak (HackYeah)

**PDF do zgłoszenia:** [`PewnySzlak-HackYeah.pdf`](PewnySzlak-HackYeah.pdf)

Minimalistyczny deck (8 slajdów, A4 landscape):

1. Title  
2. Problem  
3. Solution — silnik komfortu  
4. Satelita + LiDAR  
5. Jak działa  
6. Prototyp  
7. Zaufanie  
8. Zamknięcie  

Bez screenów ze starej apki.

```bash
cd docs/presentation && python3 -m http.server 8770
google-chrome-stable --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/PewnySzlak-HackYeah.pdf" \
  "http://127.0.0.1:8770/?print=1"
```
