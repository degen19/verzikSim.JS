// Nylocas mechanics & behavior, for the "View mechanics & behavior" section (same layout as Sotetseg's / Xarpus's).
// Keep in step with engine/nylo.js (the sim) and engine/nylosolve.js (the solver).
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const NYLO_MECHANICS = {
  intro: [
    'How the Nylocas sim plays the boss (Nylocas Vasilias), tick by tick (0.6s). Players are set up in the Nylocas tab, gear comes from the Gear tab.',
    'N1 is the tick his form changes, N2 the next tick (the earliest anyone can attack in a form), and so on. Boss time runs from his spawn to the room\'s end; with wave times added, room time = waves + boss.',
  ],
  sections: [
    { title: 'The boss', rows: [
      R('HP', 'All', '2500 in 5s; 2187 in 4s; 1875 in trios, duos and solos.'),
      R('Stats', 'All', 'Defence 50, Magic 20, every defensive bonus 0. Size 4x4 (a scythe hits him 3 times).'),
      R('Forms', 'All', 'White (melee), green (ranged), blue (magic). He spawns white for 9 ticks, then turns into one of the other two at random (50 / 50); every form after that lasts 10 ticks and is one of the two he isn\'t. Only the matching style damages him - a wrong-style hit heals him and is reflected.'),
      R('First attack in a form', 'All', 'Players click as the form changes, so the earliest attack in a form is N2 (spawn t286: first attacks t287). The style is checked when the attack is made - a hit that lands after he\'s changed still counts.'),
      R('His attacks', '2-5', 'On each form\'s 3rd and 7th ticks (2nd and 6th in the spawn form), at a random player who isn\'t under him, in his form\'s style. Max 70; prayed: melee blocked, ranged / magic up to 17. Melee lands the next tick, ranged / magic 2 ticks later.'),
      R('Instance cycle', 'All', 'The room runs on a 4-tick cycle. He spawns on an i1 and shows up 2 ticks later. The room ends the tick after the first i4 at or after his death animation (5 ticks from the killing hit, 4 with overkill) - boss times are always a multiple of 4 ticks.'),
      R('Wave times', 'All', 'Optional: the waves before him as times with how often each happens (whole ticks, 2.4s apart, adding to 100%). Each raid draws one; it also runs down surge cooldowns brought from earlier rooms.', 'Wave times (each set)'),
    ] },
    { title: 'Attacks by form', rows: [
      R('Melee (white)', 'All', 'Scythe (5 ticks) in their melee gear on Piety / their prayer. Melee specs go here (claws, BGS, halberd).'),
      R('Magic (blue)', 'All', 'Eye of ayak (3 ticks) at 112 Magic on Augury, in their best mage gear for it. An Ayak that would push their next attack past the next form\'s first attack tick is skipped (they wait). Tome specs and buffed tome autos go here.'),
      R('Ranged (green)', 'All', 'Blowpipe / Ascension crossbows / thrown dragon darts (2 ticks, the best they have) and Twisted bow (5 ticks) at 112 Ranged on Rigour. The sequence depends on when their first attack in the form is: N2 - 4 fast hits then Twisted bow; N3 - tbow, fast, tbow; N4 - 3 fast then tbow; later - Twisted bows. All end with the last Twisted bow on the form\'s last tick.', 'Their 2-tick weapon: Gear tab'),
      R('Darts only', 'All', 'A player whose only 2-tick weapon is thrown dragon darts plays tbow, dart, tbow from N2 or N3 and Twisted bows otherwise - three dart hits are worth less than one Twisted bow hit.'),
      R('Ascension crossbows', 'All', 'Diamond bolts (e): 5.5% Armour Piercing procs - can\'t miss, 0-115% of their max.'),
      R('Stop sequence at HP', 'All', 'Below this share of his HP, a green form\'s sequence (picked by the tick of their first attack: N2 / N3 / N4) becomes Twisted bows only - so they\'re free for the next form sooner when he\'s close to dying. The raid recap marks the Twisted bow where a player stops.', 'Stop sequence at HP (per player, per first-attack tick)'),
      R('Hit delays', 'All', 'Scythe 1, Twisted bow 2, blowpipe / crossbows 2, Ayak 2, tome 2, ZCB 2, shadow 3.'),
    ] },
    { title: 'Specs', rows: [
      R('Opener', 'All', 'Their first attack: BGS or claws on the spawn. A Crystal halberd opener goes on their second attack (a scythe first). Anyone doing one or more melee specs opens with one of them.', 'Opening spec'),
      R('Damage specs', 'All', 'In list order, each when his form allows: claws / halberd in melee, tome in magic, ZCB in place of a Twisted bow. Never their first attack (nor before a halberd opener). Specs they have no weapon for are dropped.', 'Second spec'),
      R('Spec costs', 'All', 'BGS and claws 50%, halberd 30%, ZCB 75%, tome 50% (a spec plus buffed autos). Spec regens 10% every 50 ticks, from their first spec when they start under 100%.', 'Start spec (95 / 100%)'),
      R('Claws', 'All', 'A claw spec (after the opener) only goes when it gains a usable tick - another attack this form, or an earlier one in the next - or he\'s likely to die this cycle or the next and the claw can\'t be the killing blow.'),
      R('BGS', 'All', 'Lowers his Defence by the damage. A backup BGS (optional, one player) goes after the opening BGSs while his Defence is still at or above its threshold.', 'Backup BGS; at Defence'),
      R('Tome', 'All', 'Zorya\'s tome spec in a magic form, then buffed autos (2 ticks) for 30 seconds, carried over between his magic forms. Not for solos (they only attack on ticks 5 and 10).'),
      R('Tome tick fix', 'All', 'While a tome hit is still to come, in his green forms they pick blowpipes / Twisted bows for the most damage that still leaves them free in time to fit it all into a magic form next. When he\'s likely to die this form or the next (and it isn\'t magic), they drop the tome and claw instead. Always on.'),
      R('Fallback at 20%', 'All', 'When he\'s melee at 20% of his HP or less, their remaining tome and ZCB specs become claw specs (if they have claws) - no magic or ranged form may come in time.'),
      R('Surge', 'All', 'A spec surge (+25%) after their first spec, once their cooldown from the rooms before is up and it won\'t waste spec.', 'Surge; Surge potions'),
    ] },
    { title: 'Cross praying', rows: [
      R('Prediction', '2-5', 'Nobody knows his next form until it shows. Between forms they wear the gear of the form they predict and pray for the other one: he\'s magic or melee -> they predict ranged; he\'s ranged -> melee; a tome spec planned (or buffed autos left) -> magic.'),
      R('Right', '2-5', 'They only flick prayers - their attack is as normal.'),
      R('Wrong', '2-5', 'Their prayers are already right. A tick before their first attack in the form they get Max switches into his style\'s gear per tick of lead time - the weapon first, then the items that add the most to that attack together (full void counts as a set). Their first attack is on that partial set; they finish the rest of their switches by their second.', 'Max melee / range / mage switches on wrong prediction (1-8 each)'),
      R('Wrong on N2', '2-5', 'A wrong prediction with their attack due on N2 (not the spawn) moves it to N3: nobody can switch and still click in time.'),
    ] },
    { title: 'Damage to players and veng', rows: [
      R('Players', 'All', '99 HP, no food. Defence 118 / Magic 112 on their prayer, in the gear they have on for his form.'),
      R('Veng', 'All', '75% of a hit back to him (any form), the tick it lands. Everyone starts with it up; recast as soon as the 50-tick cooldown allows.'),
      R('Off prayer for veng', 'All', 'With veng up and more than 70 HP, they take his ranged / magic hit off prayer to proc it. Can be turned off (solos usually stay on prayer).', 'Off pray veng if healthy'),
      R('Takeoffs', 'All', 'Taking a hit off prayer for veng with their next attack at least 2 ticks after his, they wear their least defensive set for it (his melee / ranged: their mage gear; his magic: their melee gear).', 'Takeoffs'),
      R('Thralls', 'All', 'Melee thralls, one each from their first attack: 0-3 every 4 ticks, can\'t miss - damage only in his melee form.'),
      R('Blood fury', 'All', 'Amulet of blood fury as their melee neck: 20% of melee hits heal them 30% of the damage.'),
    ] },
    { title: 'Under him', rows: [
      R('Going under', '2-5', 'In his ranged / magic forms, on ticks 2-4 and 6-8 he can\'t target them; they attack only on ticks 5 and 10 with their strongest weapon (shadow, else Twisted bow / Ayak). They go under when they can\'t take a prayed hit (17 HP or less), or with no veng when it costs them nothing.'),
      R('Heal Other', '2-5', 'Under him, once a form on its 2nd tick, they Heal Other a teammate: one with veng up who could then take it off prayer safely, else one who\'d have veng by his attack, else the lowest at 30 or less. Redemption on a proc (+24 HP), then a restore for their prayer.'),
      R('Healer Tech', 'Duo', 'One player (optional) stays under him every ranged / magic form, Heal Others their teammate whenever they\'re down 24+ (every 3 ticks at most), then a locator orb and redemption (+24) and a restore - while restore doses last. Their veng goes on their teammate (Vengeance Other) whenever the teammate\'s is down.', 'Healer Tech; restore doses'),
      R('Solos', 'Solo', 'After his first form they\'re under him on each form\'s ticks 1-4 and 6-9, attacking only on 5 and 10 (scythe / Twisted bow / shadow, else Ayak, or a spec). He attacks once a form, on its 5th tick. Too low for a prayed hit: locator orb, redemption (+24) and a restore, while doses last.'),
    ] },
    { title: 'Solver and optimizer', rows: [
      R('Solver', 'All', 'Searches each player\'s opener, specs, start spec, surge and (optionally) the backup BGS and swaps between players, in rounds - quick tests on a few raids, the promising changes on more. Only plans that work are tried: a melee spec means one is the opener, and the spec costs must fit start spec + surge + regen. Then the top 3 setups\' Stop sequence thresholds: each player and sequence on its own, then all together - kept only when together they\'re clearly faster on the same raids, and then played (the setup\'s times, Show raid and Use all carry them).', 'Solver: what to search; effort'),
      R('Optimizer', 'All', 'Keeps the setup and tests the backup BGS and the Stop sequence thresholds on their own and all together, on the same raids - a backup only stays if it\'s actually better.'),
      R('Sets', 'All', 'Sets A / B / C hold three setups; the report runs the ticked ones on the same raids so they compare fairly.', 'Sets; Report: sets to run'),
    ] },
  ],
};
