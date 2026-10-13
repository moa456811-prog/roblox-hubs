/** Factual observations extracted statically from the pinned QuestData.lua.
 * Original data representation; no third-party functions, loaders or UI copied.
 * Source inspection is not live-game verification. See provenance limitations. */
export type BloxFruitsQuestFact = {
  minLevel: number; maxLevel?: number; questId: string; tier: number; target: string;
  questPosition: readonly [number, number, number]; enemyPosition: readonly [number, number, number];
  sourceLines: readonly [number, number]; positionWarning?: string;
};

export const BLOX_FRUITS_FIRST_SEA_QUEST_SOURCE = {
  "id": "bf-first-sea-quest-facts-2026",
  "url": "https://gist.github.com/nguyennhlat2004/534da6d9966efbb437dd1c6aa3c7e61b/011de5b645c5d19aaba328927c0294c97701c6e1",
  "filename": "QuestData.lua",
  "revision": "011de5b645c5d19aaba328927c0294c97701c6e1",
  "fileBlob": "04f89b96d478837c87d460a8d10bd20c4922170f",
  "sha256": "f2903b55971c0129c68dd428bad20d41255e28681a324262006ad01c492720cf",
  "sourceDate": "2026-04-30",
  "placeIds": [
    "2753915549"
  ],
  "basis": "source-backed",
  "liveVerified": false,
  "license": "No license declared; only factual names, IDs, numeric thresholds and positions extracted. No source functions copied.",
  "limitations": [
    "Only 26 first-sea rows; no second/third-sea fallback coverage.",
    "Coordinates are source observations, not certified current positions or path reachability. Validate a matching live giver and bound movement before invoking a quest.",
    "SkyExp2Quest has a coordinate conflict with an independent historical source. Do not silently treat its positive-X position as confirmed.",
    "The final source row starts at level 650 without an upper bound, but is only applicable while in the first-sea PlaceId."
  ]
} as const;

export const BLOX_FRUITS_FIRST_SEA_QUESTS: readonly BloxFruitsQuestFact[] = [
  {
    "minLevel": 1,
    "questId": "BanditQuest1",
    "tier": 1,
    "target": "Bandit",
    "questPosition": [
      1059.37195,
      15.4495068,
      1550.4231
    ],
    "enemyPosition": [
      1045.962646484375,
      27.00250816345215,
      1560.8203125
    ],
    "sourceLines": [
      5,
      11
    ],
    "maxLevel": 9
  },
  {
    "minLevel": 10,
    "questId": "JungleQuest",
    "tier": 1,
    "target": "Monkey",
    "questPosition": [
      -1598.08911,
      35.5501175,
      153.377838
    ],
    "enemyPosition": [
      -1448.51806640625,
      67.85301208496094,
      11.46579647064209
    ],
    "sourceLines": [
      12,
      18
    ],
    "maxLevel": 14
  },
  {
    "minLevel": 15,
    "questId": "JungleQuest",
    "tier": 2,
    "target": "Gorilla",
    "questPosition": [
      -1598.08911,
      35.5501175,
      153.377838
    ],
    "enemyPosition": [
      -1129.8836669921875,
      40.46354675292969,
      -525.4237060546875
    ],
    "sourceLines": [
      19,
      25
    ],
    "maxLevel": 29
  },
  {
    "minLevel": 30,
    "questId": "BuggyQuest1",
    "tier": 1,
    "target": "Pirate",
    "questPosition": [
      -1141.07483,
      4.10001802,
      3831.5498
    ],
    "enemyPosition": [
      -1201.08386,
      40.6289215,
      3857.59814453125
    ],
    "sourceLines": [
      26,
      32
    ],
    "maxLevel": 39
  },
  {
    "minLevel": 40,
    "questId": "BuggyQuest1",
    "tier": 2,
    "target": "Brute",
    "questPosition": [
      -1141.07483,
      4.10001802,
      3831.5498
    ],
    "enemyPosition": [
      -1146.49658203125,
      96.09368133544922,
      4312.13818359375
    ],
    "sourceLines": [
      33,
      39
    ],
    "maxLevel": 59
  },
  {
    "minLevel": 60,
    "questId": "DesertQuest",
    "tier": 1,
    "target": "Desert Bandit",
    "questPosition": [
      894.488647,
      5.14000702,
      4392.43359
    ],
    "enemyPosition": [
      924.7998046875,
      6.44867467880249,
      4481.5859375
    ],
    "sourceLines": [
      40,
      46
    ],
    "maxLevel": 74
  },
  {
    "minLevel": 75,
    "questId": "DesertQuest",
    "tier": 2,
    "target": "Desert Officer",
    "questPosition": [
      894.488647,
      5.14000702,
      4392.43359
    ],
    "enemyPosition": [
      1547.1510009765625,
      14.452038764953613,
      4381.80029296875
    ],
    "sourceLines": [
      47,
      53
    ],
    "maxLevel": 89
  },
  {
    "minLevel": 90,
    "questId": "SnowQuest",
    "tier": 1,
    "target": "Snow Bandit",
    "questPosition": [
      1389.74451,
      88.1519318,
      -1298.90796
    ],
    "enemyPosition": [
      1354.347900390625,
      87.27277374267578,
      -1393.946533203125
    ],
    "sourceLines": [
      54,
      60
    ],
    "maxLevel": 99
  },
  {
    "minLevel": 100,
    "questId": "SnowQuest",
    "tier": 2,
    "target": "Snowman",
    "questPosition": [
      1389.74451,
      88.1519318,
      -1298.90796
    ],
    "enemyPosition": [
      1201.6412353515625,
      144.57958984375,
      -1550.0670166015625
    ],
    "sourceLines": [
      61,
      67
    ],
    "maxLevel": 119
  },
  {
    "minLevel": 120,
    "questId": "MarineQuest2",
    "tier": 1,
    "target": "Chief Petty Officer",
    "questPosition": [
      -5039.58643,
      27.3500385,
      4324.68018
    ],
    "enemyPosition": [
      -4881.23095703125,
      22.65204429626465,
      4273.75244140625
    ],
    "sourceLines": [
      68,
      74
    ],
    "maxLevel": 149
  },
  {
    "minLevel": 150,
    "questId": "SkyQuest",
    "tier": 1,
    "target": "Sky Bandit",
    "questPosition": [
      -4839.53027,
      716.368591,
      -2619.44165
    ],
    "enemyPosition": [
      -4953.20703125,
      295.74420166015625,
      -2899.22900390625
    ],
    "sourceLines": [
      75,
      81
    ],
    "maxLevel": 174
  },
  {
    "minLevel": 175,
    "questId": "SkyQuest",
    "tier": 2,
    "target": "Dark Master",
    "questPosition": [
      -4839.53027,
      716.368591,
      -2619.44165
    ],
    "enemyPosition": [
      -5259.8447265625,
      391.3976745605469,
      -2229.035400390625
    ],
    "sourceLines": [
      82,
      88
    ],
    "maxLevel": 189
  },
  {
    "minLevel": 190,
    "questId": "PrisonerQuest",
    "tier": 1,
    "target": "Prisoner",
    "questPosition": [
      5308.93115,
      1.65517521,
      475.120514
    ],
    "enemyPosition": [
      5098.9736328125,
      -0.3204058110713959,
      474.2373352050781
    ],
    "sourceLines": [
      89,
      95
    ],
    "maxLevel": 209
  },
  {
    "minLevel": 210,
    "questId": "PrisonerQuest",
    "tier": 2,
    "target": "Dangerous Prisoner",
    "questPosition": [
      5308.93115,
      1.65517521,
      475.120514
    ],
    "enemyPosition": [
      5654.5634765625,
      15.633401870727539,
      866.2991943359375
    ],
    "sourceLines": [
      96,
      102
    ],
    "maxLevel": 249
  },
  {
    "minLevel": 250,
    "questId": "ColosseumQuest",
    "tier": 1,
    "target": "Toga Warrior",
    "questPosition": [
      -1580.04663,
      6.35000277,
      -2986.47534
    ],
    "enemyPosition": [
      -1820.21484375,
      51.68385696411133,
      -2740.6650390625
    ],
    "sourceLines": [
      103,
      109
    ],
    "maxLevel": 274
  },
  {
    "minLevel": 275,
    "questId": "ColosseumQuest",
    "tier": 2,
    "target": "Gladiator",
    "questPosition": [
      -1580.04663,
      6.35000277,
      -2986.47534
    ],
    "enemyPosition": [
      -1292.838134765625,
      56.380882263183594,
      -3339.031494140625
    ],
    "sourceLines": [
      110,
      116
    ],
    "maxLevel": 299
  },
  {
    "minLevel": 300,
    "questId": "MagmaQuest",
    "tier": 1,
    "target": "Military Soldier",
    "questPosition": [
      -5313.37012,
      10.9500084,
      8515.29395
    ],
    "enemyPosition": [
      -5411.16455078125,
      11.081554412841797,
      8454.29296875
    ],
    "sourceLines": [
      117,
      123
    ],
    "maxLevel": 324
  },
  {
    "minLevel": 325,
    "questId": "MagmaQuest",
    "tier": 2,
    "target": "Military Spy",
    "questPosition": [
      -5313.37012,
      10.9500084,
      8515.29395
    ],
    "enemyPosition": [
      -5802.8681640625,
      86.26241302490234,
      8828.859375
    ],
    "sourceLines": [
      124,
      130
    ],
    "maxLevel": 374
  },
  {
    "minLevel": 375,
    "questId": "FishmanQuest",
    "tier": 1,
    "target": "Fishman Warrior",
    "questPosition": [
      61122.65234375,
      18.497442245483,
      1569.3997802734
    ],
    "enemyPosition": [
      60878.30078125,
      18.482830047607422,
      1543.7574462890625
    ],
    "sourceLines": [
      131,
      137
    ],
    "maxLevel": 399
  },
  {
    "minLevel": 400,
    "questId": "FishmanQuest",
    "tier": 2,
    "target": "Fishman Commando",
    "questPosition": [
      61122.65234375,
      18.497442245483,
      1569.3997802734
    ],
    "enemyPosition": [
      61922.6328125,
      18.482830047607422,
      1493.934326171875
    ],
    "sourceLines": [
      138,
      144
    ],
    "maxLevel": 449
  },
  {
    "minLevel": 450,
    "questId": "SkyExp1Quest",
    "tier": 1,
    "target": "God's Guard",
    "questPosition": [
      -4721.88867,
      843.874695,
      -1949.96643
    ],
    "enemyPosition": [
      -4710.04296875,
      845.2769775390625,
      -1927.3079833984375
    ],
    "sourceLines": [
      145,
      151
    ],
    "maxLevel": 474
  },
  {
    "minLevel": 475,
    "questId": "SkyExp1Quest",
    "tier": 2,
    "target": "Shanda",
    "questPosition": [
      -4721.88867,
      843.874695,
      -1949.96643
    ],
    "enemyPosition": [
      -5185.32275390625,
      913.12158203125,
      -1583.772216796875
    ],
    "sourceLines": [
      152,
      158
    ],
    "maxLevel": 524
  },
  {
    "minLevel": 525,
    "questId": "SkyExp2Quest",
    "tier": 1,
    "target": "Royal Squad",
    "questPosition": [
      7952.00098,
      5546.33008,
      -2037.5
    ],
    "enemyPosition": [
      7620.2724609375,
      5545.873046875,
      -1567.8311767578125
    ],
    "sourceLines": [
      159,
      165
    ],
    "maxLevel": 549,
    "positionWarning": "Coordinates conflict with the negative-X SkyExp2Quest giver observed in an independent historical source; require a matching live NPC before using either position."
  },
  {
    "minLevel": 550,
    "questId": "SkyExp2Quest",
    "tier": 2,
    "target": "Royal Soldier",
    "questPosition": [
      7952.00098,
      5546.33008,
      -2037.5
    ],
    "enemyPosition": [
      7614.7275390625,
      5606.96435546875,
      -1455.2581787109375
    ],
    "sourceLines": [
      166,
      172
    ],
    "maxLevel": 624,
    "positionWarning": "Coordinates conflict with the negative-X SkyExp2Quest giver observed in an independent historical source; require a matching live NPC before using either position."
  },
  {
    "minLevel": 625,
    "questId": "FountainQuest",
    "tier": 1,
    "target": "Galley Pirate",
    "questPosition": [
      5259.81982,
      37.3500175,
      4050.0293
    ],
    "enemyPosition": [
      5551.02197265625,
      78.90135192871094,
      3930.412841796875
    ],
    "sourceLines": [
      173,
      179
    ],
    "maxLevel": 649
  },
  {
    "minLevel": 650,
    "questId": "FountainQuest",
    "tier": 2,
    "target": "Galley Captain",
    "questPosition": [
      5259.81982,
      37.3500175,
      4050.0293
    ],
    "enemyPosition": [
      5441.95166015625,
      42.50205993652344,
      4950.09375
    ],
    "sourceLines": [
      180,
      186
    ]
  }
];
