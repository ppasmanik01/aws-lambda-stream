import _ from 'highland';

import { faults, flushFaults } from '../faults';

import { debug } from '../utils';

const log = debug('pipelines');

let thePipelines = {};

export const initialize = (pipelines) => {
  log('initialize: %j', Object.keys(pipelines));
  thePipelines = pipelines;
};

export const initializeFrom = (rules, pipelines = {}) => rules.reduce(
  (accumulator, rule) => ({
    ...accumulator,
    [rule.id]: rule.pipeline(rule),
  }),
  pipelines,
);

export const execute = (head, includeFaultHandler = true) => {
  const keys = Object.keys(thePipelines);

  log('execute: %j', keys);

  if (includeFaultHandler) {
    // after pre processoring
    head = head.errors(faults);
  }

  const lines = keys.map((key) => {
    const f = thePipelines[key];
    const p = _.pipeline(f);
    p.name = key;
    return p;
  });

  /* istanbul ignore else */
  if (lines.length > 0) {
    const last = lines.length - 1;

    lines.slice(0, last).forEach((p, i) => {
      log('FORK: %s', p.name);
      const os = head.observe();

      lines[i] = os
        // shallow clone of data per pipeline
        .map((uow) => ({
          pipeline: p.name,
          ...uow,
        }))
        .through(p);
    });

    log('FORK: %s', lines[last].name);
    const p = lines[last];
    lines[last] = head
      .map((uow) => ({
        pipeline: p.name,
        ...uow,
      }))
      .through(lines[last]);
  }

  let s = _(lines).merge();

  if (includeFaultHandler) {
    s = s.errors(faults)
      .through(flushFaults);
  }

  return s;
};