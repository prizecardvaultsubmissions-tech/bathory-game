// Original weapons. Ranges/reach in logic pixels (one tile = 44).
export const WEAPONS = {
  dagger: {
    id: "dagger", name: "Silver Dagger", kind: "melee",
    blurb: "Quick silver strikes. Stay close and keep cutting.",
    dmg: 14, reach: 52, arc: 1.9, cooldown: 0.3, knock: 40, stagger: 0.25,
    bars: { power: 2, speed: 5, reach: 1, control: 2 }, special: "Fastest attacks"
  },
  mace: {
    id: "mace", name: "Blessed Iron Mace", kind: "melee",
    blurb: "Slow, crushing blows that hurl the dead backward.",
    dmg: 34, reach: 60, arc: 2.5, cooldown: 0.95, knock: 175, stagger: 0.75,
    bars: { power: 5, speed: 1, reach: 2, control: 5 }, special: "Huge knockback"
  },
  crossbow: {
    id: "crossbow", name: "Silver Crossbow", kind: "ranged",
    blurb: "Silver bolts from a distance. Ammo is scarce; find bolt bundles.",
    dmg: 24, cooldown: 0.75, boltSpeed: 560, range: 480, knock: 60, stagger: 0.35,
    ammo: 14, maxAmmo: 24, pickup: 6, bashDmg: 6, bashReach: 40,
    bars: { power: 3, speed: 3, reach: 5, control: 2 }, special: "Ranged · limited bolts"
  },
  staff: {
    id: "staff", name: "Torch Staff", kind: "melee",
    blurb: "A long pitch-soaked staff. Every hit sets them burning.",
    dmg: 15, reach: 72, arc: 2.2, cooldown: 0.55, knock: 70, stagger: 0.3, burn: 4,
    bars: { power: 3, speed: 3, reach: 4, control: 3 }, special: "Burns for 4s"
  }
};
export const WEAPON_ORDER = ["dagger", "mace", "crossbow", "staff"];
