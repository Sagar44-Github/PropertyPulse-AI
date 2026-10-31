import { useState } from 'react'
import { ArrowUpRight, Box, ScanLine } from 'lucide-react'

type Zone = {
  id: string
  name: string
  detail: string
  x: number
  y: number
}

const zones: Zone[] = [
  { id: 'living', name: 'Living room', detail: 'Wall and finish check', x: 34, y: 63 },
  { id: 'kitchen', name: 'Kitchen', detail: 'Wall and window check', x: 66, y: 43 },
  { id: 'ceiling', name: 'Bathroom ceiling', detail: 'Moisture context check', x: 51, y: 25 },
]

export default function RoomScene({ onStartInspection }: { onStartInspection: (area: string) => void }) {
  const [activeZone, setActiveZone] = useState(zones[0])

  return <div className="room-scene" aria-label="Interactive illustrative 3D room map">
    <div className="room-scene-topline">
      <span className="room-scene-chip"><Box size={13} /> ROOM VIEW</span>
      <span className="room-scene-disclosure">Illustrative 3D · not a property scan</span>
    </div>
    <div className="room-model">
      <svg viewBox="0 0 720 430" role="img" aria-label="Isometric living space with furniture and three inspection zones">
        <defs>
          <linearGradient id="roomLeftWall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f4efdd" /><stop offset="1" stopColor="#d5dcc5" /></linearGradient>
          <linearGradient id="roomRightWall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9e3d2" /><stop offset="1" stopColor="#b8c9b1" /></linearGradient>
          <linearGradient id="roomFloor" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9c8a8" /><stop offset="1" stopColor="#b99e78" /></linearGradient>
          <linearGradient id="roomSofa" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6b927d" /><stop offset="1" stopColor="#355c4c" /></linearGradient>
          <linearGradient id="roomSofaSide" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#496f5c" /><stop offset="1" stopColor="#294b3e" /></linearGradient>
          <filter id="roomShadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="8" /></filter>
          <pattern id="roomFloorGrain" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="skewY(-27)"><path d="M0 0H32" stroke="#8d785c" strokeOpacity=".13" strokeWidth="1" /></pattern>
        </defs>
        <ellipse cx="367" cy="370" rx="274" ry="31" fill="#112a20" opacity=".17" filter="url(#roomShadow)" />

        <polygon points="80,231 360,88 360,17 80,160" fill="url(#roomLeftWall)" />
        <polygon points="360,88 646,231 646,160 360,17" fill="url(#roomRightWall)" />
        <polygon points="80,231 360,88 646,231 360,385" fill="url(#roomFloor)" />
        <polygon points="80,231 360,88 646,231 360,385" fill="url(#roomFloorGrain)" opacity=".7" />

        <path d="M80 223 360 80 646 223" fill="none" stroke="#fffdf3" strokeOpacity=".72" strokeWidth="5" />
        <path d="M80 231 360 88 646 231" fill="none" stroke="#9aab91" strokeOpacity=".8" strokeWidth="3" />
        <path d="M360 88V382" stroke="#a28664" strokeOpacity=".55" strokeWidth="2" />
        <path d="m80 231 280 154 286-154" fill="none" stroke="#8e7657" strokeOpacity=".5" strokeWidth="2" />

        <polygon points="115,202 226,145 226,204 115,260" fill="#789588" stroke="#fff9e9" strokeWidth="7" />
        <polygon points="123,202 218,153 218,197 123,246" fill="#b9d4c2" />
        <path d="m171 178 0 45M123 224l95-49" stroke="#f6f2e4" strokeWidth="4" />
        <polygon points="245,130 277,114 277,171 245,187" fill="#c6af81" opacity=".92" />
        <polygon points="252,136 270,127 270,160 252,169" fill="#9baf93" />

        <polygon points="407,111 474,145 474,184 407,150" fill="#f5f0df" stroke="#8d9e87" strokeWidth="4" />
        <polygon points="415,116 466,142 466,174 415,148" fill="#9cb2a1" />
        <path d="m440 128 0 38M415 148l51 26" stroke="#f3efdf" strokeWidth="3" />
        <polygon points="514,164 566,190 566,257 514,231" fill="#8a6e54" />
        <polygon points="521,169 558,188 558,244 521,225" fill="#b79468" />
        <circle cx="548" cy="207" r="3" fill="#f1d79c" />

        <polygon points="168,277 352,183 537,277 350,377" fill="#a7b58d" opacity=".68" />
        <polygon points="193,278 351,198 510,279 350,363" fill="#e3d9bf" />
        <path d="m350 198v165M193 278l157 85 160-84" fill="none" stroke="#fff8e9" strokeOpacity=".8" strokeWidth="2" />

        <ellipse cx="259" cy="307" rx="117" ry="28" fill="#253d30" opacity=".2" />
        <polygon points="155,230 240,187 319,228 234,272" fill="url(#roomSofa)" />
        <polygon points="155,230 234,272 234,314 155,272" fill="url(#roomSofaSide)" />
        <polygon points="234,272 319,228 319,271 234,314" fill="#315642" />
        <polygon points="168,259 240,222 304,255 232,293" fill="#7da08a" />
        <polygon points="168,259 232,293 232,314 168,280" fill="#557d67" />
        <polygon points="232,293 304,255 304,277 232,314" fill="#3d674f" />
        <polygon points="178,223 220,202 246,216 203,238" fill="#dfb68d" />
        <polygon points="178,223 203,238 203,265 178,250" fill="#c69772" />
        <polygon points="253,216 282,231 282,258 253,244" fill="#d9d6b4" />
        <path d="m175 276v18m128-65v20" stroke="#735d45" strokeWidth="6" strokeLinecap="round" />

        <ellipse cx="424" cy="305" rx="75" ry="21" fill="#304637" opacity=".16" />
        <polygon points="365,278 418,251 478,282 425,311" fill="#e8d8b9" />
        <polygon points="365,278 425,311 425,322 365,290" fill="#b99d79" />
        <polygon points="425,311 478,282 478,294 425,322" fill="#967b5e" />
        <path d="m379 289v31m83-42v31" stroke="#806b50" strokeWidth="4" />
        <polygon points="398,273 420,262 442,273 420,285" fill="#f4eddb" />

        <ellipse cx="562" cy="287" rx="37" ry="11" fill="#394f3c" opacity=".18" />
        <path d="M557 276v-50m0 22-18-23m19 29 21-27m-21 15-3-34m3 41 18-9m-18-12-17-12" fill="none" stroke="#55765a" strokeWidth="7" strokeLinecap="round" />
        <path d="M557 278c-19-4-26-1-29 8h57c-4-9-11-12-28-8" fill="#bf9872" />
        <path d="m556 273-5-29m8 20 15-22m-21 12-14-16m20 38 17-8" stroke="#91aa79" strokeWidth="8" strokeLinecap="round" />

        <circle cx="350" cy="106" r="4" fill="#fff9e9" opacity=".9" />
        <path d="m351 109 0 45" stroke="#fff9e9" strokeOpacity=".32" strokeDasharray="3 5" />
      </svg>

      <div className="room-hotspots" role="group" aria-label="Choose an inspection area">
        {zones.map((zone, index) => <button key={zone.id} type="button" className={`room-hotspot ${activeZone.id === zone.id ? 'active' : ''}`} style={{ left: `${zone.x}%`, top: `${zone.y}%` }} onClick={() => setActiveZone(zone)} aria-label={`Select ${zone.name}`} aria-pressed={activeZone.id === zone.id}>
          <span className="room-hotspot-number">0{index + 1}</span><i />
        </button>)}
      </div>
    </div>
    <div className="room-zone-card">
      <div className="room-zone-icon"><ScanLine size={17} /></div>
      <div className="room-zone-copy"><span>SELECTED AREA</span><b>{activeZone.name}</b><small>{activeZone.detail}</small></div>
      <button type="button" onClick={() => onStartInspection(activeZone.name)} aria-label={`Start an inspection in ${activeZone.name}`}><ArrowUpRight size={17} /></button>
    </div>
  </div>
}
