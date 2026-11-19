let audio;
let enabled = localStorage.getItem("tatakuf-sound") !== "off";

export function soundEnabled() {
  return enabled;
}

export function unlockSound() {
  if (!enabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    audio ??= new AudioContext();
    if (audio.state !== "running") void audio.resume().catch(() => {});
  } catch {
    // Audio remains optional when the browser blocks it.
  }
}

export function toggleSound() {
  enabled = !enabled;
  localStorage.setItem("tatakuf-sound", enabled ? "on" : "off");
  if (enabled) unlockSound();
  if (!enabled && audio?.state === "running") void audio.suspend().catch(() => {});
}

const cues = {
  tap: [[392, 0, .07, .026]],
  join: [[349.2, 0, .16], [523.25, .09, .22]],
  select: [[329.63, 0, .19], [440, .07, .19], [523.25, .14, .27]],
  question: [[261.63, 0, .26], [392, .07, .22], [587.33, .14, .35]],
  locked: [[440, 0, .1], [659.25, .05, .15]],
  tick: [[523.25, 0, .14, .052]],
  correct: [[523.25, 0, .22], [659.25, .07, .24], [783.99, .14, .37]],
  incorrect: [[329.63, 0, .23], [261.63, .09, .30]],
  finale: [[98, 0, .48], [110, .54, .48], [123.47, 1.08, .48], [146.83, 1.65, .48],
    [164.81, 2.25, .48], [196, 2.9, .55], [246.94, 3.55, .59], [293.66, 4.24, .72]],
  finished: [[392, 0, .30], [523.25, .09, .34], [659.25, .19, .36], [783.99, .33, .70]]
};

export function playSound(cue) {
  if (!enabled || audio?.state !== "running") return;
  const start = audio.currentTime + .013;
  for (const [pitch, delay, duration, volume = .057] of cues[cue] ?? []) {
    const at = start + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = cue === "finished" ? "triangle" : "sine";
    oscillator.frequency.value = pitch;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .024);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
  }
}
