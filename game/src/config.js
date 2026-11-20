// Solara Bay — configuration: world layout, palette, vehicles, story and missions.
// Everything here is original: the city, names, characters and story are our own.
export const GAME_TITLE = 'SOLARA BAY';
export const GAME_SUBTITLE = 'An open-world crime story';
export const SAVE_KEY = 'solara-bay-save-v1';

// World: a sun-soaked coastal city, 3200 x 2400 units. Roads form a grid;
// the south edge is beach and sea.
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 92;
export const ROAD_XS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_YS = [200, 600, 1000, 1400, 1800, 2200];
export const BEACH_Y = 2250; // sand starts here
export const SEA_Y = 2330; // water starts here

// Canvas view (screenshots are 1280x720).
export const VIEW_W = 1280;
export const VIEW_H = 720;

export const PALETTE = {
  grass: '#7fae5a', grassDark: '#74a050', sand: '#e8d29a', sea: '#2e7f9e', seaDeep: '#256b87',
  road: '#3a3a40', roadEdge: '#2c2c31', lane: '#e8d44d', sidewalk: '#b9b3a4',
  buildingRoof: ['#c96f4a', '#4a7fa5', '#a54a6b', '#6b8e4a', '#b08d3e', '#7a5aa0', '#4aa08a', '#96503a'],
  buildingWall: ['#e8dcc8', '#d8c8b0', '#c8d4dc', '#e0c8c8', '#d0d8c0'],
  tree: '#3f7a34', treeDark: '#2f5e28', lamp: '#3c3c44',
  player: '#ff5a3c', playerShirt: '#ff5a3c', playerPants: '#2c3e50',
  police: '#1e4fd8', policeCar: '#e8e8f0', taxi: '#f5c518',
};

// Car models: name, top speed (u/s), acceleration, turn rate, colour choices, size.
export const CAR_TYPES = {
  sedan:   { name: 'Comet Sedan',    top: 330, accel: 240, turn: 2.6, len: 52, wid: 26, colors: ['#c0392b', '#2e6da4', '#7f8c8d', '#16a085'] },
  taxi:    { name: 'Bay Cab',        top: 300, accel: 220, turn: 2.7, len: 52, wid: 26, colors: ['#f5c518'] },
  sport:   { name: 'Falcon GT',      top: 460, accel: 330, turn: 3.1, len: 54, wid: 26, colors: ['#e74c3c', '#f39c12', '#8e44ad'] },
  truck:   { name: 'Hauler',         top: 240, accel: 170, turn: 2.0, len: 66, wid: 30, colors: ['#5d6d7e', '#784212'] },
  van:     { name: 'Courier Van',    top: 270, accel: 190, turn: 2.2, len: 58, wid: 28, colors: ['#aeb6bf', '#2c7a4b'] },
  police:  { name: 'PD Interceptor', top: 420, accel: 320, turn: 3.2, len: 54, wid: 26, colors: ['#e8e8f0'] },
};

// Named places in the city (x, y are world coordinates).
export const PLACES = {
  safehouse: { name: "Marco's Apartment", x: 420, y: 420 },
  diner:     { name: "Mama Lou's Diner",  x: 1420, y: 620 },
  docks:     { name: 'Solara Docks',      x: 2920, y: 1020 },
  casino:    { name: 'The Golden Palm',   x: 2220, y: 1420 },
  warehouse: { name: 'Vulture Warehouse', x: 1020, y: 1820 },
  pdhq:      { name: 'Solara PD HQ',      x: 1820, y: 220 },
  hospital:  { name: 'St. Marina Hospital', x: 620, y: 1420 },
  paintshop: { name: 'Spray & Go',        x: 2620, y: 620 },
  park:      { name: 'Palm Court Park',   x: 1420, y: 1020 },
};

// Story and missions. Each mission: briefing text, ordered steps, reward.
// Step kinds: enterCar, goto (on foot or in car), driveTo (must be in a car),
// collect (walk into the marker), defeat (beat N thugs), escape (reach safehouse
// while wanted, or lose the heat), deliver (reach the marker carrying the goods).
export const MISSIONS = [
  {
    id: 'wheels', title: '1 — Wheels',
    briefing: 'Marco is back in Solara Bay after five years away — and Mama Lou wants her $50,000 back. First things first: you need wheels. Any car on the street will do. Borrow one. Permanently.',
    steps: [
      { kind: 'enterCar', label: 'Steal a car (walk up to one and press E)' },
      { kind: 'driveTo', x: 2620, y: 620, r: 90, label: 'Drive to Spray & Go paint shop' },
    ],
    reward: 500,
  },
  {
    id: 'pickup', title: '2 — The Pickup',
    briefing: 'Mama Lou has a package waiting at the docks. Drive over, grab it on foot, and bring it back to the diner. The docks are Vulture turf — keep your head down.',
    steps: [
      { kind: 'driveTo', x: 2920, y: 1020, r: 100, label: 'Drive to Solara Docks' },
      { kind: 'collect', x: 2920, y: 1020, r: 46, label: 'Pick up the package on foot' },
      { kind: 'deliver', x: 1420, y: 620, r: 90, label: 'Deliver the package to Mama Lou' },
    ],
    reward: 1000,
  },
  {
    id: 'pursuit', title: '3 — Hot Pursuit',
    briefing: 'The package was PD evidence. Now the whole Solara PD wants a word. Lose them — or outrun them to the safehouse. Do not get busted.',
    startWanted: 2,
    steps: [
      { kind: 'escape', x: 420, y: 420, r: 100, label: 'Reach the safehouse — or lose the heat' },
      { kind: 'deliver', x: 1420, y: 620, r: 90, label: 'Lay low, then check in with Mama Lou' },
    ],
    reward: 2000,
  },
  {
    id: 'payback', title: '4 — Payback',
    briefing: 'The Vultures torched Lou’s delivery van. Time to return the favour. Four of their boys are holed up at the warehouse. Fists work. The pistol in the crate by the door works better.',
    startAmmo: 24,
    spawnThugs: 4,
    steps: [
      { kind: 'goto', x: 1020, y: 1820, r: 120, label: 'Get to the Vulture Warehouse' },
      { kind: 'defeat', count: 4, label: 'Deal with the Vultures (0/4)' },
      { kind: 'collect', x: 1020, y: 1820, r: 46, label: 'Take the ledger from the office' },
    ],
    reward: 3500,
  },
  {
    id: 'bigscore', title: '5 — The Big Score',
    briefing: 'The Golden Palm keeps its weekend take in a back-room vault. Grab the cash, then run — the alarm will bring every cop in Solara Bay. Get to the safehouse and the debt is gone. This is the one.',
    startWanted: 0,
    steps: [
      { kind: 'goto', x: 2220, y: 1420, r: 90, label: 'Enter The Golden Palm casino' },
      { kind: 'collect', x: 2220, y: 1420, r: 46, label: 'Grab the vault cash (this will trip the alarm)' },
      { kind: 'escape', x: 420, y: 420, r: 100, label: 'Escape to the safehouse with the cash' },
    ],
    reward: 10000,
    vaultAlarm: true,
  },
];

export const STORY_INTRO = 'Five years ago Marco Reyes left Solara Bay with nothing but a duffel bag and a debt. Now he is back — and Mama Lou, who owns half the bay, wants her $50,000. One last run of jobs, and the debt is gone. Steal cars. Outrun the law. Settle the score.';

// Tuning.
export const TUNE = {
  playerWalk: 175, playerRun: 265, playerRadius: 13, playerHealth: 100,
  punchRange: 44, punchArc: 1.5, punchDamage: 25, punchCooldown: 0.38,
  pistolDamage: 34, pistolRange: 620, pistolCooldown: 0.32,
  wantedMax: 5, wantedDecayDelay: 10, wantedDecayEvery: 5,
  copFootSpeed: 195, copCarTop: 430, bustTime: 1.4,
  trafficCount: 14, pedCount: 22, maxCops: 8,
  camZoom: 1.0, moneyStart: 250,
};
