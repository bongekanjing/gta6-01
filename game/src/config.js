// Tuning for Vice City Nights: a top-down open-world crime game in a desktop browser.
// All distances are world pixels; the world is a 3200 x 3200 city. Times are seconds.
export const STEP = 1 / 60;
export const WORLD = 3200;
export const ROAD_EVERY = 400;
export const ROAD_WIDTH = 96;
export const SAVE_KEY = 'vcn-save-v1';

// Player on foot.
export const WALK_SPEED = 175;
export const PLAYER_RADIUS = 12;
export const PLAYER_HEALTH = 100;
export const SPRINT_MULT = 1.45;

// Driving.
export const CAR_ACCEL = 420;
export const CAR_REVERSE = 240;
export const CAR_MAX_SPEED = 430;
export const CAR_MAX_REVERSE = 170;
export const CAR_TURN = 2.6;
export const CAR_BRAKE = 620;
export const CAR_RADIUS = 17;

// Wanted / police.
export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 9;
export const BUST_SECONDS = 1.1;
export const COP_SPEED = 395;
export const COP_MAX = 5;

// Combat.
export const BULLET_SPEED = 760;
export const BULLET_RANGE = 520;
export const FIRE_INTERVAL = 0.22;
export const PED_HEALTH = 1;
export const COP_HEALTH = 3;
export const RIVAL_HEALTH = 6;

// World population.
export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 10;
export const PED_COUNT = 26;
export const PICKUP_COUNT = 8;

// Economy.
export const START_CASH = 100;
export const PICKUP_CASH_MIN = 25;
export const PICKUP_CASH_MAX = 60;
export const HEALTH_PACK = 45;
