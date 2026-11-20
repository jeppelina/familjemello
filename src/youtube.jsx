// YouTube IFrame Player API wrapper: lets us autoplay, time highlight clips by
// real playback (ads and buffering no longer eat the clip), and catch videos
// that refuse to play outside YouTube.
const { useEffect, useRef, useState } = React;

let apiPromise = null;
export function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error('YouTube API failed to load')); };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export const YT_PLAYING = 1;
export const YT_ENDED = 0;

const ERRORS = {
  2: 'Länken till videon verkar vara fel.',
  5: 'Videon kunde inte spelas i den här webbläsaren.',
  100: 'Videon finns inte längre (borttagen eller privat).',
  101: 'Den här videon får bara spelas på YouTube.',
  150: 'Den här videon får bara spelas på YouTube.',
  api: 'Kunde inte ladda YouTube. Kontrollera nätet.',
};

// start/end in seconds (optional). autoplay is read once per video, so a vote
// landing mid-song never restarts the video.
export function YouTubePlayer({ videoId, start, end, autoplay, onTick, onEnded, onError }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const cb = useRef({});
  cb.current = { onTick, onEnded, onError };
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const [error, setError] = useState(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    let alive = true;
    let poll = null;
    let tapTimer = null;
    const auto = !!autoplayRef.current;
    setError(null);
    setNeedsTap(false);
    loadYouTubeApi().then((YT) => {
      if (!alive || !hostRef.current) return;
      const el = document.createElement('div');
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(el);
      const vars = { rel: 0, modestbranding: 1, playsinline: 1, autoplay: auto ? 1 : 0, origin: window.location.origin };
      if (start > 0) vars.start = Math.floor(start);
      if (end > 0) vars.end = Math.floor(end);
      playerRef.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: vars,
        events: {
          onReady: (e) => {
            if (!auto) return;
            try { e.target.playVideo(); } catch (x) { /* ignore */ }
            tapTimer = setTimeout(() => {
              try {
                const st = e.target.getPlayerState();
                if (alive && st !== 1 && st !== 3) setNeedsTap(true);
              } catch (x) { /* ignore */ }
            }, 4000);
          },
          onStateChange: (e) => {
            if (e.data === YT_PLAYING) setNeedsTap(false);
            if (e.data === YT_ENDED && cb.current.onEnded) cb.current.onEnded();
          },
          onError: (e) => {
            if (!alive) return;
            setError(e.data);
            if (cb.current.onError) cb.current.onError(e.data);
          },
        },
      });
      poll = setInterval(() => {
        const p = playerRef.current;
        if (!p || !p.getCurrentTime || !cb.current.onTick) return;
        try { cb.current.onTick(p.getCurrentTime(), p.getPlayerState()); } catch (x) { /* player not ready */ }
      }, 250);
    }).catch(() => {
      if (!alive) return;
      setError('api');
      if (cb.current.onError) cb.current.onError('api');
    });
    return () => {
      alive = false;
      clearInterval(poll);
      clearTimeout(tapTimer);
      try { if (playerRef.current) playerRef.current.destroy(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [videoId, start, end]);

  return (
    <div className="video-wrap">
      <div ref={hostRef} className="yt-host" />
      {error != null && (
        <div className="video-error">
          <div style={{ fontSize: '2rem' }}>📼</div>
          <div>{ERRORS[error] || 'Videon kunde inte spelas.'}</div>
          <a className="btn btn-ghost btn-sm" href={'https://www.youtube.com/watch?v=' + videoId} target="_blank" rel="noopener noreferrer">Öppna på YouTube</a>
        </div>
      )}
      {needsTap && error == null && <div className="video-hint">Tryck ▶ på videon för att starta</div>}
    </div>
  );
}
