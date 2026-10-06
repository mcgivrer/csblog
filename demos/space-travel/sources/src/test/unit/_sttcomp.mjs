/* Chargeur des tests sttcomp : exécute shared/sttcomp.js dans un contexte vm (comme le build : script classique)
   et lit modules-geom.json (s'il existe) + stt_fleet.json. Usage : import { STTCOMP, make, testGeom, geomReal, fleet, loadVm } from './_sttcomp.mjs'; */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const STTCOMP_FILE = path.resolve(ICI, '../../../../shared/sttcomp.js');
export const GEOM_FILE = path.resolve(ICI, '../../data/modules-geom.json');
export const FLEET_FILE = path.resolve(ICI, '../../assets/stt_fleet.json');

export function loadVm() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(STTCOMP_FILE, 'utf8'), ctx, { filename: 'sttcomp.js' });
  return { STTCOMP: vm.runInContext('STTCOMP', ctx), ctx };
}
/* STTCOMP par require (même realm : deepStrictEqual direct) ; loadVm() charge la même source dans un contexte isolé */
export const STTCOMP = createRequire(import.meta.url)(STTCOMP_FILE);
export const fleet = JSON.parse(fs.readFileSync(FLEET_FILE, 'utf8'));
export const hasGeom = fs.existsSync(GEOM_FILE);

/* Géométrie de test écrite à la main : socket = translation le long d'un axe */
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const testGeom = {
  format: 'stt-modules-geom', version: 1,
  modules: {
    CMD: { mass_t: 10, length_m: 8, ports: ['AFT'], sockets: { AFT: T(0, 0, -4) }, containers: [] },
    NODE: { mass_t: 5, length_m: 4, ports: ['FWD', 'AFT', 'PORT', 'STBD'], sockets: { FWD: T(0, 0, 2), AFT: T(0, 0, -2), PORT: T(2, 0, 0), STBD: T(-2, 0, 0) }, containers: [] },
    PROP: { mass_t: 0, length_m: 6, ports: ['FWD'], sockets: { FWD: T(0, 0, 3) }, containers: [] },
    CARGO: { mass_t: 20, length_m: 10, ports: ['AFT', 'FWD'], sockets: { AFT: T(0, 0, -5), FWD: T(0, 0, 5) },
      containers: [{ slot: '01', m: T(0, 1, 0) }, { slot: '02', m: T(0, -1, 0) }] },
    BAY: { mass_t: 30, length_m: 12, ports: ['FWD', 'SHUTTLE'], sockets: { FWD: T(0, 0, 6), SHUTTLE: T(0, 2, 0) }, containers: [] },
    SHUTTLE: { mass_t: 8, length_m: 5, ports: ['PAD', 'DORSAL'], sockets: { PAD: T(0, -1, 0), DORSAL: T(0, 1, 0) }, containers: [] },
  },
};
export function geomReal() { return hasGeom ? JSON.parse(fs.readFileSync(GEOM_FILE, 'utf8')) : null; }

/* noyau de test : uid et rand déterministes */
export function make(opts = {}) {
  let n = 0, s = 7;
  return STTCOMP.create({
    geom: opts.geom || testGeom,
    fleet: opts.fleet || { modules: {}, container_brands: { ACME: {}, ZED: {}, QUX: {} }, zones: {}, companies: {} },
    rand: opts.rand || (() => { s = (s * 16807) % 2147483647; return s / 2147483647; }),
    uid: opts.uid || (() => 'u' + (++n)),
  });
}
