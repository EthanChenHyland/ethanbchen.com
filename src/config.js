import * as THREE from 'three';

export const STATION_RADIUS = 6.0;
export const PEDESTAL_TOP = 0.95;
export const PLATFORM_RADIUS = 12.0;

const deg = THREE.MathUtils.degToRad;

// The four destinations keep the original station slots (Resume takes Fire's,
// Experience Air's, Projects Water's, Profile Earth's). Array order is the dock
// and arrow-key order, and it runs contiguously around the ring.
//
// `glyph` names the placeholder symbol until the destination glyphs exist.
// `url` is where "Open" leads (internal path or external address); leave it
// empty to hide the link. `envGlow` places a coloured light on the horizon of
// the reflection environment, behind the station.
export const ELEMENTS = [
  {
    id: 'resume',
    key: '1',
    name: 'Resume',
    glyph: 'fire',
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
    view: { distance: 10.8, height: 4.3, swing: deg(18), targetY: 3.2 },
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
    id: 'projects',
    key: '3',
    name: 'Projects',
    glyph: 'water',
    color: '#5fc9b0',
    azimuth: deg(135),
    eyebrow: 'Selected works',
    subtitle: 'Products · systems · interactive software',
    motto: 'Things I have built',
    text: 'A small set of products and experiments, from tools people use to systems built to understand how something works.',
    facts: [
      ['Focus', 'Interactive systems'],
      ['Featured', 'Carat Coin'],
    ],
    url: '/projects/',
    envGlow: { intensity: 2.2, size: 6, y: 5 },
    view: { distance: 9.0, height: 4.0, swing: deg(18), targetY: 2.95 },
  },
  {
    id: 'experience',
    key: '4',
    name: 'Experience',
    glyph: 'air',
    color: '#e3684d',
    azimuth: deg(45),
    eyebrow: 'Professional journey',
    subtitle: 'Roles · internships · impact',
    motto: 'Where I have worked',
    text: 'Internships in healthcare AI, community technology and enterprise software, and the initiative I founded.',
    facts: [
      ['Founded', 'Wifi Concierge'],
      ['Interned', 'Cleveland Clinic'],
    ],
    url: '/experience/',
    envGlow: null,
    view: { distance: 10.4, height: 4.3, swing: deg(-16), targetY: 3.3 },
  },
];

export function stationPosition(def, target = new THREE.Vector3()) {
  return target.set(Math.sin(def.azimuth) * STATION_RADIUS, 0, Math.cos(def.azimuth) * STATION_RADIUS);
}
