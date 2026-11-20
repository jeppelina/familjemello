#!/bin/bash
# Familje-Mello: dubbelklicka den här filen för att spela lokalt.
# (Den serverar den byggda index.html. Ändrar du i src/, kör först: npm run build)
cd "$(dirname "$0")"
echo ""
echo "  ✨ Familje-Mello startar på http://localhost:8000 ✨"
echo "  Stäng det här fönstret när ni är klara."
echo ""
open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null
python3 -m http.server 8000
