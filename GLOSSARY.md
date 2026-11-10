# modernGraphTool

A web tool that draws frequency response measurements of headphones and other audio devices, and
lets a user compare and equalize them.

## Language

### Graph

**Curve item**:
One entry in the list of things shown on the graph: a phone, a target, an uploaded measurement or
an EQ curve.
_Avoid_: Curve (ambiguous with trace), entry, FR object

**Channel**:
One of a curve item's main responses: left (L), right (R) or their average (AVG).
_Avoid_: Side, ear (an EQ band's ear is L or R only)

**Trace**:
One line or area a curve item puts on the graph: a main channel (L, R or AVG), one run of a sample
set, or the fill between a sample set's extremes. A curve item has zero or more traces.
_Avoid_: Curve, path, line

**Run**:
One measurement of a sample set, drawn as its own trace when the user shows it.
_Avoid_: Sample (the set is the sample set; one member is a run)

**Baseline**:
The curve item every trace is drawn relative to, so that it appears flat and the others show their
difference from it.
_Avoid_: Compensation, reference curve

**Baseline mode**:
Which shape of the baseline is subtracted: off, the baseline as measured (without adjustment), or
the baseline with the user's target adjustments applied (with adjustment). Only a customized target
has the third mode.

### Equalizer

**EQ source**:
The phone the equalizer is applied to — its average, or one run of its sample set.

**EQ curve**:
The curve item that shows the EQ source with the current EQ bands applied.
_Avoid_: EQ'd phone, modified curve

**Momentary override**:
Holding `\` flips the equalizer until release: a bypass when it was on, an audition when it was off.
_Avoid_: Momentary bypass (it is only one of the two directions)

**Playable band**:
An EQ band that is enabled and has every value filled in, so it shapes the graph, the audio and the
preamp alike.
_Avoid_: Active filter, complete filter
