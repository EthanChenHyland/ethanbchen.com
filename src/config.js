import * as THREE from 'three';

export const STATION_RADIUS = 6.0;
export const PEDESTAL_TOP = 0.95;
export const PLATFORM_RADIUS = 12.0;

const deg = THREE.MathUtils.degToRad;

// The four destinations keep the original station slots: Resume takes Fire's (front left),
// Projects Air's (front right, the Threshold Console), Experience Water's (back right, still the
// Water element as a placeholder) and Profile Earth's (back left). Array order is the dock and
// arrow-key order, and it runs contiguously around the ring.
//
// Slot properties (azimuth, view, envGlow, color, glyph) belong to the physical station in the
// slot; identity properties (name, panel copy, url) to the destination.
// `glyph` names the station's symbol: Resume has its own; the others still borrow an
// element's triangle until their glyphs exist.
// `url` is where "Open" leads (internal path or external address); leave it
// empty to hide the link. `envGlow` places a coloured light on the horizon of
// the reflection environment, behind the station.
export const ELEMENTS = [
  {
    id: 'resume',
    key: '1',
    name: 'Resume',
    glyph: 'resume',
    color: '#e8c48a',
    azimuth: deg(-45),
    eyebrow: 'Background',
    subtitle: 'Vanderbilt · Computer Science + HOD',
    motto: 'The short version',
    text: 'Education, experience and skills on a single page. The professional summary, folded down to what matters.',
    facts: [
      ['University', 'Vanderbilt'],
      ['Expected', 'May 2030'],
    ],
    url: '/resume/',
    envGlow: { intensity: 3.0, size: 5, y: 4 },
    view: { distance: 12.8, height: 5.0, swing: deg(18), targetY: 3.75 },
  },
  {
    id: 'profile',
    key: '2',
    name: 'Profile',
    glyph: 'earth',
    color: '#c39ef0',
    azimuth: deg(-135),
    eyebrow: 'About',
    subtitle: 'Software engineer · creative technologist',
    motto: 'The person behind the work',
    text: 'Who I am outside the résumé: what I am curious about, what I am working on now, and what I play away from a keyboard.',
    facts: [
      ['Plays', 'Piano · Clarinet'],
      ['Also', 'Chess'],
    ],
    url: '/profile/',
    envGlow: { intensity: 1.2, size: 5, y: 6 },
    view: { distance: 9.8, height: 4.4, swing: deg(-18), targetY: 3.35 },
  },
  {
    id: 'experience',
    key: '3',
    name: 'Experience',
    glyph: 'water',
    color: '#5fc9b0',
    azimuth: deg(135),
    eyebrow: 'Professional journey',
    subtitle: 'Roles · internships · impact',
    motto: 'Where I have worked',
    text: 'Internships in healthcare AI, community technology and enterprise software, and the initiative I founded.',
    facts: [
      ['Founded', 'Wifi Concierge'],
      ['Interned', 'Cleveland Clinic'],
    ],
    url: '/experience/',
    envGlow: { intensity: 2.2, size: 6, y: 5 },
    view: { distance: 9.0, height: 4.0, swing: deg(18), targetY: 2.95 },
  },
  {
    id: 'projects',
    key: '4',
    name: 'Projects',
    glyph: 'air',
    color: '#e3684d',
    azimuth: deg(45),
    eyebrow: 'Selected works',
    subtitle: 'Products · systems · experiments',
    motto: 'Things I have built',
    text: 'Major projects and a workshop of experiments: tools people use, and systems built to understand how something works.',
    facts: [
      ['Featured', 'Great Prompt-Off'],
      ['Also', 'Mosaic · TowerLogic'],
    ],
    url: '/projects/',
    envGlow: null,
    view: { distance: 10.4, height: 4.3, swing: deg(-16), targetY: 3.3 },
  },
];

export function stationPosition(def, target = new THREE.Vector3()) {
  return target.set(Math.sin(def.azimuth) * STATION_RADIUS, 0, Math.cos(def.azimuth) * STATION_RADIUS);
}
