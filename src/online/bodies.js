import { mulberry32 } from '../lib/rng.js';

// A body is fully described by one integer seed, so it costs a few bytes to sync.
// Everyone renders the same look from the same seed.

export const COLORS = ['#FF7A59', '#FFC83D', '#4FC48A', '#6C8CFF', '#FF8FB1', '#9B7BEA', '#2EC4B6', '#F4A259', '#8DB255', '#E56B6F'];
const SKINS = ['#FFD9B3', '#F1C27D', '#C68642', '#8D5524', '#FFE0BD'];
const SHOES = ['#3B2418', '#FFFFFF', '#FF5D73', '#4A6CF7', '#FFC83D'];
export const SHAPES = ['round', 'tall', 'chubby', 'bean', 'square', 'pear'];
const PATTERNS = ['none', 'none', 'stripes', 'dots', 'belly', 'zigzag'];
const HATS = ['none', 'beanie', 'chef', 'crown', 'bunny', 'sprout', 'party', 'cap'];
const ACCESSORIES = ['none', 'none', 'scarf', 'bowtie', 'cape', 'apron'];
const POSES = ['down', 'wave', 'cheer', 'hips'];
const FACES = ['😊', '😎', '🥳', '😋', '🤠', '😺', '🙂', '😄'];

const pick = (r, list) => list[Math.floor(r() * list.length)];

export function bodyFromSeed(seed) {
  const r = mulberry32(seed || 1);
  const color = pick(r, COLORS);
  let color2 = pick(r, COLORS);
  if (color2 === color) color2 = COLORS[(COLORS.indexOf(color) + 3) % COLORS.length];
  return {
    seed,
    color,
    color2,
    shape: pick(r, SHAPES),
    skin: pick(r, SKINS),
    shoes: pick(r, SHOES),
    pattern: pick(r, PATTERNS),
    hat: pick(r, HATS),
    acc: pick(r, ACCESSORIES),
    pose: pick(r, POSES),
    face: pick(r, FACES),
  };
}

export const randomSeed = () => 1 + Math.floor(Math.random() * 2147483000);

export const candidateSeeds = (n = 8) => Array.from({ length: n }, randomSeed);
