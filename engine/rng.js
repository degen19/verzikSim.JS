// Seeded RNG with the subset of Python's random.Random API the engine uses.
// (Sequences differ from CPython's Mersenne Twister - results match Python statistically, not raid-for-raid.)

export class Rng {
  constructor(seed) {
    if (seed === undefined || seed === null) seed = (Math.random() * 2 ** 32) >>> 0;
    // xmur3-style hash of the seed into a 128-bit state for sfc32
    let h = 1779033703 ^ String(seed).length;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 15; i++) this.random();
  }

  /** float in [0, 1) */
  random() {
    // sfc32
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = c + t | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }

  /** integer in [a, b] inclusive (like Python's randint) */
  randint(a, b) {
    if (b < a) throw new Error(`empty range in randint(${a}, ${b})`);
    return a + Math.floor(this.random() * (b - a + 1));
  }

  choice(arr) {
    if (!arr.length) throw new Error('Cannot choose from an empty sequence');
    return arr[Math.floor(this.random() * arr.length)];
  }

  /** in-place Fisher-Yates shuffle */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
