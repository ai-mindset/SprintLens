// ===========================================================================
// Synthetic data generator for SprintLens
// --------------------------------------------------------------------------
// Generates 90 days of Slack update threads (twice weekly ≈ 26 threads)
// and 4 retro board CSVs (one per 3-week sprint).
//
// The data tells a realistic story: work pressure fluctuates, people get
// sick, weather affects mood, and action items from retros often don't
// get followed through — all the messiness of a real team.
// ===========================================================================

// --- Seeded PRNG (Linear Congruential Generator) ---
// This is a classic LCG. The formula:
//   _s = (_s * 1103515245 + 12345) & 0x7fffffff
// takes the current seed, multiplies by a large constant, adds an offset,
// and masks to 31 bits. This produces a deterministic sequence of
// pseudo-random numbers — meaning the same seed always gives the same
// output, so your test data is reproducible.
let _s = 42;
const rand = () => (_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

// --- UUID generator (simplified) ---
// Generates a UUID-like string for the CSV's note_id, author_id etc.
// Not RFC-compliant but close enough for synthetic data.
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- Team ---
// 11 data scientists, each with a personality disposition that shifts
// their sentiment up or down. This creates natural variation: some people
// are glass-half-full, others lean critical, most are in the middle.
const TEAM = [
  { name: "Alex Morgan", disposition: 0.8 }, // optimist
  { name: "Priya Sharma", disposition: 0.6 },
  { name: "Jordan Lee", disposition: 0.5 }, // neutral
  { name: "Sam Okafor", disposition: 0.45 },
  { name: "Nina Petrov", disposition: 0.3 }, // leans negative
  { name: "Carlos Mendez", disposition: 0.6 },
  { name: "Yuki Tanaka", disposition: 0.55 },
  { name: "Beth Williams", disposition: 0.4 },
  { name: "David Chen", disposition: 0.5 },
  { name: "Fatima Al-Rashid", disposition: 0.65 },
  { name: "Tom Bradley", disposition: 0.35 }, // biggest complainer
];

// --- Work packages the team works on ---
// These give updates a sense of real ongoing work rather than
// generic "did some stuff" messages.
const WORK_PACKAGES = [
  "the data pipeline migration",
  "the churn prediction model",
  "the QA automation suite",
  "the dashboard refactor",
  "the API integration",
  "the data quality framework",
  "the compliance reporting tool",
  "the feature store setup",
];

// --- World state per week ---
// Each week has factors that influence everyone's messages:
//   workload: 0 (quiet) to 1 (crunch time) — high workload = more blockers, more fatigue
//   weather: a string that occasionally creeps into messages
//   sicknessRate: probability each person is off sick that week
//   sprintPhase: "start", "mid", or "end" — end of sprint = more pressure
interface WeekState {
  workload: number;
  weather: string;
  sicknessRate: number;
  sprintPhase: "start" | "mid" | "end";
}

function generateWeekStates(weeks: number): WeekState[] {
  const states: WeekState[] = [];
  for (let w = 0; w < weeks; w++) {
    const sprintWeek = w % 3; // 3-week sprints
    const sprintPhase = sprintWeek === 0
      ? "start"
      : sprintWeek === 1
      ? "mid"
      : "end";

    // Workload ramps up towards end of sprint, with some random variation.
    // Some weeks are naturally quieter (low workload), others are crunch.
    const baseWorkload = sprintPhase === "end"
      ? 0.7
      : sprintPhase === "mid"
      ? 0.5
      : 0.3;
    const workload = Math.min(1, baseWorkload + (rand() * 0.3 - 0.1));

    // Weather varies by season-ish (we just cycle through some options)
    const weather = pick([
      "sunny and warm",
      "raining all week",
      "bitingly cold",
      "mild and pleasant",
      "humid and stormy",
      "grey and drizzly",
      "unseasonably hot",
      "crisp and clear",
    ]);

    // Sickness: small chance most weeks, slightly higher in "winter" weeks
    const sicknessRate = chance(0.2) ? 0.15 : 0.05;

    states.push({ workload, weather, sprintPhase, sicknessRate });
  }
  return states;
}

// --- Colleagues referenced by name in updates ---
// Using the team names plus some "external" people they interact with
const COLLEAGUES = TEAM.map((t) => t.name.split(" ")[0]);
const EXTERNALS = ["Mark", "Sarah", "James", "Olivia", "Daniel"];

// --- Ticket numbers ---
// Generates a ticket reference like "#42" — these create a sense
// of a real issue tracker with cross-dependencies
function ticket(): string {
  return `#${randInt(1, 60)}`;
}

// --- Emojis for section markers ---
const EMOJIS_WWW = [":tada:", ":clap:", ":rocket:", ":star:", ""];
const EMOJIS_LL = [":bulb:", ":thinking:", ":memo:", ""];
const EMOJIS_GFW = [":target:", ":dart:", ":running:", ""];
const EMOJIS_ATW = [":sunrise:", ":wave:", ":house_with_garden:", ""];
const EMOJIS_POS = [":white_check_mark:", ":heavy_check_mark:", ":muscle:", ""];
const EMOJIS_BLOCK = [
  ":warning:",
  ":octagonal_sign:",
  ":face_with_head_bandage:",
  "",
];

// --- Message templates ---

// Type 1: "How's your week going? Any blockers?"
function generateUpdate1(
  person: typeof TEAM[0],
  week: WeekState,
  isSick: boolean,
): string {
  const wp = pick(WORK_PACKAGES);
  const mood = person.disposition + (1 - week.workload) * 0.2 -
    (isSick ? 0.3 : 0);
  const col1 = pick(COLLEAGUES.filter((n) => n !== person.name.split(" ")[0]));
  const col2 = pick(
    COLLEAGUES.filter((n) => n !== person.name.split(" ")[0] && n !== col1),
  );
  const t1 = ticket();
  const t2 = ticket();

  if (isSick) {
    return pick([
      `${pick(EMOJIS_BLOCK)} Out sick today, hopefully back tomorrow. ${
        pick(["Flu", "Stomach bug", "Migraine", "Bad cold"])
      } — not fun. Will catch up on ${wp} when I'm back.`,
      `Caught a bug, taking a couple days to recover. ${col1} is covering ${wp} in the meantime. Ticket ${t1} will have to wait.`,
      `Home with a fever. Not getting much done unfortunately. ${col2} kindly agreed to pick up my review on ${wp}.`,
    ]);
  }

  if (mood > 0.65) {
    return pick([
      `${pick(EMOJIS_POS)} ${wp} is going well — ${
        pick(["wrapped up the first phase", "nearly done", "ahead of schedule"])
      }. I think I'm almost finished here, just need to write some unit tests to make sure we've dotted all the i's and crossed all the t's. ${col1} and I had a discussion on how to improve our process behind ${
        pick(WORK_PACKAGES)
      }, I took some time to document the outcome of our conversation.`,
      `${pick(EMOJIS_POS)} Had a productive couple of days. ${
        wp.charAt(0).toUpperCase() + wp.slice(1)
      } ${
        pick(["was a breeze", "is coming together nicely", "is basically done"])
      }. ${col1} reviewed my PR and it's merged. Starting on ticket ${t1} next.${
        chance(0.3) ? ` Also the weather being ${week.weather} helps 😄` : ""
      }`,
      `${
        pick(EMOJIS_POS)
      } Good week so far. Finished ${wp} — ${col2} and I paired on the tricky bit and it turned out great. Will need to coordinate with ${col1} on ${
        pick(WORK_PACKAGES)
      } next week. ${
        chance(0.25)
          ? `${col2} and ${
            pick(EXTERNALS)
          } will be attending a conference soon, I asked them to keep me posted about talks that might contain AI tips and tricks.`
          : ""
      }`,
      `${
        pick(EMOJIS_POS)
      } Really positive progress on ${wp}. ${col1} and I demoed to stakeholders and they were happy. ${
        chance(0.2) ? `Even with the ${week.weather} I'm in a good flow.` : ""
      } Ticket ${t1} is closed, moving on to ${t2}.`,
    ]);
  }

  if (mood > 0.4) {
    return pick([
      `Plodding along with ${wp}. ${
        pick([
          "Steady progress",
          "Just grinding through it",
          "Getting there slowly",
        ])
      }. Ticket ${t1} is in review, ${col1} should have a look when they get a chance. Nothing major to report.`,
      `Making incremental progress on ${wp}. ${
        chance(0.3)
          ? `A bit drained this week — the ${week.weather} isn't helping.`
          : ""
      } Had a useful sync with ${col1} on ${
        pick(WORK_PACKAGES)
      }, we agreed to split the work. Ticket ${t1} is blocked by ${t2}, I'll have a chat with ${col2} about it.`,
      `${
        wp.charAt(0).toUpperCase() + wp.slice(1)
      } is coming along. ${col1} raised a good point in code review that I need to address. Nothing exciting to share, just heads-down work.`,
      `Decent week. ${wp} is maybe 70% done. ${col2} helped unblock me on ticket ${t1}. ${
        chance(0.25)
          ? `The weather is ${week.weather} so I'll go out for a walk during my lunchbreak when I can.`
          : ""
      }`,
    ]);
  }

  // Low mood — blockers, complaints, fatigue
  return pick([
    `${pick(EMOJIS_BLOCK)} My work on ${wp} relies on ${
      pick(WORK_PACKAGES)
    } that's unfinished — ticket ${t2} is blocked by ${t1}. I'm blocked by that. ${col1} is aware but not sure when they'll get to it.`,
    `${pick(EMOJIS_BLOCK)} Struggling with ${wp} this week. ${
      pick([
        "Too many context switches",
        `Waiting on review from ${col1}`,
        "The requirements keep changing",
      ])
    }. Spent half a day on ${
      pick(WORK_PACKAGES)
    } that turned out to be the wrong approach.`,
    `${pick(EMOJIS_BLOCK)} Feeling stretched thin. ${
      wp.charAt(0).toUpperCase() + wp.slice(1)
    } is ${pick(["stalled", "going slowly", "a slog"])} — ${
      chance(0.4)
        ? `and the ${week.weather} is making it worse.`
        : "just one of those weeks."
    } I have ${
      randInt(3, 7)
    } tickets on my list and ticket ${t1} is blocked by ${t2}. ${col1} is off this week so I can't get sign-off.`,
    `${pick(EMOJIS_BLOCK)} Not a great week. ${
      pick([
        `Three meetings that could've been emails`,
        `Spent half the week on admin instead of actual work`,
        `Behind on everything`,
      ])
    } and ${wp} is suffering. ${col2} is stuck on the same blocker so we're both twiddling our thumbs.`,
  ]);
}

// Type 2: "What went well, lessons learned, goals for the week?"
function generateUpdate2(
  person: typeof TEAM[0],
  week: WeekState,
  isSick: boolean,
): string {
  const wp = pick(WORK_PACKAGES);
  const mood = person.disposition + (1 - week.workload) * 0.2 -
    (isSick ? 0.2 : 0);
  const col1 = pick(COLLEAGUES.filter((n) => n !== person.name.split(" ")[0]));
  const col2 = pick(
    COLLEAGUES.filter((n) => n !== person.name.split(" ")[0] && n !== col1),
  );
  const t1 = ticket();
  const t2 = ticket();
  const t3 = ticket();

  // --- WWW (What Went Well) ---
  const www = mood > 0.6
    ? pick([
      `${
        pick(EMOJIS_WWW)
      } www: I worked on ${wp}, I think I'm almost finished here. Will need to write unit tests to make sure we've dotted all the i's and crossed all the t's. ${col1} and I had a discussion on how to improve our process behind ${
        pick(WORK_PACKAGES)
      }, I took some time to document the outcome of our conversation.`,
      `${
        pick(EMOJIS_WWW)
      } www: got ${wp} over the line — ${col2} reviewed and it's merged. ${col1} and I also sorted out the deployment config which was long overdue. Ticket ${t1} is closed.`,
      `${
        pick(EMOJIS_WWW)
      } www: good progress on ${wp}, team collaboration was great. ${col2} and I paired on the data validation logic and knocked it out in half the time I expected.`,
      `${
        pick(EMOJIS_WWW)
      } www: ${wp} demo went well, stakeholders were impressed with the results. ${col1} presented the findings slides and I walked through the technical bits. ${col2} and ${
        pick(EXTERNALS)
      } will be attending a conference next month, I asked them to keep me posted about talks that might be relevant to what we're building.`,
    ])
    : mood > 0.4
    ? pick([
      `${
        pick(EMOJIS_WWW)
      } www: made some progress on ${wp} despite the noise. ${col1} helped me debug a tricky issue with the data pipeline, turned out to be a schema mismatch.`,
      `${
        pick(EMOJIS_WWW)
      } www: ${wp} is inching forward. Got ticket ${t1} into review at least. ${col2} gave me some good feedback on the approach.`,
      `${
        pick(EMOJIS_WWW)
      } www: survived the week. ${col1} and I managed to get ${
        pick(WORK_PACKAGES)
      } roughly working in staging, though it needs more testing.`,
    ])
    : pick([
      `${
        pick(EMOJIS_WWW)
      } www: honestly not much, ${wp} is stuck. Ticket ${t1} is blocked by ${t2} and ${col1} is on leave so can't help.`,
      `${
        pick(EMOJIS_WWW)
      } www: I showed up? That counts right? Spent most of the week in meetings and unblocking other people's tickets.`,
      `${pick(EMOJIS_WWW)} www: one small win — got ${
        pick(WORK_PACKAGES)
      } partially working in dev. ${col2} spotted a bug I'd been staring at for two days, so that was a relief.`,
    ]);

  // --- LL (Lessons Learned) ---
  const ll = mood > 0.55
    ? pick([
      `${
        pick(EMOJIS_LL)
      } ll: early stakeholder alignment saves time later — we caught a requirements gap before writing any code this sprint`,
      `${
        pick(EMOJIS_LL)
      } ll: breaking ${wp} into smaller chunks worked well, easier to review and test incrementally`,
      `${
        pick(EMOJIS_LL)
      } ll: pair programming on tricky bits was worth it — ${col1} and I solved in 2 hours what would've taken me a day alone`,
      `${
        pick(EMOJIS_LL)
      } ll: I never thought I'd find Deno so pleasant, it's a very nice JS runtime. The built-in test runner is great`,
      `${
        pick(EMOJIS_LL)
      } ll: documenting decisions as we go (not after the fact) made the handover to ${col2} much smoother`,
    ])
    : pick([
      `${
        pick(EMOJIS_LL)
      } ll: we need fewer meetings, the ceremony overhead is eating into actual work time. I lost ~6 hours this week to standups, planning, and retro prep`,
      `${
        pick(EMOJIS_LL)
      } ll: unclear requirements cost us a day on ${wp}. ${col1} and I built the wrong thing because nobody confirmed the spec`,
      `${
        pick(EMOJIS_LL)
      } ll: should've pushed back on the scope creep sooner. By the time we raised it, we'd already burned two days on ${
        pick(WORK_PACKAGES)
      }`,
      `${
        pick(EMOJIS_LL)
      } ll: waiting until end of sprint to raise blockers doesn't work — too late to course-correct. We need a mid-sprint check-in or something`,
      `${
        pick(EMOJIS_LL)
      } ll: the estimation was way off again. We said 3 days for ${wp}, it's been 8. We need to get better at this or stop estimating entirely`,
    ]);

  // --- GFW (Goals For the Week) ---
  const gfw = isSick
    ? `${
      pick(EMOJIS_GFW)
    } gfw: recover and catch up on ${wp} when I'm back. ${col1} is covering ticket ${t1} in the meantime`
    : pick([
      `${pick(EMOJIS_GFW)} gfw: I have another ${
        randInt(3, 6)
      } tickets on my list. Ticket ${t1} is blocked by ${t2}, I'll have a chat with ${col1} about it. Should be able to finish ${wp} by Wednesday if the blockers clear`,
      `${pick(EMOJIS_GFW)} gfw: finish ${wp} and start ${
        pick(WORK_PACKAGES)
      }. Also need to review ${col2}'s PR on ticket ${t3}`,
      `${
        pick(EMOJIS_GFW)
      } gfw: get ${wp} into review and write up the findings doc. ${col1} and I need to sync on ${
        pick(WORK_PACKAGES)
      } too`,
      `${
        pick(EMOJIS_GFW)
      } gfw: clear the backlog on ${wp}, tackle ticket ${t1}, and ${
        pick([
          "write up findings",
          "do a demo for stakeholders",
          "address the tech debt",
        ])
      } if time allows. ${
        chance(0.3)
          ? `The weather is ${week.weather} so I'll go out for a walk during my lunchbreak when I can.`
          : ""
      }`,
      `${pick(EMOJIS_GFW)} gfw: ${
        randInt(2, 5)
      } tickets to close. ${wp} is the priority. ${col2} and I are pairing on ${
        pick(WORK_PACKAGES)
      } on Thursday`,
    ]);

  // --- ATW (At The Weekend) ---
  const atw = chance(0.4)
    ? `\n${pick(EMOJIS_ATW)} atw: ${
      pick([
        `going hiking if the ${week.weather} holds`,
        "baking a cake for my partner's birthday",
        "finally finishing that book I started months ago",
        "taking the kids to the park",
        "rest and recovery, honestly — this week drained me",
        "trying a new recipe — wish me luck",
        "cinema + dinner, need the break",
        `the weather is ${week.weather} so I'll make the most of it outdoors`,
        "building that Lego set I've been putting off",
        "absolutely nothing and I can't wait",
      ])
    }`
    : "";

  return `${www}\n${ll}\n${gfw}${atw}`;
}

// --- Retro board generation ---

const POSITIVE_NOTES = [
  "QA process caught a critical bug before production",
  "Team pulled together to hit the sprint deadline",
  "Good collaboration between data engineering and modelling",
  "Stakeholder feedback was positive on the dashboard demo",
  "Pair programming session was genuinely productive",
  "Got ahead of schedule on the data pipeline",
  "The new code review process is working well",
  "Successfully deployed the churn model to staging",
];

const NEGATIVE_NOTES = [
  "Too much ceremony — retros and kickoffs eat into actual work time",
  "Action items from last retro weren't followed through",
  "Waiting on another team for API access, blocking progress",
  "Scope creep on the compliance reporting tool",
  "Sprint goals were unrealistic again",
  "Too many context switches between work packages",
  "Requirements changed mid-sprint with no renegotiation",
  "Knowledge silos — only one person understands the feature store",
  "Estimation was way off, we need a better process for that",
  "Burnout risk — some team members are overloaded",
];

const ACTION_NOTES = [
  "Set up weekly knowledge-sharing sessions to break down silos",
  "Create a shared estimation checklist for sprint planning",
  "Push back on mid-sprint scope changes with a formal change request process",
  "Reduce retro time from 2.5 hours to 1 hour",
  "Schedule a workshop on the feature store for the whole team",
  "Assign a dedicated liaison for cross-team API dependencies",
  "Implement a mid-sprint check-in to catch blockers earlier",
  "Document the data pipeline architecture for onboarding",
];

// Tracks which actions have been carried over between sprints.
// Some actions will recur (suggesting they were never followed through),
// while others appear once and are "done" in subsequent sprints.
const carriedActions: string[] = [];

function generateRetro(_sprintNum: number, _week: WeekState): string {
  const lines: string[] = [];
  const header =
    "note_id\tauthor_id\tauthor\ttext\tcolumn_id\tcolumn\trank\tstack\n";
  lines.push(header.trim());

  // Each retro: 4-6 positives, 4-7 negatives, 3-5 actions
  const numPos = randInt(4, 6);
  const numNeg = randInt(4, 7);
  const numAct = randInt(3, 5);

  for (let i = 0; i < numPos; i++) {
    const author = pick(TEAM);
    lines.push(
      [
        uuid(),
        uuid(),
        author.name,
        pick(POSITIVE_NOTES),
        uuid(),
        "positive",
        randInt(1, 10),
        uuid(),
      ].join("\t"),
    );
  }

  for (let i = 0; i < numNeg; i++) {
    const author = pick(TEAM);
    // Sometimes reference unaddressed past actions
    const text = chance(0.3) && carriedActions.length > 0
      ? `We still haven't addressed: ${pick(carriedActions)}`
      : pick(NEGATIVE_NOTES);
    lines.push(
      [
        uuid(),
        uuid(),
        author.name,
        text,
        uuid(),
        "negative",
        randInt(1, 10),
        uuid(),
      ].join("\t"),
    );
  }

  // Carry over ~40% of previous actions (they weren't done)
  const newActions: string[] = [];
  for (let i = 0; i < numAct; i++) {
    const author = pick(TEAM);
    // 50% chance to reuse a carried action, 50% chance for a fresh one
    const text = chance(0.5) && carriedActions.length > 0
      ? pick(carriedActions)
      : pick(ACTION_NOTES);
    newActions.push(text);
    lines.push(
      [
        uuid(),
        uuid(),
        author.name,
        text,
        uuid(),
        "actions",
        randInt(1, 10),
        uuid(),
      ].join("\t"),
    );
  }

  // Update carried actions: keep the ones likely to recur
  carriedActions.length = 0;
  for (const a of newActions) {
    if (chance(0.4)) carriedActions.push(a);
  }

  return lines.join("\n") + "\n";
}

// --- Slack thread generation ---

function generateSlackThreads(): void {
  const weeks = generateWeekStates(13); // ~90 days ≈ 13 weeks
  const startDate = new Date("2026-04-13"); // a Monday ~90 days ago
  let threadCount = 0;

  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w];

    // Two threads per week: Monday (type 1) and Thursday (type 2)
    for (let day = 0; day < 2; day++) {
      const threadDate = new Date(startDate);
      threadDate.setDate(threadDate.getDate() + w * 7 + (day === 0 ? 0 : 3));
      const threadTs = Math.floor(threadDate.getTime() / 1000).toString();

      const botMessage = day === 0
        ? "How's your week going? Any blockers?"
        : "Hey team! What went well, lessons learned, goals for the week?";

      const replies: { author: string; text: string; ts: string }[] = [];

      for (const person of TEAM) {
        // Each person has a chance of being sick this week
        const isSick = chance(week.sicknessRate);

        // Not everyone replies to every thread (~85% participation rate)
        if (!isSick && chance(0.15)) continue;

        const text = day === 0
          ? generateUpdate1(person, week, isSick)
          : generateUpdate2(person, week, isSick);

        // Reply timestamp: a few hours after the bot message, with some spread
        const replyTs = (parseInt(threadTs) + randInt(3600, 28800)).toString();

        replies.push({ author: person.name, text, ts: replyTs });
      }

      const thread = { thread_ts: threadTs, bot_message: botMessage, replies };
      const filename = `data/slack/${threadDate.toISOString().slice(0, 10)}-${
        day === 0 ? "update" : "www"
      }.json`;

      Deno.mkdirSync("data/slack", { recursive: true });
      Deno.writeTextFileSync(filename, JSON.stringify(thread, null, 2));
      threadCount++;
    }
  }
  console.log(`Generated ${threadCount} Slack threads`);
}

// --- Main ---

if (import.meta.main) {
  // Slack
  Deno.mkdirSync("data/slack", { recursive: true });
  generateSlackThreads();

  // Retros — 4 sprints covering 12 weeks
  Deno.mkdirSync("data/retros", { recursive: true });
  const sprintWeeks = generateWeekStates(13);
  for (let s = 0; s < 4; s++) {
    // Use the end-of-sprint week state to influence the retro tone
    const sprintEndWeek = sprintWeeks[s * 3 + 2];
    const csv = generateRetro(s + 1, sprintEndWeek);
    const filename = `data/retros/sprint-${String(s + 1).padStart(2, "0")}.csv`;
    Deno.writeTextFileSync(filename, csv);
    console.log(`Generated ${filename}`);
  }

  console.log("\nSynthetic data ready in data/");
  console.log("Run: deno task load && deno task analyse && deno task app");
}
