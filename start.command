#!/bin/bash
# Familje-Mello — dubbelklicka denna fil för att starta!
cd "$(dirname "$0")/src"
echo ""
echo "  ✨ Familje-Mello startar på http://localhost:8000 ✨"
echo "  Stäng detta fönster när ni är klara."
echo ""
open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null
python3 -m http.server 8000
