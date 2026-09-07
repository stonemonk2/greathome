# 121a — room measurements

**Status: first pass taken Sept 6, 2026. Second pass on site Sept 7.**
Confirmed numbers are recorded below. Everything in the punch list is still open.

## Why this exists

Virtual staging is generated from a photograph, and a generative model has no idea
how big the room actually is. On Sept 2, 2026 it produced a "queen" bed for the
bedroom that was smaller than a twin — which silently advertised a larger room than
the one being let.

The first fix was a rule telling the model not to shrink furniture. That was not
enough, because the *references* it was given were guesses: it was told an interior
door is "about 32in" while looking at this unit's 27in bedroom door, and that a
floor plank is "about 7in" when these are 9in. Both errors run the same way — they
make the model believe the room is bigger than it is, and every piece it places
shrinks to match.

`scripts/stage.mjs` now carries a `ROOM_SCALE` block fed from the numbers in this
file, per room. **When a number here changes, change it there too.**

The standing rule: **no page copy may assert that a specific piece of furniture
fits, or state a clearance, unless the number behind it appears in the Confirmed
section below.**

---

## Confirmed — measured Sept 6, 2026

### Whole unit

| | |
|---|---|
| Layout | Front to back along the left side of the building: living → dining/entry → kitchen → office → bedroom. The office sits between the hall and the bedroom, and the bathroom opens off the office. |
| Ceilings | Living, dining, hall, office **118in**. Bedroom **95in** — the lowest. Kitchen and bath: **not yet measured** |
| Doorways, clear, with the door on | Front **34in** · office **31–32in** · bedroom **27in**. Interior doors **80in** tall |
| Hall pinch | **32in**, just past the refrigerator |
| Closets | **Two in the entire unit.** Bedroom 47w × 24d × 85h, curtain. Office 57w × 31d × 118h, 36in door |
| Windows | **Five.** Bedroom 2, office 1, living/dining 2. **None in the kitchen or bathroom** |
| Path to the bedroom | front door 34in → hall 32in → office door 32in → bedroom door 27in × 80in |

### Living + dining — one L-shaped space

| | |
|---|---|
| Living leg | **110in wide × 151in deep** (~115 sf) |
| Step-out | The right-hand wall steps **50in** further right at 151in |
| Dining / entry | **160in wide × 131in deep** (~146 sf) |
| Front door | 34in wide; frame sits **163in** back from the front window wall |
| Longest clear wall run | **163in** — the front-door wall, between the door and the front window. This is the sofa wall |
| Granite bar | 66in long, 24in deep, top **48in** off the floor — re-measure, see punch list |
| Pass-through opening | 64.5in wide; 23in from the counter to the head of the opening |
| Pony wall under the bar | 51in long — the granite cantilevers past it |

### Kitchen

| | |
|---|---|
| Galley | **77in** cabinet face to cabinet face |
| Counter runs | 100in longest · 50in sink section · 35in beside the stove |
| Range | 30in |
| Refrigerator opening | 67in high × 30.5in deep. **Width recorded as 27.5in — cannot be right**, see punch list |

### Office

| | |
|---|---|
| Room | **110in × 135in** (~103 sf), ceiling 118in |
| Hall door | 32in × 80in, swings **into** the office |
| Closet | 57w × 31d × 118h; 36in door, swings into the office |
| Window | sill **25in** off the floor; 41in trim to trim |
| Longest clear wall runs | **80in** and **90in** — a 48in desk fits against either |

### Bathroom

| | |
|---|---|
| Room | **46in wide × 108in long** (~34 sf) |
| Vanity | 30in wide × 19in deep |
| Shower opening | 46in — the full width of the room |

### Bedroom

| | |
|---|---|
| Room | **153in × 106in** (~113 sf), ceiling **95in** |
| Door | 27in × 80in, frame 2in off the side wall, swings in |
| Window 1 | 27w × 59h, sill 33in — matches Milgard line 4 on Ashby invoice #697452 |
| Window 2 | 19w × 44h, sill 34in — matches no window on the invoice, see punch list |
| Closet | 47w × 24d × 85h, curtained, on the door wall at the far end from the door |
| **The bed wall** | the clear **106in** wall — the only wall in the room with no door, no window and no closet |

---

## Punch list — Sept 7, in walking order

### At the front door
- [ ] Which way does it swing, hinged on which side?
- [ ] Anything inside its swing? Measure to the nearest obstruction

### Living room
- [ ] Front window — width, and **sill height off the floor** (decides whether a sofa back clears it)
- [ ] Gas heater — how far along the right wall, how wide, how far it projects into the room
- [ ] The 50in step-out: what is behind the living room right-hand wall for those first 151in? Unit B, a stair, an exterior notch?
- [ ] Confirm the 163in clear run on the front-door wall is genuinely uninterrupted

### Dining / breakfast bar
- [ ] **Re-measure the bar: floor to the top of the stone.** 48in is recorded. A kitchen counter is 36in and a seating bar is 42in. If it really is 48in it is a serving ledge, not a breakfast bar, and the wording on the site and on Zillow has to change
- [ ] Is there knee space under it, or is it solid wall down to the floor?
- [ ] The window above the front door — width, sill height

### Kitchen
- [ ] **Kitchen ceiling — actual tape, do not derive it.** 3 ft below 118in gives 82in, which is impossible: the wall cabinets are 36in tall over a 36in counter, so they need 90in before any reveal. A chimney extension was also bought for the hood, which is a tall-ceiling part
- [ ] Kitchen depth front to back — pass-through wall to the office wall
- [ ] **Refrigerator opening width.** 27.5in is recorded but the installed Samsung RT70F18LRSRAA is about 29.75in wide, so the number is measuring something else
- [ ] Confirm the layout: do the fridge and the stove face each other across the 77in?

### Hall
- [ ] Hall length — pass-through wall to the office door
- [ ] Confirm 32in is the narrowest point, and note exactly where

### Office
- [ ] Which wall is the closet on, and where along it?
- [ ] Is the 36in a single door on a 57in opening, or two doors / bypass sliders?
- [ ] Bathroom door — where along the office wall, and which way does it swing?
- [ ] Office window — width of the **frame**, not the trim, and where along the wall it sits

### Bathroom
- [ ] **Bathroom ceiling — actual tape**
- [ ] Is the shower at the bedroom end of the room?
- [ ] Toilet position

### Bedroom
- [ ] **Re-measure window 2 — frame width and height, not the glass.** 19 × 44 matches nothing on the Ashby invoice; the smallest of the five units is 28 × 60
- [ ] Confirm which wall holds each window, and where the closet sits along the door wall
- [ ] Confirm the clear 106in wall really is clear — no outlet, no vent, no register
- [ ] Distance from the closet opening to the nearest corner

### Anywhere
- [ ] **Is there a second exterior door?** A back or side entrance changes everything about what furniture can get in

---

## Photographs to take

- [ ] **The bedroom bed wall, straight on, with a tape measure stretched across it in frame.** This is the one that lets a staged bed be checked against the real wall
- [ ] The bedroom closet, curtain pulled back
- [ ] The office closet, door open
- [ ] The granite bar from the side, with a tape running floor to the top of the stone
- [ ] The kitchen looking back at the pass-through, ceiling in frame
- [ ] Standing in the hall looking forward to the front window — the full-length sight line

---

## Cleared for the page

These are backed by numbers above and may now be stated:

- Ceiling height in the living, dining and office — **118in**
- A **48in desk** fits the office
- An **84in sofa** fits the 163in run on the front-door wall
- A **true queen** fits the bedroom, on the clear 106in wall
- The bedroom door is **27in × 80in**, so a one-piece queen foundation will not make
  the turn — a split foundation or a platform frame will, and a boxed mattress is
  a non-issue

Still not cleared: anything about the breakfast bar height, the kitchen or bathroom
ceilings, or clearances in the living room.

---

## When the numbers land

1. Fill them in above and commit.
2. **Update `ROOM_SCALE` in `scripts/stage.mjs`** with any number that changed.
3. Re-run the affected rooms: `node scripts/stage.mjs 20260830-54 20260830-47 20260830-21`
4. Check each staged piece against the real span before publishing.
5. Redraw `121a/floorplan-draft.svg`, then decide whether it goes on the listing page.
6. Only then may the page state that something fits, or give a clearance.
