'use strict';

// Deterministic appliance-signature engine.
//
// We track recent power readings per device and look for sudden steady-state
// changes (a "step"). When a step is detected, the magnitude is compared
// against a small library of profiles and the closest match wins. The
// difference is then attributed to that appliance for the duration the step
// remains stable.
//
// This is intentionally simple - the proposal commits to deterministic
// thresholds rather than ML.

const PROFILES = [
  { name: 'lights',  watts: 60,   tol: 50  },
  { name: 'tv',      watts: 120,  tol: 60  },
  { name: 'fridge',  watts: 200,  tol: 80  },
  { name: 'iron',    watts: 1100, tol: 250 },
  { name: 'kettle',  watts: 1800, tol: 300 },
  { name: 'ac',      watts: 1400, tol: 300 },
];

// Private per-device state.
const state = new Map();

function getState(deviceId) {
  let s = state.get(deviceId);
  if (!s) {
    s = {
      lastPower: 0,
      baseline: 0,
      activeAppliances: [],   // running steady loads
    };
    state.set(deviceId, s);
  }
  return s;
}

function classifyStep(deltaW) {
  let best = null;
  let bestDist = Infinity;
  const abs = Math.abs(deltaW);
  for (const p of PROFILES) {
    const d = Math.abs(abs - p.watts);
    if (d < bestDist && d <= p.tol) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

// Returns { appliance, energy_wh } if energy should be attributed to a known
// appliance for this 1 s sample, or null otherwise.
function attribute(deviceId, sample) {
  const s = getState(deviceId);
  const power = sample.p_w;
  const delta = power - s.lastPower;
  s.lastPower = power;

  // step large enough to be worth classifying?
  if (Math.abs(delta) >= 40) {
    const match = classifyStep(delta);
    if (match) {
      if (delta > 0) {
        s.activeAppliances.push({ name: match.name, watts: match.watts });
      } else {
        const idx = s.activeAppliances.findIndex(
          a => a.name === match.name
        );
        if (idx >= 0) s.activeAppliances.splice(idx, 1);
      }
    }
  }

  if (s.activeAppliances.length === 0) {
    return { appliance: 'baseline', energy_wh: sample.energy_inc_wh };
  }

  // attribute to the appliance with the largest expected contribution.
  s.activeAppliances.sort((a, b) => b.watts - a.watts);
  return {
    appliance: s.activeAppliances[0].name,
    energy_wh: sample.energy_inc_wh,
  };
}

// Pure helpers exported for tests.
module.exports = {
  PROFILES,
  classifyStep,
  attribute,
  _resetForTests: () => state.clear(),
};
