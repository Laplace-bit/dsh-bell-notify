// 从 src/core/sounds.ts 的配方离线渲染 16-bit PCM WAV，用于试听。
// 渲染规则与 src/platform/audio.ts 的 WebAudio 实现一致：
// 5ms attack、线性衰减包络、linear 频率扫频、20ms 尾部静音。
import { writeFileSync, mkdirSync } from 'node:fs'
import { SOUND_RECIPES, recipeDuration } from '../src/core/sounds.ts'

const SAMPLE_RATE = 44100
const ATTACK = 0.005
const TAIL = 0.02

function oscillator(wave, phase) {
  switch (wave) {
    case 'sine': return Math.sin(phase)
    case 'square': return Math.sin(phase) >= 0 ? 1 : -1
    case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(phase))
    case 'sawtooth': return (2 / Math.PI) * Math.atan(Math.tan(phase / 2))
    default: return 0
  }
}

function render(recipe) {
  const total = recipeDuration(recipe) + TAIL
  const samples = new Float64Array(Math.ceil(total * SAMPLE_RATE))
  for (const note of recipe.notes) {
    const attack = Math.min(ATTACK, note.duration / 2)
    const startIdx = Math.floor(note.start * SAMPLE_RATE)
    const len = Math.floor(note.duration * SAMPLE_RATE)
    const fromFreq = note.from
    const toFreq = note.to ?? note.from
    let phase = 0
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE
      const freq = fromFreq + ((toFreq - fromFreq) * t) / note.duration
      phase += (2 * Math.PI * freq) / SAMPLE_RATE
      const envelope =
        t < attack ? (t / attack) * note.gain : (note.gain * (note.duration - t)) / (note.duration - attack)
      samples[startIdx + i] += oscillator(note.wave, phase) * envelope
    }
  }
  return samples
}

function toWav(samples) {
  const dataLen = samples.length * 2
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)  // PCM
  buf.writeUInt16LE(1, 22)  // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

mkdirSync('audio-preview', { recursive: true })
for (const recipe of Object.values(SOUND_RECIPES)) {
  const wav = toWav(render(recipe))
  writeFileSync(`audio-preview/${recipe.id}.wav`, wav)
  console.log(`${recipe.id}.wav  ${(wav.length / 1024).toFixed(1)} KB`)
}
