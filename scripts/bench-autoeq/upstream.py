"""Run upstream AutoEq over the curves run.mjs selected, in run.mjs's record format.

    python scripts/bench-autoeq/upstream.py --autoeq AUTOEQ_REPO --curves FILE.curves.json \
        [--bands 5,8,10] --out FILE.jsonl

AUTOEQ_REPO is a checkout of https://github.com/jaakkopasanen/AutoEq (the `autoeq/` package is
all it reads) and needs numpy, scipy, matplotlib, tabulate and PyYAML.

What AutoEq's own batch path does with a measurement: `process(min_mean_error=True)` against the
target, then `optimize_parametric_eq` at 48 kHz, which is mGT's rate. A total of N bands is
N - 2 peaking plus AutoEq's pinned shelves — `8_PEAKING_WITH_SHELVES` at N = 10, with its
fixed parts copied from `PEQ_CONFIGS` rather than restated.

Every filter is held to the `limits` run.mjs wrote into the curves file, the same window every
other engine got: peaking bands to its Q and gain and to its frequency range capped at 10 kHz,
where AutoEq's own default stops. The shelves are free to move, as modernGraphTool runs
turboEQ's: in that frequency range, inside AutoEq's shelf Q window of 0.4 to 0.7. The largest
boost is capped at the top of the gain window, as modernGraphTool caps turboEQ's.

Two engines. `upstream` keeps the preset's `min_std = 0.008` early stopping. `upstream-converged`
drops that rule, which is how turboEQ runs; the gap between them is what the early stop costs,
and it is not the port's.
"""
import argparse
import copy
import json
import os
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--autoeq', required=True)
parser.add_argument('--curves', required=True)
parser.add_argument('--bands', default='5,8,10')
parser.add_argument('--out', required=True)
args = parser.parse_args()

sys.path.insert(0, os.path.abspath(args.autoeq))
import numpy as np  # noqa: E402
from autoeq.constants import PEQ_CONFIGS  # noqa: E402
from autoeq.frequency_response import FrequencyResponse  # noqa: E402

FS = 48000
TREBLE_SAFE_MAX_FC = 10000
# AutoEq's DEFAULT_SHELF_FILTER_MIN_Q / MAX_Q, which modernGraphTool keeps its shelves inside.
SHELF_Q = (0.4, 0.7)
TYPES = {'Peaking': 'PK', 'LowShelf': 'LSQ', 'HighShelf': 'HSQ'}


def config(total, converged, limits):
    base = copy.deepcopy(PEQ_CONFIGS['8_PEAKING_WITH_SHELVES'])
    max_fc = min(limits['maxFc'], TREBLE_SAFE_MAX_FC)
    shelves = [
        {'type': f['type'], 'min_fc': limits['minFc'], 'max_fc': max_fc,
         'min_q': max(SHELF_Q[0], limits['minQ']), 'max_q': min(SHELF_Q[1], limits['maxQ']),
         'min_gain': limits['minGain'], 'max_gain': limits['maxGain']}
        for f in base['filters'] if f['type'] != 'PEAKING'
    ]
    peaking = {
        'type': 'PEAKING',
        'min_fc': limits['minFc'], 'max_fc': max_fc,
        'min_q': limits['minQ'], 'max_q': limits['maxQ'],
        'min_gain': limits['minGain'], 'max_gain': limits['maxGain'],
    }
    base['filters'] = shelves + [dict(peaking) for _ in range(total - len(shelves))]
    if converged:
        base.pop('optimizer', None)
    return base


def fit(raw, target, total, converged, limits):
    f, db = np.array(raw, dtype=float).T
    fr = FrequencyResponse(name='curve', frequency=f, raw=db)
    t0 = time.perf_counter()
    fr.process(target=target.copy(), min_mean_error=True, fs=FS, max_gain=max(0, limits['maxGain']))
    peqs = fr.optimize_parametric_eq(config(total, converged, limits), FS)
    ms = (time.perf_counter() - t0) * 1000
    filters = [
        {'type': TYPES[type(fl).__name__], 'fc': float(fl.fc), 'q': float(fl.q),
         'gain': float(fl.gain)}
        for peq in peqs for fl in peq.filters
    ]
    return ms, filters


with open(args.curves) as fh:
    data = json.load(fh)
tf, tdb = np.array(data['target'], dtype=float).T
target = FrequencyResponse(name='target', frequency=tf, raw=tdb)
bands = [int(b) for b in args.bands.split(',')]
limits = data['limits']

with open(args.out, 'w') as out:
    for engine, converged in (('upstream', False), ('upstream-converged', True)):
        fit(data['curves'][0]['raw'], target, bands[0], converged, limits)  # warm-up
        for total in bands:
            started = time.perf_counter()
            for curve in data['curves']:
                ms, filters = fit(curve['raw'], target, total, converged, limits)
                out.write(json.dumps({'engine': engine, 'bands': total, 'curve': curve['name'],
                                      'ms': ms, 'filters': filters}) + '\n')
            out.flush()
            print(f'{engine} {total} bands: {time.perf_counter() - started:.1f} s', file=sys.stderr)
