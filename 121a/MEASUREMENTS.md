# 121a — room measurements

**Status: NOT YET TAKEN.** Assigned to Scott, on site.

## Why this exists

Virtual staging is generated from a photograph, and a generative model has no idea
how big the room actually is. On Sept 2, 2026 it produced a "queen" bed for the
bedroom that was smaller than a twin — which silently advertised a larger room than
the one being let. `scripts/stage.mjs` now carries a SCALE block telling the model
real furniture dimensions and the fixed references in frame (door 32in, outlet plate
2.75in, floor plank 7in, baseboard 3.5in), and forbidding it from shrinking a piece
to make a room look bigger.

That rule makes the model *try* to get scale right. It does not let anyone *verify*
it. Verification needs real numbers, which is what this file is for. Until it is
filled in, no page copy may assert that a specific piece of furniture fits, or state
a clearance.

## What to measure

Tape measure, to the nearest inch. Wall lengths at floor level.

### Bedroom — the priority
- [ ] Wall length, each of the four walls
- [ ] Door: width of opening, and which way it swings
- [ ] Distance from the door opening to the nearest perpendicular wall
- [ ] Each window: width, and height of sill off the floor
- [ ] Both closets: width and depth of each, door type (swing / slider / bifold)
- [ ] Clear floor span on the wall furthest from the door — the wall a bed would go against
- [ ] Ceiling height

### Office / flex room
- [ ] Wall length, each wall
- [ ] Closet: width, depth, door type
- [ ] Window: width, sill height
- [ ] Doorway width, and swing direction
- [ ] Longest uninterrupted wall run (does a 48in desk fit against one?)

### Living room
- [ ] Wall length, each wall
- [ ] Length of the granite breakfast bar, and its height off the floor
- [ ] Clear span on the wall opposite the kitchen — the sofa wall
- [ ] Distance from the front door swing to the nearest obstruction
- [ ] Ceiling height (the copy says "high ceilings" — worth a number)

### Kitchen
- [ ] Counter run length, each section
- [ ] Distance across the galley — cabinet face to cabinet face, or to the bar
- [ ] Range width (30in or 24in?)
- [ ] Refrigerator opening: width, depth, height

### Bathroom
- [ ] Room width and length
- [ ] Vanity width
- [ ] Shower opening width

### Whole unit
- [ ] Narrowest doorway anywhere on the path from the front door to the bedroom —
      this is the number that decides whether a sofa can physically get in
- [ ] Hall width
- [ ] Front door width

## Also worth photographing while there

- [ ] The two bedroom closets, doors open
- [ ] A tape measure held across the bedroom's bed wall, in frame

## When the numbers land

1. Fill them in above and commit.
2. Re-run the affected rooms: `node scripts/stage.mjs 20260830-46 20260830-21 20260830-54`
3. Check each staged piece against the real span before publishing.
4. Only then may the page state that something fits, or give a clearance.
