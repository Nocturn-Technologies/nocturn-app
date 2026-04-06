# Feature: Playbook Selection in Event Creation Flow

## Problem
After creating an event, the user lands on the event detail page with an empty Playbook. They have to manually navigate to the Playbook tab and click "Apply Playbook" — most users won't discover this. The critical planning steps between event creation and event day are lost.

## Proposal
After the user clicks "Create Event" on the review card, show a **Playbook Selection Screen** before redirecting to the event detail page. This screen presents 3 AI-generated playbook options based on the event type, date, and venue.

## Flow
1. User completes event creation chat -> review card appears
2. User clicks "Create Event"
3. Event is created in the database
4. **NEW SCREEN**: "Set up your launch plan" — 3 playbook options appear
5. User picks one (or skips)
6. Tasks are auto-generated with owners and due dates
7. User lands on event detail page with a pre-populated Playbook

## Playbook Template Structure
Each playbook is a list of tasks with:
- **Task name**
- **Suggested owner** (current user, or "assign a team member")
- **Due date** (calculated backwards from event date)
- **Category** (Setup, Promo, Logistics, Day-of)

## Recommended Default Playbook: "Launch & Promote"

Working backwards from the event date. Example for an event 35 days away:

### Immediate (Day 0 — event creation day)
| Task | Owner | Due |
|------|-------|-----|
| Invite team members to event chat | Current user | Now |
| Invite collab collectives to event chat | Current user | Now |
| Confirm headliner / lock in talent | Current user | Today |

### Week 1 (Days 1-7)
| Task | Owner | Due |
|------|-------|-----|
| Create or upload event poster / artwork | Assign member | Tomorrow |
| Write event description / copy | Current user | Day 2 |
| Set up ticket tiers and pricing | Current user | Day 2 |
| Publish event page | Current user | Day 3 |
| Post teaser — "something's coming" (no lineup) | Assign member | Day 3 |

### Week 2 (Days 8-14)
| Task | Owner | Due |
|------|-------|-----|
| Post event poster with full lineup reveal | Assign member | Day 8 |
| Share event to personal + collective socials | All members | Day 8 |
| Artist spotlight post #1 (headliner) | Assign member | Day 10 |
| Set up promo codes for street team / early push | Current user | Day 10 |
| Create Instagram story / reel teaser (15-30s) | Assign member | Day 12 |

### Week 3 (Days 15-21)
| Task | Owner | Due |
|------|-------|-----|
| Artist spotlight post #2 (support act) | Assign member | Day 15 |
| FAQ post (venue info, dress code, age, parking) | Assign member | Day 17 |
| Reach out to media / blogs / local pages | Current user | Day 17 |
| Early bird price increase reminder post | Assign member | Day 19 |
| Video content — venue walkthrough or BTS | Assign member | Day 21 |

### Week 4 (Days 22-28)
| Task | Owner | Due |
|------|-------|-----|
| Set times post / schedule reveal | Assign member | Day 22 |
| "1 week out" countdown post | Assign member | Day 25 |
| Final push — "limited tickets" urgency post | Assign member | Day 27 |
| Confirm all vendor details (sound, lights, security) | Current user | Day 28 |

### Final Week (Days 29-35 / Event Day)
| Task | Owner | Due |
|------|-------|-----|
| Day-of logistics checklist (doors, sound check, guest list) | Current user | Day 33 |
| "Tonight" hype post + story | Assign member | Event day |
| Print guest list / test QR scanner | Current user | Event day |
| Post-event thank you + recap teaser | Assign member | Day after |
| Post-event wrap — review financials + send settlement | Current user | 2 days after |

## Alternative Playbook Options

### Option 2: "Lean Launch" (Minimal — for small/free events)
- Fewer tasks, no artist spotlights
- Focus on: poster, publish, 3 social posts, day-of checklist

### Option 3: "Full Campaign" (For big events with international headliners)
- Everything in "Launch & Promote" plus:
- Press release / media kit
- Paid ad campaign setup
- Influencer outreach
- Multiple video content pieces
- Aftermovie planning
- Hotel/travel coordination for talent

## Implementation Notes
- Tasks should auto-adjust due dates based on how far out the event is
- If event is < 14 days away, compress the timeline and flag urgency
- "Assign member" should show a dropdown of current team members
- Each task should be editable after creation
- Playbook should integrate with the existing Event Playbook page
