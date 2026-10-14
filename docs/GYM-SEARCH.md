# Exercise search aliases

206 supported shorthand spellings: 135 base abbreviations/short names plus 71
common combinations of equipment, position, grip and movement shorthand.
These are search rules, not 206 newly created exercises. Existing exercise IDs,
logged sets and history remain unchanged. Regional shorthand is not universal.

Research references:

- https://www.hodgsonstrength.com/post/common-abbreviations-you-might-find-in-your-lifting-program
- https://risetrainingmn.com/blog/common-abbreviations-used-in-the-gym
- https://www.quickcoach.fit/exercise-abbreviations-and-names.html
- https://library.crossfit.com/free/pdf/CFJ_English_L2_TrainingGuide.pdf
- https://noexcusescrossfit.com/acronyms-abbreviations/

The combination entries compose individual definitions (for example, DB + RDL),
rather than claiming every composite is an independently standardized acronym.
Aliases also normalize word order, hyphens, plural forms and a few equivalent
names in the catalogue. Tokens are matched as words/prefixes, not arbitrary
substrings. BTN/behind the neck/behind head share a search representation;
OHP/overhead press/shoulder press/military press locate the existing variants.
Exact equipment and meaningful variation keywords still constrain the results.

`PU` shows both push-ups and pull-ups; `LP` shows leg press and lat pulldown. PC, HC, SC and SB also return their alternative exercise/equipment meanings. Ambiguous custom additions require a full name rather than guessing.
Searching generic `lat pulldown` includes existing cable and leverage-machine
entries even when their names omit `lat`. Cable/machine IDs remain distinct.
The app never automatically chooses an ambiguous exercise or changes old logs.

Results have two tiers. **Usual & standard variations** includes up to three
matching previously logged exercises first, ordered by last use then frequency;
it fills remaining places with simple variants across common equipment.
**Other variations** preserves the remaining matches and pagination. Equipment
filters and search words apply equally to both tiers. Ranking is recomputed from
each user's own saved history, including after a successful workout save.
The minus control on a usual/standard result demotes that exercise to Other
variations for that user; the preference syncs across paired devices. A plus
control restores it to automatic ranking. Demoted results remain searchable and
their workout history is unchanged.

An exact equivalent custom exercise name is reused if its normalized name and
equipment identify one existing entry. Several equivalent entries require an
explicit selection instead of silently merging their histories. Different setup,
position, grip, equipment or version remains a separate exercise.

## Supported spellings

| Shorthand     | Expanded words                           | Type        |
| ------------- | ---------------------------------------- | ----------- |
| bb            | barbell                                  | shorthand   |
| db            | dumbbell                                 | shorthand   |
| kb            | kettlebell                               | shorthand   |
| bw            | body weight                              | shorthand   |
| bwt           | body weight                              | shorthand   |
| b/w           | body weight                              | shorthand   |
| ez            | ez bar                                   | shorthand   |
| ezb           | ez bar                                   | shorthand   |
| ez barbell    | ez bar                                   | shorthand   |
| cb            | cable                                    | shorthand   |
| cab           | cable                                    | shorthand   |
| mach          | machine                                  | shorthand   |
| mch           | machine                                  | shorthand   |
| m/c           | machine                                  | shorthand   |
| sm            | smith machine                            | shorthand   |
| smith         | smith machine                            | shorthand   |
| pl            | plate loaded                             | shorthand   |
| mb            | medicine ball                            | shorthand   |
| med ball      | medicine ball                            | shorthand   |
| trx           | suspension                               | shorthand   |
| sb            | stability ball                           | shorthand   |
| swiss ball    | stability ball                           | shorthand   |
| oh            | overhead                                 | shorthand   |
| ohp           | overhead press                           | shorthand   |
| btn           | behind neck                              | shorthand   |
| bth           | behind head                              | shorthand   |
| btb           | behind back                              | shorthand   |
| sa            | single arm                               | shorthand   |
| s/a           | single arm                               | shorthand   |
| 1a            | single arm                               | shorthand   |
| sl            | single leg                               | shorthand   |
| s/l           | single leg                               | shorthand   |
| 1l            | single leg                               | shorthand   |
| alt           | alternating                              | shorthand   |
| inc           | incline                                  | shorthand   |
| incl          | incline                                  | shorthand   |
| dec           | decline                                  | shorthand   |
| decl          | decline                                  | shorthand   |
| cg            | close grip                               | shorthand   |
| c/g           | close grip                               | shorthand   |
| wg            | wide grip                                | shorthand   |
| w/g           | wide grip                                | shorthand   |
| ng            | neutral grip                             | shorthand   |
| n/g           | neutral grip                             | shorthand   |
| rg            | reverse grip                             | shorthand   |
| r/g           | reverse grip                             | shorthand   |
| ug            | underhand grip                           | shorthand   |
| og            | overhand grip                            | shorthand   |
| neut          | neutral grip                             | shorthand   |
| sup           | supinated grip                           | shorthand   |
| pro           | pronated grip                            | shorthand   |
| cs            | chest supported                          | shorthand   |
| c/s           | chest supported                          | shorthand   |
| hk            | half kneeling                            | shorthand   |
| tk            | tall kneeling                            | shorthand   |
| ffe           | front foot elevated                      | shorthand   |
| rfe           | rear foot elevated                       | shorthand   |
| fwd           | forward                                  | shorthand   |
| bwd           | backward                                 | shorthand   |
| rev           | reverse                                  | shorthand   |
| bilat         | bilateral                                | shorthand   |
| dl            | deadlift                                 | shorthand   |
| rdl           | romanian deadlift                        | shorthand   |
| sldl          | stiff leg deadlift                       | shorthand   |
| sdl           | sumo deadlift                            | shorthand   |
| sgrdl         | snatch grip romanian deadlift            | shorthand   |
| bss           | bulgarian split squat                    | shorthand   |
| rfess         | rear foot elevated split squat           | shorthand   |
| ffess         | front foot elevated split squat          | shorthand   |
| sq            | squat                                    | shorthand   |
| bs            | back squat                               | shorthand   |
| fs            | front squat                              | shorthand   |
| hbbs          | high bar back squat                      | shorthand   |
| lbbs          | low bar back squat                       | shorthand   |
| ohs           | overhead squat                           | shorthand   |
| bp            | bench press                              | shorthand   |
| cgbp          | close grip bench press                   | shorthand   |
| wgbp          | wide grip bench press                    | shorthand   |
| ibp           | incline bench press                      | shorthand   |
| dbp           | decline bench press                      | shorthand   |
| pp            | push press                               | shorthand   |
| pj            | push jerk                                | shorthand   |
| bor           | bent over row                            | shorthand   |
| csr           | chest supported row                      | shorthand   |
| tbr           | t bar row                                | shorthand   |
| lpd           | lat pulldown                             | shorthand   |
| lat pd        | lat pulldown                             | shorthand   |
| latpd         | lat pulldown                             | shorthand   |
| pd            | pulldown                                 | shorthand   |
| seated cr     | seated cable row                         | shorthand   |
| lat raise     | lateral raise                            | shorthand   |
| lat raises    | lateral raises                           | shorthand   |
| lr            | lateral raise                            | shorthand   |
| rd fly        | rear delt fly                            | shorthand   |
| rdf           | rear delt fly                            | shorthand   |
| fp            | face pull                                | shorthand   |
| ht            | hip thrust                               | shorthand   |
| gb            | glute bridge                             | shorthand   |
| gm            | good morning                             | shorthand   |
| le            | leg extension                            | shorthand   |
| lc            | leg curl                                 | shorthand   |
| seated lc     | seated leg curl                          | shorthand   |
| lying lc      | lying leg curl                           | shorthand   |
| leg ext       | leg extension                            | shorthand   |
| tri ext       | triceps extension                        | shorthand   |
| tri           | triceps                                  | shorthand   |
| tris          | triceps                                  | shorthand   |
| bi            | biceps                                   | shorthand   |
| bis           | biceps                                   | shorthand   |
| hc            | hammer curl                              | shorthand   |
| pc            | preacher curl                            | shorthand   |
| sc            | skull crusher                            | shorthand   |
| calf r        | calf raise                               | shorthand   |
| scr           | seated calf raise                        | shorthand   |
| kbs           | kettlebell swing                         | shorthand   |
| tgu           | turkish get up                           | shorthand   |
| ghr           | glute ham raise                          | shorthand   |
| ghd           | glute ham developer                      | shorthand   |
| hspu          | handstand push up                        | shorthand   |
| c2b           | chest to bar pull up                     | shorthand   |
| ctb           | chest to bar pull up                     | shorthand   |
| t2b           | toes to bar                              | shorthand   |
| ttb           | toes to bar                              | shorthand   |
| kte           | knees to elbows                          | shorthand   |
| mu            | muscle up                                | shorthand   |
| bmu           | bar muscle up                            | shorthand   |
| rmu           | ring muscle up                           | shorthand   |
| bj            | box jump                                 | shorthand   |
| bjo           | box jump over                            | shorthand   |
| du            | double under                             | shorthand   |
| wb            | wall ball                                | shorthand   |
| situp         | sit up                                   | shorthand   |
| pullup        | pull up                                  | shorthand   |
| pushup        | push up                                  | shorthand   |
| chinup        | chin up                                  | shorthand   |
| bb bp         | barbell bench press                      | combination |
| db bp         | dumbbell bench press                     | combination |
| bb inc bp     | barbell incline bench press              | combination |
| db inc bp     | dumbbell incline bench press             | combination |
| bb dec bp     | barbell decline bench press              | combination |
| db dec bp     | dumbbell decline bench press             | combination |
| bb cgbp       | barbell close grip bench press           | combination |
| bb wgbp       | barbell wide grip bench press            | combination |
| sm bp         | smith machine bench press                | combination |
| sm inc bp     | smith machine incline bench press        | combination |
| bb ohp        | barbell overhead press                   | combination |
| db ohp        | dumbbell overhead press                  | combination |
| kb ohp        | kettlebell overhead press                | combination |
| sm ohp        | smith machine overhead press             | combination |
| btn ohp       | behind neck overhead press               | combination |
| bb btn ohp    | barbell behind neck overhead press       | combination |
| sm btn ohp    | smith machine behind neck overhead press | combination |
| sa db ohp     | single arm dumbbell overhead press       | combination |
| hk db ohp     | half kneeling dumbbell overhead press    | combination |
| bb pp         | barbell push press                       | combination |
| bb rdl        | barbell romanian deadlift                | combination |
| db rdl        | dumbbell romanian deadlift               | combination |
| kb rdl        | kettlebell romanian deadlift             | combination |
| sl db rdl     | single leg dumbbell romanian deadlift    | combination |
| sl kb rdl     | single leg kettlebell romanian deadlift  | combination |
| sm rdl        | smith machine romanian deadlift          | combination |
| bb sldl       | barbell stiff leg deadlift               | combination |
| db sldl       | dumbbell stiff leg deadlift              | combination |
| bb dl         | barbell deadlift                         | combination |
| bb sdl        | barbell sumo deadlift                    | combination |
| bb bs         | barbell back squat                       | combination |
| bb fs         | barbell front squat                      | combination |
| db bss        | dumbbell bulgarian split squat           | combination |
| kb bss        | kettlebell bulgarian split squat         | combination |
| db rfess      | dumbbell rear foot elevated split squat  | combination |
| bb gm         | barbell good morning                     | combination |
| bb ht         | barbell hip thrust                       | combination |
| sm ht         | smith machine hip thrust                 | combination |
| sl gb         | single leg glute bridge                  | combination |
| sl ht         | single leg hip thrust                    | combination |
| bb bor        | barbell bent over row                    | combination |
| db bor        | dumbbell bent over row                   | combination |
| sa db row     | single arm dumbbell row                  | combination |
| cs db row     | chest supported dumbbell row             | combination |
| cs bb row     | chest supported barbell row              | combination |
| sa cable row  | single arm cable row                     | combination |
| cg lpd        | close grip lat pulldown                  | combination |
| wg lpd        | wide grip lat pulldown                   | combination |
| ng lpd        | neutral grip lat pulldown                | combination |
| sa lpd        | single arm lat pulldown                  | combination |
| btn lpd       | behind neck lat pulldown                 | combination |
| mach lpd      | machine lat pulldown                     | combination |
| cb lpd        | cable lat pulldown                       | combination |
| db lr         | dumbbell lateral raise                   | combination |
| cb lr         | cable lateral raise                      | combination |
| sa cb lr      | single arm cable lateral raise           | combination |
| db rdf        | dumbbell rear delt fly                   | combination |
| cb rdf        | cable rear delt fly                      | combination |
| cb fp         | cable face pull                          | combination |
| db hc         | dumbbell hammer curl                     | combination |
| db pc         | dumbbell preacher curl                   | combination |
| ez pc         | ez bar preacher curl                     | combination |
| ez sc         | ez bar skull crusher                     | combination |
| db sc         | dumbbell skull crusher                   | combination |
| oh tri ext    | overhead triceps extension               | combination |
| db oh tri ext | dumbbell overhead triceps extension      | combination |
| cb oh tri ext | cable overhead triceps extension         | combination |
| sa tri ext    | single arm triceps extension             | combination |
| sl le         | single leg leg extension                 | combination |
| sl lc         | single leg leg curl                      | combination |
| sl calf raise | single leg calf raise                    | combination |

Catalogue coverage check: 196 of the 206 spellings currently match existing catalogue exercises. The remaining more specific variants stay searchable for future custom entries; no substitute exercise or new database row is generated.
