// Entry point. With ?game=CODE this is a phone; otherwise it is the host (TV) screen.
import { getGameParam, keepAwake } from './net.js';
import { unlockAudio } from './sfx.js';
import { HostApp } from './host.jsx';
import { PhoneGame } from './phone.jsx';

const code = getGameParam();

// Browsers allow sound and screen wake locks only after a tap or a key press.
const onGesture = () => {
  if (!code) unlockAudio();
  keepAwake();
};
document.addEventListener('pointerdown', onGesture, { passive: true });
document.addEventListener('keydown', onGesture);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

ReactDOM.createRoot(document.getElementById('root')).render(code ? <PhoneGame code={code} /> : <HostApp />);
