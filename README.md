# Familje-Mello 🎤✨

**Your family's own music tournament — inspired by Melodifestivalen.**

Familje-Mello turns any evening into a music competition. Add songs, watch YouTube videos together, vote with stars, and crown a winner — complete with recaps, group stages, a grand final, and confetti.

**[Play now → jesperlindmarker.com/familjemello](https://jesperlindmarker.com/familjemello/)**

![Familje-Mello](https://img.shields.io/badge/status-MVP-blueviolet) ![License](https://img.shields.io/badge/license-MIT-green)

---

## How it works

**Setup** — Add songs by pasting YouTube links (or load the 16 built-in demo songs spanning 1969–2017). Add family members as voters.

**Group stages** — Songs are shuffled into 4 groups. Watch one song at a time, then everyone rates it 1–5 stars before moving to the next. Navigate freely between songs to re-watch or change votes.

**Recaps** — After each group, a recap plays through the songs with highlight clips before revealing the results. Top 2 from each group advance to the final.

**Grand final** — All qualifiers get a full recap with their best moments, then compete one last time. The winner is crowned with a confetti explosion.

## Features

- **YouTube embeds** — paste any YouTube link, the app extracts the video
- **1–5 star voting** — everyone votes on the same screen, one song at a time
- **Highlight timestamps** — set the "best moment" for each song (used in recaps)
- **Group recaps + final recap** — auto-playing highlight clips with progress bar
- **16 demo songs** — instant playlist from Beatles to Despacito, ready to go
- **Mello-inspired design** — purple/pink/gold palette, animations, confetti
- **Zero setup** — single HTML file, no install, runs in any browser
- **Works on any device** — laptop, tablet, phone, or cast to TV

## Quick start

### Online (easiest)
Open **[jesperlindmarker.com/familjemello](https://jesperlindmarker.com/familjemello/)** in any browser.

### Local
```bash
git clone https://github.com/jeppelina/familjemello.git
cd familjemello
# macOS — double-click start.command, or:
cd src && python3 -m http.server 8000
# Then open http://localhost:8000
```

> YouTube embeds require `http://` — they won't work if you open the HTML file directly (`file://`).

## Project structure

```
familjemello/
├── index.html          ← GitHub Pages entry (copy of src/index.html)
├── src/
│   └── index.html      ← The app (single file, ~850 lines)
├── docs/
│   ├── CONCEPT.md      ← 4 concept versions explored
│   ├── ARCHITECTURE.md ← Technical design & data model
│   ├── TOURNAMENT-RULES.md ← Format, voting systems, scheduling
│   └── INSPIRATION.md  ← Ideas bank & future themes
├── start.command        ← Double-click launcher for macOS
└── LICENSE
```

## Tech

Single HTML file. No build step, no dependencies to install.

- **React 18** via CDN (with Babel for JSX)
- **YouTube IFrame API** for video embedding
- **canvas-confetti** for celebrations
- **Google Fonts (Outfit)** for typography
- All state managed with `useReducer` — no external state library

## Roadmap

- [ ] Andra Chansen (second chance round with head-to-head duels)
- [ ] Export/import tournaments as JSON
- [ ] Printable voting cards (PDF)
- [ ] Sound effects (fanfare, drumroll)
- [ ] Multi-device voting via QR code
- [ ] Tournament history / Hall of Fame
- [ ] Spotify playlist integration

## License

MIT — see [LICENSE](LICENSE).

---

*Built by the Lindmarker family. Inspired by Melodifestivalen.*
