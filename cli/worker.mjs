// Node worker thread: runs a share of the raids and posts the results back.
import { parentPort, workerData } from 'node:worker_threads';
import { simulate } from '../engine/simulate.js';

const { cfgs, team, runs, seed } = workerData;
parentPort.postMessage(simulate(cfgs, team, runs, seed));
